import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { runRegistryCheck } from '../../scripts/check-registry.js';
import {
  checkFragments,
  formatReport,
  problemsFromLoadError,
  reportStatus,
  type RegistryProblem,
} from '../../src/registry/check.js';
import { loadRegistry } from '../../src/registry/load.js';
import { defaultRegistryDir } from '../../src/registry/locate.js';
import { getSections, parseFragment, type Fragment } from '../../src/registry/parse.js';
import { resolveSelection, suggestFragments } from '../../src/registry/resolve.js';

const TODAY = '2026-10-28';
const SAMPLE = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));
const INVALID = fileURLToPath(new URL('../fixtures/registry-invalid', import.meta.url));

const FENCE = ['```ts', 'const ok = true;', '```'].join('\n');
const VALID_RULE = ['ALWAYS keep the boundary.', '', FENCE].join('\n');

const WORKFLOW_SECTIONS = ['Purpose', 'Input', 'Steps', 'Output', 'Guardrails'] as const;

const WORKFLOW_BODY: Record<(typeof WORKFLOW_SECTIONS)[number], string> = {
  Purpose: 'Do the work.',
  Input: 'A name.',
  Steps: 'Follow the plan.',
  Output: 'A summary.',
  Guardrails: 'Stop when unsure.',
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe('checkFragments', () => {
  it('accepts a fragment body of 120 lines', () => {
    expect(checkFragments([ruleFragment({ body: paddedRule(120) })], TODAY)).toEqual([]);
  });

  it('rejects a fragment body over 120 lines', () => {
    expect(checkFragments([ruleFragment({ body: paddedRule(121) })], TODAY)).toEqual([
      error('body is 121 lines; the limit is 120'),
    ]);
  });

  it.each(['ALWAYS', 'NEVER', 'PREFER', 'FORBID', 'DEFAULT'])('accepts a rule that uses %s', (keyword) => {
    const body = [`${keyword} keep the boundary.`, '', FENCE].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('rejects a rule with no directive keyword', () => {
    expect(checkFragments([ruleFragment({ body: `Keep the boundary.\n\n${FENCE}` })], TODAY)).toEqual([
      error('missing a directive keyword (ALWAYS, NEVER, PREFER, FORBID, DEFAULT)'),
    ]);
  });

  it('rejects a rule with no fenced code block', () => {
    expect(checkFragments([ruleFragment({ body: 'ALWAYS keep the boundary.' })], TODAY)).toEqual([
      error('missing a fenced code block'),
    ]);
  });

  it('rejects version-split frameworks whose appliesTo ranges overlap', () => {
    const left = frameworkWithRange('express-a', '>=4');
    const right = frameworkWithRange('express-b', '>=4.5 <6');
    const problems = checkFragments([left, right], TODAY);
    expect(problems).toEqual([
      {
        path: 'frameworks/express-a.md',
        severity: 'error',
        message: 'appliesTo.express overlaps frameworks/express-b.md (>=4 ∩ >=4.5 <6)',
      },
      {
        path: 'frameworks/express-b.md',
        severity: 'error',
        message: 'appliesTo.express overlaps frameworks/express-a.md (>=4.5 <6 ∩ >=4)',
      },
    ]);
  });

  it('allows frameworks that share a package when globs differ', () => {
    const app = frameworkWithRange('next-app', '>=15', {
      globs: ['{{src}}app/**/*.ts'],
    });
    const pages = frameworkWithRange('next-pages', '>=13', {
      globs: ['{{src}}pages/**/*.ts'],
    });
    expect(checkFragments([app, pages], TODAY)).toEqual([]);
  });

  it('accepts a tilde fence and a fence indented by three spaces', () => {
    const tilde = ['ALWAYS keep the boundary.', '', '~~~ts', 'const ok = true;', '~~~'].join('\n');
    const indented = ['ALWAYS keep the boundary.', '', '   ```ts', 'const ok = true;', '   ```'].join('\n');
    expect(checkFragments([ruleFragment({ body: tilde }), ruleFragment({ body: indented, id: 'other' })], TODAY)).toEqual(
      [],
    );
  });

  it('does not count an indented code block as a fence', () => {
    const body = ['ALWAYS keep the boundary.', '', '    ```', '    const ok = true;', '    ```'].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([error('missing a fenced code block')]);
  });

  it('does not require directives or a fence on a workflow', () => {
    expect(checkFragments([workflowFragment(workflowBody())], TODAY)).toEqual([]);
  });

  it('accepts an architecture fragment with Summary, Map, a directive, and a fence', () => {
    expect(checkFragments([architectureFragment(summaryLines(1))], TODAY)).toEqual([]);
  });

  it('accepts a Summary of 10 non-empty lines', () => {
    expect(checkFragments([architectureFragment(summaryLines(10, true))], TODAY)).toEqual([]);
  });

  it('rejects a Summary longer than 10 non-empty lines', () => {
    expect(checkFragments([architectureFragment(summaryLines(11))], TODAY)).toEqual([
      error('## Summary is 11 non-empty lines; the limit is 10', 'architectures/sample.md'),
    ]);
  });

  it('rejects an architecture fragment without Summary or Map', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, category: 'architecture' })], TODAY)).toEqual([
      error('missing "## Summary" section', 'architectures/sample.md'),
      error('missing "## Map" section', 'architectures/sample.md'),
    ]);
  });

  it('accepts a framework fragment with an optional Map table', () => {
    const body = [
      '## Map',
      '| Path | Responsibility |',
      '| :--- | :--- |',
      '| `{{src}}app/` | Route segments. |',
      '',
      VALID_RULE,
    ].join('\n');
    expect(checkFragments([ruleFragment({ body, category: 'framework', id: 'nextjs' })], TODAY)).toEqual([]);
  });

  it('rejects a framework Map that is not a Path/Responsibility table', () => {
    const body = ['## Map', 'app holds routes', '', VALID_RULE].join('\n');
    expect(checkFragments([ruleFragment({ body, category: 'framework', id: 'nextjs' })], TODAY)).toEqual([
      error(
        '## Map must be a markdown table with Path and Responsibility columns',
        'frameworks/nextjs.md',
      ),
    ]);
  });

  it.each(WORKFLOW_SECTIONS)('rejects a workflow missing ## %s', (name) => {
    expect(checkFragments([workflowFragment(workflowBody(name))], TODAY)).toEqual([
      error(`missing "## ${name}" section`, 'workflows/sample.md'),
    ]);
  });

  it('accepts known placeholders in the body and in globs', () => {
    const body = `Use {{src}}, {{ pm }}, and {{scripts.test}}.\n\n${VALID_RULE}`;
    const fragment = ruleFragment({
      body,
      globs: ['{{src}}app/**/*.ts', '{{pm}}', '{{scripts.test}}'],
    });
    expect(checkFragments([fragment], TODAY)).toEqual([]);
  });

  it('rejects an unknown placeholder once', () => {
    const body = `Use {{foo}} and {{foo}} again.\n\n${VALID_RULE}`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([error('unknown placeholder "{{foo}}"')]);
  });

  it('rejects a script placeholder whose name contains whitespace', () => {
    const fragment = ruleFragment({
      body: VALID_RULE,
      globs: ['{{scripts.foo bar}}'],
    });
    expect(checkFragments([fragment], TODAY)).toEqual([error('unknown placeholder "{{scripts.foo bar}}"')]);
  });

  it('does not warn when verifiedAt is exactly 6 months old', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, verifiedAt: '2026-04-28' })], TODAY)).toEqual([]);
  });

  it('warns when verifiedAt is older than 6 months', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, verifiedAt: '2026-04-27' })], TODAY)).toEqual([
      warning('verifiedAt 2026-04-27 is older than 6 months'),
    ]);
  });

  it('clamps a month-end verifiedAt to the last day six months later', () => {
    const fragment = ruleFragment({ body: VALID_RULE, verifiedAt: '2025-08-31' });
    expect(checkFragments([fragment], '2026-02-28')).toEqual([]);
    expect(checkFragments([fragment], '2026-03-01')).toEqual([
      warning('verifiedAt 2025-08-31 is older than 6 months'),
    ]);
  });

  it.each([
    ['curl', 'Run curl https://example.com'],
    ['wget', 'Fetch it with wget https://example.com/file'],
    ['npm install', 'Run npm install left-pad'],
    ['pnpm add', 'Run pnpm add left-pad'],
    ['yarn add', 'Run yarn add left-pad'],
    ['read .env', 'Read the `.env` file before starting'],
    ['read .env', 'reading .env files is required'],
    ['read .env', 'Reads the `.env` file before starting'],
    ['move or rename existing files', 'Rename the existing files before editing'],
    ['move or rename existing files', 'mv the existing config out of the way'],
    ['move or rename existing files', 'Rename `app/page.tsx` to `app/home/page.tsx`'],
  ] as const)('rejects %s', (phrase, line) => {
    expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n${line}` })], TODAY)).toEqual([
      error(`forbidden phrase "${phrase}"`),
    ]);
  });

  it('reports forbidden phrases in list order', () => {
    const body = `${VALID_RULE}\nUse wget, then curl https://example.com`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([
      error('forbidden phrase "curl"'),
      error('forbidden phrase "wget"'),
    ]);
  });

  it('ignores a forbidden phrase in a clearly marked anti-pattern block', () => {
    const blocks = [
      ['## Anti-Pattern', '', '```ts', 'curl https://example.com', '```'].join('\n'),
      ['```ts anti-pattern', 'wget https://example.com', '```'].join('\n'),
      ['```ts', '// Anti-pattern', 'npm install left-pad', '```'].join('\n'),
    ];
    for (const block of blocks) {
      expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n\n${block}` })], TODAY)).toEqual([]);
    }
  });

  it('flags a forbidden phrase when the block also shows the good example', () => {
    const block = ['```ts', '// ✅ Good', 'const ok = true;', '// Anti-pattern', 'curl https://example.com', '```'].join(
      '\n',
    );
    expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n\n${block}` })], TODAY)).toEqual([
      error('forbidden phrase "curl"'),
    ]);
  });

  it('flags a forbidden phrase under a heading that also says Good', () => {
    const block = ['## Good vs Anti-Pattern', '', '```ts', 'curl https://example.com', '```'].join('\n');
    expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n\n${block}` })], TODAY)).toEqual([
      error('forbidden phrase "curl"'),
    ]);
  });

  it('does not treat NEVER or FORBID as an instruction to do the forbidden thing', () => {
    const body = [
      VALID_RULE,
      'NEVER run curl or wget.',
      'FORBID npm install, pnpm add, and yarn add.',
      'NEVER rename `app/page.tsx` or read the `.env` file.',
    ].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('does not flag move or rename wording that does not name a file', () => {
    const body = `${VALID_RULE}\nMove logic into a helper and rename the concept, e.g. split it.`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('does not flag curl inside a URL or a longer identifier', () => {
    const body = `${VALID_RULE}\nSee https://curl.se and libcurl.`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('rejects a today value that is not a real calendar date', () => {
    const fragment = ruleFragment({ body: VALID_RULE });
    expect(() => checkFragments([fragment], '2026-02-31')).toThrow(AgentInitError);
    expect(() => checkFragments([fragment], 'yesterday')).toThrow('today must be YYYY-MM-DD.');
  });

  it('warns when a single-line export function in a ts fence lacks a return type', () => {
    const body = [
      'ALWAYS keep the boundary.',
      '',
      '```ts',
      'export function helper(input: string) {',
      '  return input;',
      '}',
      '```',
    ].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([
      warning('missing return type on export function helper (heuristic; single-line signatures only)'),
    ]);
  });

  it('accepts a single-line export function with a return type', () => {
    const body = [
      'ALWAYS keep the boundary.',
      '',
      '```ts',
      'export function helper(input: string): string {',
      '  return input;',
      '}',
      '```',
    ].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('skips React components and framework entry exports without return types', () => {
    const body = [
      'ALWAYS keep the boundary.',
      '',
      '```tsx',
      'export function Title({ show }: { show: boolean }) {',
      '  return show ? <h1>Hi</h1> : null;',
      '}',
      'export default async function Page() {',
      '  return null;',
      '}',
      'export async function GET() {',
      '  return new Response();',
      '}',
      '```',
    ].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('skips missing return types after an anti-pattern marker in a mixed fence', () => {
    const body = [
      'ALWAYS keep the boundary.',
      '',
      '```ts',
      'export function good(input: string): string {',
      '  return input;',
      '}',
      '// ❌ Anti-pattern: missing return type',
      'export function bad(input: string) {',
      '  return input;',
      '}',
      '```',
    ].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('does not flag a multi-line export function signature', () => {
    const body = [
      'ALWAYS keep the boundary.',
      '',
      '```ts',
      'export function helper(',
      '  input: string,',
      ') {',
      '  return input;',
      '}',
      '```',
    ].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('warns when a rule fragment is missing a hint', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, hint: null })], TODAY)).toEqual([
      warning('missing hint; the picker will truncate description'),
    ]);
  });

  it('warns when a hint is longer than 48 characters', () => {
    const hint = 'x'.repeat(49);
    expect(checkFragments([ruleFragment({ body: VALID_RULE, hint })], TODAY)).toEqual([
      warning('hint is 49 characters; the limit is 48'),
    ]);
  });

  it('does not require a hint on a workflow', () => {
    expect(checkFragments([workflowFragment(workflowBody())], TODAY)).toEqual([]);
  });
});

