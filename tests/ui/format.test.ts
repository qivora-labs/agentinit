import { describe, expect, it } from 'vitest';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import type { RegistryNotice } from '../../src/registry/resolve.js';
import { fragmentName } from '../../src/ui/catalog.js';
import {
  NO_FRAMEWORK_NOTICE,
  NO_FRAMEWORK_SUMMARY,
  formatConfidence,
  formatLowConfidence,
  formatRegistryNotice,
  formatSummary,
  formatSummaryTitle,
  formatWarning,
} from '../../src/ui/format.js';
import { createTheme } from '../../src/ui/theme.js';
import { sampleDraft } from './draft.js';

let registry: Registry | undefined;

async function bundledRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

const plain = createTheme(false, true);
const color = createTheme(true, true, true);

const notices: readonly { readonly name: string; readonly notice: RegistryNotice; readonly text: string }[] = [
  {
    name: 'unsupported version',
    notice: {
      kind: 'unsupported-version',
      package: 'tailwindcss',
      version: '3.4.17',
      fragmentId: 'tailwind',
    },
    text: 'tailwindcss@3.4.17 detected — no matching rules yet.',
  },
  {
    name: 'unknown version',
    notice: { kind: 'unknown-version', package: 'tailwindcss', fragmentId: 'tailwind' },
    text: 'tailwindcss version is unknown — included Tailwind CSS.',
  },
  {
    name: 'required fragment',
    notice: { kind: 'required-by', fragmentId: 'tailwind', requiredBy: 'shadcn' },
    text: 'Tailwind CSS was added because shadcn/ui requires it.',
  },
  {
    name: 'incompatible library',
    notice: { kind: 'incompatible', fragmentId: 'zustand' },
    text: 'Zustand was skipped — it targets a different framework.',
  },
  {
    name: 'missing framework',
    notice: { kind: 'no-framework' },
    text: NO_FRAMEWORK_NOTICE,
  },
];

describe('formatRegistryNotice', () => {
  it.each(notices)('formats $name', async ({ notice, text }) => {
    expect(formatRegistryNotice(notice, await bundledRegistry())).toBe(text);
  });

  it('falls back to the fragment id when the registry has no name', async () => {
    const notice: RegistryNotice = { kind: 'incompatible', fragmentId: 'missing' };
    expect(formatRegistryNotice(notice, await bundledRegistry())).toBe(
      'missing was skipped — it targets a different framework.',
    );
  });
});

describe('formatWarning', () => {
  it('keeps an unresolved tsconfig message', () => {
    const message = 'Could not resolve tsconfig extends "tsconfig.base.json". Using options from tsconfig.json.';
    expect(formatWarning({ kind: 'unresolved-tsconfig-extends', message })).toBe(message);
  });

  it('warns that a legacy agent file still loads', () => {
    expect(formatWarning({ kind: 'legacy-agent-file', path: '.cursorrules' })).toBe(
      '.cursorrules still loads alongside the new rules and will not be modified.',
    );
  });
});

describe('formatLowConfidence', () => {
  it('names the flat architecture that --yes will use', async () => {
    const bundled = await bundledRegistry();
    expect(formatLowConfidence({ kind: 'low-confidence-architecture', confidence: 0.5 }, bundled)).toBe(
      `Architecture confidence is 0.5, below 0.7. Using ${fragmentName(bundled, 'flat')}.`,
    );
  });
});

describe('formatConfidence', () => {
  it.each([
    [0.875, '0.875'],
    [0.75, '0.75'],
    [0.5, '0.5'],
    [0.7, '0.7'],
    [1, '1'],
  ] as const)('formats %s as %s', (value, text) => {
    expect(formatConfidence(value)).toBe(text);
  });
});

describe('formatSummaryTitle', () => {
  it.each([
    ['next15-src', 'Detected next15-src'],
    [null, 'Detected project'],
    ['', 'Detected project'],
    ['  ', 'Detected project'],
  ] as const)('formats %j as %s', (name, title) => {
    expect(formatSummaryTitle(name)).toBe(title);
  });
});

