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
  formatWarning,
} from '../../src/ui/format.js';
import { sampleDraft } from './draft.js';

let registry: Registry | undefined;

async function bundledRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

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

describe('formatSummary', () => {
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
    expect(formatSummary({ draft, registry: bundled, notices: [], warnings: [] })).toBe(
      [
        NO_FRAMEWORK_SUMMARY,
        'Libraries: none',
        `Language: ${fragmentName(bundled, 'typescript')}`,
        'Package manager: npm',
        'Layout: project root',
        `Architecture: ${fragmentName(bundled, 'flat')} (confidence 0.5)`,
        'Versions: none',
        'Notices:',
        `  ${NO_FRAMEWORK_NOTICE}`,
      ].join('\n'),
    );
  });

  it('lists stack, sorted versions, notices, and warnings', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      frameworks: ['nextjs-app-router', 'nextjs-pages-router'],
      libraries: ['vitest', 'tailwind'],
      packages: { react: '19.0.0', next: '16.3.0' },
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
    });
    expect(text).toBe(
      [
        `Framework: ${fragmentName(bundled, 'nextjs-app-router')}, ${fragmentName(bundled, 'nextjs-pages-router')}`,
        `Libraries: ${fragmentName(bundled, 'vitest')}, ${fragmentName(bundled, 'tailwind')}`,
        `Language: ${fragmentName(bundled, 'typescript-strict')}`,
        'Package manager: pnpm',
        'Layout: src/',
        `Architecture: ${fragmentName(bundled, 'feature-based')} (confidence 0.875)`,
        'Versions:',
        '  next@16.3.0',
        '  react@19.0.0',
        'Notices:',
        '  tailwindcss@3.4.17 detected — no matching rules yet.',
        '  .cursorrules still loads alongside the new rules and will not be modified.',
      ].join('\n'),
    );
  });

  it('strips terminal controls from packages, versions, and warnings', async () => {
    const bundled = await bundledRegistry();
    const draft = sampleDraft({
      packageManager: 'pnpm',
      packages: { 'react\n': '19\u001b[0m.0.0' },
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
    });
    expect(text).toContain('  react@19.0.0');
    expect(text).toContain('  evil@1.0.0 detected — no matching rules yet.');
    expect(text).toContain('  Could not resolve tsconfig extends "base".');
    expect(text).toContain('  .cursorrules still loads alongside the new rules and will not be modified.');
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
    });
    const matches = text.split(NO_FRAMEWORK_NOTICE).length - 1;
    expect(matches).toBe(1);
  });
});