describe('problemsFromLoadError', () => {
  it('returns no problems for an empty message', () => {
    expect(problemsFromLoadError('')).toEqual([]);
  });

  it('turns each loadRegistry line into an error', () => {
    const message = [
      'libraries/a.md: duplicate id "a" (first seen at frameworks/a.md)',
      'Not a directory: /tmp/registry',
    ].join('\n');
    expect(problemsFromLoadError(message)).toEqual([
      {
        path: 'libraries/a.md',
        severity: 'error',
        message: 'duplicate id "a" (first seen at frameworks/a.md)',
      },
      { path: '.', severity: 'error', message: 'Not a directory: /tmp/registry' },
    ]);
  });
});

describe('formatReport', () => {
  it('prints one line per problem and a summary', () => {
    const problems: RegistryProblem[] = [
      { path: 'libraries/a.md', severity: 'error', message: 'missing a fenced code block' },
      { path: 'libraries/a.md', severity: 'warning', message: 'verifiedAt 2020-01-01 is older than 6 months' },
    ];
    expect(formatReport(problems)).toBe(
      [
        'libraries/a.md: [error] missing a fenced code block',
        'libraries/a.md: [warning] verifiedAt 2020-01-01 is older than 6 months',
        '1 error, 1 warning',
        '',
      ].join('\n'),
    );
    expect(formatReport([])).toBe('0 errors, 0 warnings\n');
    expect(reportStatus(problems)).toBe(1);
    const warningOnly = problems[1];
    if (warningOnly === undefined) throw new Error('expected a warning');
    expect(reportStatus([warningOnly])).toBe(0);
  });
});