describe('formatSummary', () => {
  it('snapshots the next15-src card with four body rows and no Versions block', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      name: 'next15-src',
      frameworks: ['nextjs-app-router'],
      libraries: [],
      packages: {
        next: '16.3.0',
        react: '19.0.0',
        'react-dom': '19.0.0',
        typescript: '5.9.0',
      },
      language: 'typescript-strict',
      architecture: { id: 'flat', confidence: 0.875 },
      packageManager: 'pnpm',
      srcDir: 'src',
    });
    const text = formatSummary({ draft, registry: bundled, notices: [], warnings: [], theme: plain });
    const card = `${formatSummaryTitle(draft.name)}\n${text}`;
    await expect(card).toMatchFileSnapshot('../__snapshots__/ui/next15-src-summary.txt');
    expect(text.split('\n')).toHaveLength(4);
    expect(text).not.toContain('Versions:');
    expect(text).not.toContain('react-dom');
  });

  it('shows none detected and the base-rules notice when there is no framework', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      frameworks: [],
      libraries: [],
      packages: {},
      packageManager: 'npm',
      srcDir: '',
      language: 'typescript',
      architecture: { id: 'flat', confidence: 0.5 },
    });
    expect(formatSummary({ draft, registry: bundled, notices: [], warnings: [], theme: plain })).toBe(
      [
        `Framework     ${NO_FRAMEWORK_SUMMARY}`,
        'Language      TypeScript',
        `Architecture  ${fragmentName(bundled, 'flat')}  unsure (0.5)`,
        'Tooling       npm · project root',
        `Notes         ${plain.glyphs.warn} ${NO_FRAMEWORK_NOTICE}`,
      ].join('\n'),
    );
  });

  it('shows likely without a number at confidence ≥ 0.7', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      libraries: [],
      architecture: { id: 'flat', confidence: 0.7 },
      packages: { next: '16.3.0', typescript: '5.9.0' },
    });
    const text = formatSummary({ draft, registry: bundled, notices: [], warnings: [], theme: plain });
    expect(text).toContain(`Architecture  ${fragmentName(bundled, 'flat')}  likely`);
    expect(text).not.toContain('0.7');
  });

  it('shows the confidence number in the warning color below 0.7', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      libraries: [],
      architecture: { id: 'flat', confidence: 0.55 },
      packages: { next: '16.3.0', typescript: '5.9.0' },
    });
    const text = formatSummary({ draft, registry: bundled, notices: [], warnings: [], theme: color });
    expect(text).toContain(color.warn('unsure (0.55)'));
    expect(text).not.toContain('likely');
  });

  it('omits version text when a detection package has no resolved version', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      libraries: ['vitest'],
      packages: { next: '16.3.0', typescript: '5.9.0' },
    });
    const text = formatSummary({ draft, registry: bundled, notices: [], warnings: [], theme: plain });
    expect(text).toContain(`Libraries     ${fragmentName(bundled, 'vitest')}`);
    expect(text).not.toContain('null');
    expect(text).not.toMatch(/vitest\s+\d/);
  });

  it('lists stack rows, package versions beside fragments, and Notes', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      frameworks: ['nextjs-app-router', 'nextjs-pages-router'],
      libraries: ['vitest', 'tailwind'],
      packages: { react: '19.0.0', next: '16.3.0', typescript: '5.9.0' },
      srcDir: 'src',
      packageManager: 'pnpm',
    });
    const text = formatSummary({
      draft,
      registry: bundled,
      notices: [
        {
          kind: 'unsupported-version',
          package: 'tailwindcss',
          version: '3.4.17',
          fragmentId: 'tailwind',
        },
      ],
      warnings: [{ kind: 'legacy-agent-file', path: '.cursorrules' }],
      theme: plain,
    });
    expect(text).toBe(
      [
        `Framework     ${fragmentName(bundled, 'nextjs-app-router')}  next 16.3, ${fragmentName(bundled, 'nextjs-pages-router')}  next 16.3`,
        `Libraries     ${fragmentName(bundled, 'vitest')}, ${fragmentName(bundled, 'tailwind')}`,
        'Language      TypeScript · strict  typescript 5.9',
        `Architecture  ${fragmentName(bundled, 'feature-based')}  likely`,
        'Tooling       pnpm · src/',
        `Notes         ${plain.glyphs.warn} tailwindcss@3.4.17 detected — no matching rules yet.`,
        `              ${plain.glyphs.warn} .cursorrules still loads alongside the new rules and will not be modified.`,
      ].join('\n'),
    );
  });

  it('keeps the unsupported-version notice under Notes for tailwind-v3', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      name: 'tailwind-v3',
      frameworks: [],
      libraries: [],
      packages: { tailwindcss: '3.4.17', typescript: '5.9.0' },
      packageManager: 'npm',
      architecture: { id: 'flat', confidence: 0.875 },
    });
    const text = formatSummary({
      draft,
      registry: bundled,
      notices: [
        {
          kind: 'unsupported-version',
          package: 'tailwindcss',
          version: '3.4.17',
          fragmentId: 'tailwind',
        },
      ],
      warnings: [],
      theme: plain,
    });
    expect(text).toContain('Notes');
    expect(text).toContain('tailwindcss@3.4.17 detected — no matching rules yet.');
    expect(text).not.toContain('Versions:');
  });

  it('strips terminal controls from packages, versions, and warnings', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      packageManager: 'pnpm',
      libraries: [],
      packages: { next: '19\u001b[0m.0.0', typescript: '5.9.0' },
    });
    const text = formatSummary({
      draft,
      registry: bundled,
      notices: [
        {
          kind: 'unsupported-version',
          package: 'evil\u001b[1m',
          version: '1\r.0.0',
          fragmentId: 'tailwind',
        },
      ],
      warnings: [
        {
          kind: 'unresolved-tsconfig-extends',
          message: 'Could not resolve tsconfig extends "\u001b[31mbase\n".',
        },
        { kind: 'legacy-agent-file', path: '.cursorrules\u001b[0m' },
      ],
      theme: plain,
    });
    expect(text).toContain('next 19.0');
    expect(text).toContain('evil@1.0.0 detected — no matching rules yet.');
    expect(text).toContain('Could not resolve tsconfig extends "base".');
    expect(text).toContain('.cursorrules still loads alongside the new rules and will not be modified.');
    expect(text.includes('\u001b')).toBe(false);
    expect(text.includes('\r')).toBe(false);
  });

  it('does not repeat the base-rules notice', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({ frameworks: [], libraries: [], packages: {} });
    const text = formatSummary({
      draft,
      registry: bundled,
      notices: [{ kind: 'no-framework' }],
      warnings: [],
      theme: plain,
    });
    const matches = text.split(NO_FRAMEWORK_NOTICE).length - 1;
    expect(matches).toBe(1);
  });
});