describe('runRegistryCheck', () => {
  it('passes on the bundled registry and on registry-sample', async () => {
    const bundled = await run(defaultRegistryDir());
    const sample = await run(SAMPLE);
    expect(bundled).toEqual({ code: 0, text: '0 errors, 0 warnings\n' });
    expect(sample).toEqual({ code: 0, text: '0 errors, 0 warnings\n' });
  });

  it('includes the architecture, language, framework, library, and workflow fragments', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    expect(registry.fragments.map((fragment) => fragment.meta.id)).toEqual([
      'atomic-design',
      'feature-based',
      'flat',
      'layered',
      'modular',
      'typescript',
      'typescript-strict',
      'express',
      'express-4',
      'fastify',
      'nextjs-app-router',
      'nextjs-app-router-15',
      'nextjs-pages-router',
      'react-vite',
      'playwright',
      'react-hook-form-zod',
      'shadcn',
      'tailwind',
      'tanstack-query',
      'vitest',
      'zustand',
      'new-feature',
      'refactor',
      'review-arch',
      'write-tests',
    ]);
  });

  it('records framework scope, version range, and sources', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    const frameworks = registry.byCategory('framework').map((fragment) => {
      if (fragment.meta.category === 'workflow') throw new Error('expected a rule fragment');
      return {
        id: fragment.meta.id,
        scope: fragment.meta.scope,
        globs: fragment.meta.globs,
        appliesTo: fragment.meta.appliesTo,
        verifiedAt: fragment.meta.verifiedAt,
        sourced: fragment.meta.sources.length > 0,
      };
    });
    const expressGlobs = [
      '{{src}}routes/**/*.ts',
      '{{src}}controllers/**/*.ts',
      '{{src}}middleware/**/*.ts',
      '{{src}}**/*.routes.ts',
      '{{src}}**/*.controller.ts',
      '{{src}}**/*.middleware.ts',
    ];
    expect(frameworks).toEqual([
      {
        id: 'express',
        scope: 'auto',
        globs: expressGlobs,
        appliesTo: { express: '>=5' },
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'express-4',
        scope: 'auto',
        globs: expressGlobs,
        appliesTo: { express: '>=4 <5' },
        verifiedAt: '2026-11-05',
        sourced: true,
      },
      {
        id: 'fastify',
        scope: 'auto',
        globs: [
          '{{src}}routes/**/*.ts',
          '{{src}}plugins/**/*.ts',
          '{{src}}**/*.routes.ts',
          '{{src}}**/*.plugin.ts',
        ],
        appliesTo: { fastify: '>=5' },
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'nextjs-app-router',
        scope: 'glob',
        globs: ['{{src}}app/**/*.ts', '{{src}}app/**/*.tsx'],
        appliesTo: { next: '>=16.3.0' },
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'nextjs-app-router-15',
        scope: 'glob',
        globs: ['{{src}}app/**/*.ts', '{{src}}app/**/*.tsx'],
        appliesTo: { next: '>=15.0.0 <16.3.0' },
        verifiedAt: '2026-11-05',
        sourced: true,
      },
      {
        id: 'nextjs-pages-router',
        scope: 'glob',
        globs: ['{{src}}pages/**/*.ts', '{{src}}pages/**/*.tsx'],
        appliesTo: { next: '>=13' },
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'react-vite',
        scope: 'auto',
        globs: ['{{src}}**/*.tsx'],
        appliesTo: { react: '>=19', vite: '>=6' },
        verifiedAt: '2026-10-28',
        sourced: true,
      },
    ]);
  });

  it('records library detection, scope, and compatibility', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    const libraries = registry.byCategory('library').map((fragment) => {
      if (fragment.meta.category === 'workflow') throw new Error('expected a rule fragment');
      return {
        id: fragment.meta.id,
        scope: fragment.meta.scope,
        globs: fragment.meta.globs,
        detect: fragment.meta.detect,
        appliesTo: fragment.meta.appliesTo,
        requires: fragment.meta.requires,
        compatibleWith: fragment.meta.compatibleWith,
        verifiedAt: fragment.meta.verifiedAt,
        sourced: fragment.meta.sources.length > 0,
      };
    });
    const web = ['nextjs-app-router', 'nextjs-app-router-15', 'nextjs-pages-router', 'react-vite'];
    expect(libraries).toEqual([
      {
        id: 'playwright',
        scope: 'glob',
        globs: ['e2e/**/*.ts', 'tests/e2e/**/*.ts', '**/*.e2e.ts', 'tests/**/*.spec.ts'],
        detect: { packages: ['@playwright/test'] },
        appliesTo: { '@playwright/test': '>=1.40' },
        requires: undefined,
        compatibleWith: undefined,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'react-hook-form-zod',
        scope: 'auto',
        globs: [
          '{{src}}**/forms/**/*.ts',
          '{{src}}**/forms/**/*.tsx',
          '{{src}}**/*.form.ts',
          '{{src}}**/*.form.tsx',
        ],
        detect: { packages: ['react-hook-form', 'zod', '@hookform/resolvers'] },
        appliesTo: { 'react-hook-form': '>=7', zod: '>=4' },
        requires: undefined,
        compatibleWith: web,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'shadcn',
        scope: 'auto',
        globs: ['{{src}}components/ui/**/*.ts', '{{src}}components/ui/**/*.tsx'],
        detect: { files: ['components.json'] },
        appliesTo: undefined,
        requires: ['tailwind'],
        compatibleWith: web,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'tailwind',
        scope: 'glob',
        globs: ['{{src}}**/*.tsx', '{{src}}**/*.css'],
        detect: { packages: ['tailwindcss'] },
        appliesTo: { tailwindcss: '>=4' },
        requires: undefined,
        compatibleWith: web,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'tanstack-query',
        scope: 'auto',
        globs: [
          '{{src}}**/hooks/**/*.ts',
          '{{src}}**/hooks/**/*.tsx',
          '{{src}}**/queries/**/*.ts',
          '{{src}}**/queries/**/*.tsx',
        ],
        detect: { packages: ['@tanstack/react-query'] },
        appliesTo: { '@tanstack/react-query': '>=5' },
        requires: undefined,
        compatibleWith: web,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'vitest',
        scope: 'glob',
        globs: [
          '**/*.test.tsx',
          '**/*.spec.tsx',
          '*.test.ts',
          '*.spec.ts',
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'app/**/*.test.ts',
          'app/**/*.spec.ts',
          'lib/**/*.test.ts',
          'lib/**/*.spec.ts',
          'server/**/*.test.ts',
          'server/**/*.spec.ts',
          'pages/**/*.test.ts',
          'pages/**/*.spec.ts',
          'components/**/*.test.ts',
          'components/**/*.spec.ts',
          'test/**/*.test.ts',
          'test/**/*.spec.ts',
          'tests/*.test.ts',
          'tests/unit/**/*.test.ts',
          'tests/integration/**/*.test.ts',
          '__tests__/**/*.test.ts',
          '__tests__/**/*.spec.ts',
        ],
        detect: { packages: ['vitest'] },
        appliesTo: { vitest: '>=3' },
        requires: undefined,
        compatibleWith: undefined,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
      {
        id: 'zustand',
        scope: 'auto',
        globs: [
          '{{src}}**/stores/**/*.ts',
          '{{src}}**/stores/**/*.tsx',
          '{{src}}**/*.store.ts',
          '{{src}}**/*.store.tsx',
        ],
        detect: { packages: ['zustand'] },
        appliesTo: { zustand: '>=5' },
        requires: undefined,
        compatibleWith: web,
        verifiedAt: '2026-10-28',
        sourced: true,
      },
    ]);
  });

  it('attaches vitest and playwright to different files', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    const vitest = ruleGlobs(registry, 'vitest');
    const playwright = ruleGlobs(registry, 'playwright');
    const dir = await tempDir();
    const files = [
      'tests/example.spec.ts',
      'tests/unit/cart.spec.ts',
      'e2e/example.spec.ts',
      'e2e/example.test.ts',
      'e2e/pages/login.ts',
      'tests/e2e/example.spec.ts',
      'tests/e2e/example.test.ts',
      'profile.e2e.ts',
      'src/cart.test.ts',
      'src/cart.spec.ts',
      'src/Button.test.tsx',
      'src/Button.spec.tsx',
      'tests/cart.test.ts',
      'tests/unit/cart.test.ts',
      'tests/integration/cart.test.ts',
      'app/cart.test.ts',
      'cart.test.ts',
      'cart.spec.ts',
      '__tests__/cart.spec.ts',
      'test/cart.spec.ts',
    ];
    await Promise.all(files.map(async (file) => writeMarkdown(dir, file, '')));
    const vitestHits = await matchGlobs(dir, vitest);
    const playwrightHits = await matchGlobs(dir, playwright);

    expect(files.filter((file) => vitestHits.has(file) && playwrightHits.has(file))).toEqual([]);
    expect([...playwrightHits].sort()).toEqual([
      'e2e/example.spec.ts',
      'e2e/example.test.ts',
      'e2e/pages/login.ts',
      'profile.e2e.ts',
      'tests/e2e/example.spec.ts',
      'tests/e2e/example.test.ts',
      'tests/example.spec.ts',
      'tests/unit/cart.spec.ts',
    ]);
    expect([...vitestHits].sort()).toEqual([
      '__tests__/cart.spec.ts',
      'app/cart.test.ts',
      'cart.spec.ts',
      'cart.test.ts',
      'src/Button.spec.tsx',
      'src/Button.test.tsx',
      'src/cart.spec.ts',
      'src/cart.test.ts',
      'test/cart.spec.ts',
      'tests/cart.test.ts',
      'tests/integration/cart.test.ts',
      'tests/unit/cart.test.ts',
    ]);
  });

  it('ships the four workflows with arguments, stops, and project scripts', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    const workflows = registry.byCategory('workflow').map((fragment) => {
      if (fragment.meta.category !== 'workflow') throw new Error('expected a workflow');
      return {
        id: fragment.meta.id,
        order: fragment.meta.order,
        argumentHint: fragment.meta.argumentHint,
        sections: [...getSections(fragment.body).keys()],
      };
    });
    const sections = ['Purpose', 'Input', 'Steps', 'Output', 'Guardrails'];
    expect(workflows).toEqual([
      {
        id: 'new-feature',
        order: 50,
        argumentHint: '<feature-name> <short description>',
        sections,
      },
      {
        id: 'refactor',
        order: 50,
        argumentHint: '<target> <goal>',
        sections,
      },
      {
        id: 'review-arch',
        order: 50,
        argumentHint: '[path]',
        sections,
      },
      {
        id: 'write-tests',
        order: 50,
        argumentHint: '<target>',
        sections,
      },
    ]);

    const body = (id: string): string => registry.byId.get(id)?.body ?? '';
    expect(body('new-feature')).toMatch(/stop and wait for the user to confirm/i);
    expect(body('new-feature')).toContain('each path to create or edit');
    expect(body('new-feature')).toContain("closest `AGENTS.md` in that file's directory tree");
    expect(body('new-feature')).toContain('{{scripts.typecheck}}');
    expect(body('new-feature')).toContain('{{scripts.lint}}');
    expect(body('new-feature')).toContain('{{scripts.test}}');
    expect(body('review-arch')).toMatch(/read-only/i);
    expect(body('review-arch')).toMatch(/\*\*NEVER\*\* edit/);
    expect(body('review-arch')).toContain('file:line');
    expect(body('refactor')).toMatch(/characterization tests/i);
    expect(body('refactor')).toContain('public API');
    expect(body('refactor')).toContain('{{scripts.test}}');
    expect(body('write-tests')).toMatch(/\*\*NEVER\*\* mock the unit under test/);
    expect(body('write-tests')).toContain('{{scripts.test}}');
    for (const id of ['new-feature', 'refactor', 'review-arch', 'write-tests']) {
      const text = body(id);
      expect(text).not.toContain('$ARGUMENTS');
      expect(text).not.toContain('@AGENTS.md');
      expect(text).not.toContain('argument-hint');
      expect(text.split(/\r?\n/u).length).toBeLessThanOrEqual(60);
    }
  });

  it('runs vitest and playwright through the project test script', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    for (const id of ['playwright', 'vitest']) {
      const body = registry.byId.get(id)?.body ?? '';
      expect(body).toContain('{{scripts.test}}');
      expect(body).not.toMatch(/\bnpm(?:\s+run)?\s+test\b/);
    }
  });

  it('suggests shadcn from components.json and resolveSelection adds tailwind', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    expect(suggestFragments(registry, { packages: {}, files: ['components.json'] })).toEqual({
      frameworks: [],
      libraries: ['shadcn'],
      notices: [],
    });
    const resolved = resolveSelection(registry, {
      language: 'typescript',
      architecture: 'feature-based',
      frameworks: ['react-vite'],
      libraries: ['shadcn'],
      origin: {
        typescript: 'manual',
        'feature-based': 'manual',
        'react-vite': 'manual',
        shadcn: 'manual',
      },
    });
    expect(resolved.fragments.map((fragment) => fragment.meta.id)).toEqual([
      'feature-based',
      'typescript',
      'react-vite',
      'shadcn',
      'tailwind',
    ]);
    expect(resolved.notices).toEqual([{ kind: 'required-by', fragmentId: 'tailwind', requiredBy: 'shadcn' }]);
    expect(resolved.conflicts).toEqual([]);
  });

  it('does not add the tailwind fragment when shadcn is selected on tailwind 3', async () => {
    const registry = await loadRegistry(defaultRegistryDir());
    const resolved = resolveSelection(
      registry,
      {
        language: 'typescript',
        architecture: 'feature-based',
        frameworks: ['react-vite'],
        libraries: ['shadcn'],
        origin: {
          typescript: 'manual',
          'feature-based': 'manual',
          'react-vite': 'manual',
          shadcn: 'manual',
        },
      },
      { packages: { tailwindcss: '3.4.17' }, files: ['components.json'] },
    );
    expect(resolved.fragments.map((fragment) => fragment.meta.id)).toEqual([
      'feature-based',
      'typescript',
      'react-vite',
      'shadcn',
    ]);
    expect(resolved.notices).toEqual([
      {
        kind: 'unsupported-version',
        package: 'tailwindcss',
        version: '3.4.17',
        fragmentId: 'tailwind',
      },
    ]);
  });

  it('prints every load error and exits 1', async () => {
    const result = await run(path.join(INVALID, 'multiple'));
    expect(result.code).toBe(1);
    expect(result.text).toBe(
      [
        'architectures/broken.md: [error] missing frontmatter block',
        'frameworks/layered.md: [error] folder "frameworks" does not match category "library"; expected "libraries"',
        'languages/typescript.md: [error] requires: unknown id "missing-lang"',
        'languages/typescript.md: [error] conflictsWith: unknown id "missing-conflict"',
        'languages/typescript.md: [error] compatibleWith: unknown id "missing-compat"',
        'libraries/mismatch.md: [error] file name "mismatch.md" does not match id "zustand"',
        'libraries/zustand.md: [error] duplicate id "zustand" (first seen at libraries/mismatch.md)',
        '7 errors, 0 warnings',
        '',
      ].join('\n'),
    );
  });

  it('prints every content problem and exits 1 when any error is present', async () => {
    const dir = await tempDir();
    await writeMarkdown(
      dir,
      'libraries/alpha.md',
      `---
id: alpha
name: Alpha
category: library
version: 1.0.0
order: 40
description: A library rule.
hint: Alpha library picker hint.
scope: always
sources:
  - https://example.com/docs
verifiedAt: 2020-01-01
---
Use {{nope}} in the client.

ALWAYS keep the boundary.

\`\`\`ts
const ok = true;
\`\`\`

Run curl https://example.com
`,
    );
    await writeMarkdown(
      dir,
      'workflows/beta.md',
      `---
id: beta
name: Beta
category: workflow
version: 1.0.0
order: 50
description: A workflow.
sources:
  - https://example.com/docs
verifiedAt: 2026-10-17
---
## Steps
Follow the plan.
`,
    );

    const result = await run(dir);
    expect(result.code).toBe(1);
    expect(result.text).toBe(
      [
        'libraries/alpha.md: [error] unknown placeholder "{{nope}}"',
        'libraries/alpha.md: [warning] verifiedAt 2020-01-01 is older than 6 months',
        'libraries/alpha.md: [error] forbidden phrase "curl"',
        'workflows/beta.md: [error] missing "## Purpose" section',
        'workflows/beta.md: [error] missing "## Input" section',
        'workflows/beta.md: [error] missing "## Output" section',
        'workflows/beta.md: [error] missing "## Guardrails" section',
        '6 errors, 1 warning',
        '',
      ].join('\n'),
    );
  });

  it('exits 0 when the only problems are warnings', async () => {
    const dir = await tempDir();
    await writeMarkdown(
      dir,
      'libraries/sample.md',
      `---
id: sample
name: Sample
category: library
version: 1.0.0
order: 40
description: A library rule.
hint: Sample library picker hint.
scope: always
sources:
  - https://example.com/docs
verifiedAt: 2020-01-01
---
ALWAYS keep the boundary.

\`\`\`ts
const ok = true;
\`\`\`
`,
    );

    const result = await run(dir);
    expect(result.code).toBe(0);
    expect(result.text).toBe(
      ['libraries/sample.md: [warning] verifiedAt 2020-01-01 is older than 6 months', '0 errors, 1 warning', ''].join(
        '\n',
      ),
    );
  });
});

function frameworkWithRange(
  id: string,
  range: string,
  options: { readonly globs?: readonly string[] } = {},
): Fragment {
  const globs = options.globs ?? [
    '{{src}}routes/**/*.ts',
    '{{src}}controllers/**/*.ts',
    '{{src}}middleware/**/*.ts',
  ];
  return parseFragment(
    `---
id: ${id}
name: Sample ${id}
category: framework
version: 1.0.0
order: 30
description: A sample framework.
hint: Sample framework hint.
scope: auto
globs:
${globs.map((glob) => `  - ${JSON.stringify(glob)}`).join('\n')}
detect:
  packages: ["express"]
appliesTo:
  express: "${range}"
sources:
  - https://example.com/docs
verifiedAt: 2026-10-17
---
${VALID_RULE}`,
    `frameworks/${id}.md`,
  );
}

function ruleFragment(options: {
  body: string;
  category?: 'architecture' | 'language' | 'framework' | 'library';
  verifiedAt?: string;
  globs?: readonly string[];
  id?: string;
  hint?: string | null;
}): Fragment {
  const category = options.category ?? 'library';
  const id = options.id ?? 'sample';
  const folders = {
    architecture: 'architectures',
    language: 'languages',
    framework: 'frameworks',
    library: 'libraries',
  } as const;
  const scope = options.globs === undefined ? 'always' : 'glob';
  const globs =
    options.globs === undefined
      ? ''
      : `globs:\n${options.globs.map((glob) => `  - ${JSON.stringify(glob)}`).join('\n')}\n`;
  const hint =
    options.hint === null
      ? ''
      : `hint: ${options.hint ?? 'A short sample hint.'}\n`;
  return parseFragment(
    `---
id: ${id}
name: Sample
category: ${category}
version: 1.0.0
order: 10
description: A sample.
${hint}scope: ${scope}
${globs}sources:
  - https://example.com/docs
verifiedAt: ${options.verifiedAt ?? '2026-10-17'}
---
${options.body}`,
    `${folders[category]}/${id}.md`,
  );
}

function architectureFragment(summary: readonly string[]): Fragment {
  const body = ['## Summary', ...summary, '', '## Map', 'src/features', '', VALID_RULE].join('\n');
  return ruleFragment({ body, category: 'architecture' });
}

function workflowFragment(body: string, verifiedAt = '2026-10-17'): Fragment {
  return parseFragment(
    `---
id: sample
name: Sample
category: workflow
version: 1.0.0
order: 50
description: A workflow.
sources:
  - https://example.com/docs
verifiedAt: ${verifiedAt}
---
${body}`,
    'workflows/sample.md',
  );
}

function workflowBody(omit?: (typeof WORKFLOW_SECTIONS)[number]): string {
  return WORKFLOW_SECTIONS.filter((name) => name !== omit)
    .map((name) => `## ${name}\n${WORKFLOW_BODY[name]}`)
    .join('\n\n');
}

function summaryLines(count: number, blankBetween = false): string[] {
  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (blankBetween && index > 0) lines.push('');
    lines.push(`line ${String(index + 1)}`);
  }
  return lines;
}

function paddedRule(count: number): string {
  const head = VALID_RULE.split('\n');
  const filler = Array.from({ length: count - head.length }, (_, index) => `note ${String(index + 1)}`);
  return [...head, ...filler].join('\n');
}

function error(message: string, path = 'libraries/sample.md'): RegistryProblem {
  return { path, severity: 'error', message };
}

function warning(message: string, path = 'libraries/sample.md'): RegistryProblem {
  return { path, severity: 'warning', message };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-'));
  directories.push(dir);
  return dir;
}

function ruleGlobs(registry: Awaited<ReturnType<typeof loadRegistry>>, id: string): string[] {
  const fragment = registry.byId.get(id);
  if (fragment === undefined || fragment.meta.category === 'workflow' || fragment.meta.globs === undefined) {
    throw new Error(`expected globs on ${id}`);
  }
  return [...fragment.meta.globs];
}

async function matchGlobs(dir: string, patterns: readonly string[]): Promise<Set<string>> {
  const matches = await glob([...patterns], {
    cwd: dir,
    absolute: false,
    dot: false,
    onlyFiles: true,
  });
  return new Set(matches);
}

async function writeMarkdown(root: string, relativePath: string, text: string): Promise<void> {
  const file = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function run(dir: string): Promise<{ code: 0 | 1; text: string }> {
  const output = {
    text: '',
    write(chunk: string): void {
      output.text += chunk;
    },
  };
  const code = await runRegistryCheck(dir, TODAY, output);
  return { code, text: output.text };
}
