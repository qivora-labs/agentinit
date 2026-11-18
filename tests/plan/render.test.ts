import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  hasJavaScriptContractFence,
  hasTypeScriptContractFence,
  hasTypescriptOnlyMarker,
} from '../../src/plan/language-examples.js';
import { agentRuleBody, renderTargetContext } from '../../src/plan/render.js';
import { defaultRegistryDir } from '../../src/registry/locate.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import { getSections } from '../../src/registry/parse.js';
import { resolveSelection, type ResolvedSelection } from '../../src/registry/resolve.js';
import { copilotAdapter } from '../../src/targets/copilot.js';
import { cursorAdapter } from '../../src/targets/cursor.js';
import { windsurfAdapter } from '../../src/targets/windsurf.js';
import { layeredFragment, profile, resolved, ruleFragment, workflowFragment } from './helpers.js';

const sampleDir = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));
const ARCHITECTURE_IDS = [
  'atomic-design',
  'feature-based',
  'flat',
  'layered',
  'modular',
] as const;

describe('renderTargetContext', () => {
  let registry: Registry;
  let sample: ResolvedSelection;

  beforeAll(async () => {
    registry = await loadRegistry(sampleDir);
    sample = resolveSelection(registry, {
      language: 'typescript-strict',
      architecture: 'layered',
      frameworks: ['nextjs-app-router'],
      libraries: ['vitest'],
      origin: {},
    });
  });

  it('renders bodies and globs, and groups fragments by scope', () => {
    const ctx = renderTargetContext(profile({ srcDir: 'src' }), sample);
    expect(ctx.fragments.always.map((fragment) => fragment.id)).toEqual(['layered', 'typescript-strict']);
    expect(ctx.fragments.glob.map((fragment) => fragment.id)).toEqual(['nextjs-app-router', 'vitest']);
    expect(ctx.fragments.auto).toEqual([]);
    expect(ctx.fragments.manual).toEqual([]);
    expect(ctx.fragments.glob.find((fragment) => fragment.id === 'nextjs-app-router')?.globs).toEqual([
      'src/app/**/*.ts',
      'src/app/**/*.tsx',
    ]);
    expect(ctx.fragments.always[0]?.body).toContain('src/domain/');
    expect(ctx.fragments.always[0]?.body).not.toContain('{{src}}');
    expect(ctx.placeholders).toEqual({
      src: 'src/',
      pm: 'pnpm',
      scripts: { lint: 'eslint .', test: 'vitest' },
      ext: 'ts',
      jsxExt: 'tsx',
    });
    expect(ctx.workflows.map((workflow) => workflow.id)).toEqual(['new-feature', 'review-arch']);
    expect(ctx.workflows[0]?.argumentHint).toBe('<feature-name>');
    expect(ctx.workflows[1]).not.toHaveProperty('argumentHint');
  });

  it('renders an empty source root without a src/ prefix', () => {
    const ctx = renderTargetContext(profile({ srcDir: '', packageManager: null, scripts: {} }), sample);
    const next = ctx.fragments.glob.find((fragment) => fragment.id === 'nextjs-app-router');
    expect(next?.globs).toEqual(['app/**/*.ts', 'app/**/*.tsx']);
    expect(ctx.fragments.always[0]?.body).toContain('| `domain/` |');
    expect(ctx.fragments.always[0]?.body).not.toContain('src/domain/');
    expect(ctx.placeholders.src).toBe('');
    expect(ctx.placeholders.pm).toBeNull();
  });

  it('rewrites scoped globs for a JavaScript profile', () => {
    const ctx = renderTargetContext(profile({ language: 'javascript', srcDir: 'src' }), sample);
    expect(ctx.fragments.glob.find((fragment) => fragment.id === 'nextjs-app-router')?.globs).toEqual([
      'src/app/**/*.js',
      'src/app/**/*.jsx',
    ]);
  });

  it('keeps TypeScript target globs byte-identical when allowJs is false', () => {
    const agents = ['cursor', 'windsurf', 'copilot'] as const;
    const without = renderTargetContext(
      profile({ language: 'typescript-strict', allowJs: false, agents: [...agents] }),
      sample,
    );
    const withFlagOff = renderTargetContext(
      profile({ language: 'typescript', allowJs: false, agents: [...agents] }),
      sample,
    );
    const nextGlobs = ['src/app/**/*.ts', 'src/app/**/*.tsx'] as const;
    expect(without.fragments.glob.find((fragment) => fragment.id === 'nextjs-app-router')?.globs).toEqual([
      ...nextGlobs,
    ]);
    expect(withFlagOff.fragments.glob.find((fragment) => fragment.id === 'vitest')?.globs).toEqual(
      without.fragments.glob.find((fragment) => fragment.id === 'vitest')?.globs,
    );

    // Pre-T61 joined-string form for Cursor, Windsurf, and Copilot (PRD §5.4).
    const joined = nextGlobs.join(',');
    const cursor = cursorAdapter(without).find(
      (op) => op.path === '.cursor/rules/agentinit-nextjs-app-router.mdc',
    );
    const windsurf = windsurfAdapter(without).find(
      (op) => op.path === '.windsurf/rules/agentinit-nextjs-app-router.md',
    );
    const copilot = copilotAdapter(without).find(
      (op) => op.path === '.github/instructions/agentinit-nextjs-app-router.instructions.md',
    );
    expect(cursor?.content).toContain(`globs: ${joined}\n`);
    expect(windsurf?.content).toContain(`globs: ${joined}\n`);
    expect(copilot?.content).toContain(`applyTo: "${joined}"\n`);

    const scopedPath = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    expect(cursorAdapter(withFlagOff).find((op) => op.path === scopedPath)?.content).toBe(
      cursor?.content,
    );
  });

  it('widens scoped globs when TypeScript allowJs is true', () => {
    const ctx = renderTargetContext(
      profile({ language: 'typescript-strict', allowJs: true, srcDir: 'src' }),
      sample,
    );
    expect(ctx.fragments.glob.find((fragment) => fragment.id === 'nextjs-app-router')?.globs).toEqual([
      'src/app/**/*.ts',
      'src/app/**/*.js',
      'src/app/**/*.tsx',
      'src/app/**/*.jsx',
    ]);
  });

  it('renders only the matching Contract fence and prose extensions per language', () => {
    const body = [
      '<!-- agentinit:typescript-only -->',
      'Export from `index.{{ext}}` and `widget.{{jsxExt}}`.',
      '',
      '## Contract',
      '```ts',
      'const typed: number = 1;',
      '```',
      '',
      '```js',
      'const plain = 1;',
      '```',
    ].join('\n');
    // Marker-only exemption; dual fences still exercise selection (content tasks drop the marker).
    const dual = body.replace('<!-- agentinit:typescript-only -->\n', '');
    const fragment = ruleFragment({
      id: 'example-lib',
      name: 'Example',
      category: 'library',
      scope: 'glob',
      order: 40,
      body: dual,
      globs: ['{{src}}**/*.ts'],
    });
    const selection = resolved([fragment]);
    const ts = renderTargetContext(profile({ language: 'typescript-strict' }), selection);
    const js = renderTargetContext(profile({ language: 'javascript' }), selection);
    expect(ts.fragments.glob[0]?.body).toBe(
      [
        'Export from `index.ts` and `widget.tsx`.',
        '',
        '## Contract',
        '```ts',
        'const typed: number = 1;',
        '```',
      ].join('\n'),
    );
    expect(js.fragments.glob[0]?.body).toBe(
      [
        'Export from `index.js` and `widget.jsx`.',
        '',
        '## Contract',
        '```js',
        'const plain = 1;',
        '```',
      ].join('\n'),
    );
  });

  it('keeps TypeScript output byte-identical to the single-fence body when the TS fence is unchanged', () => {
    const single = ['## Contract', '```ts', 'const typed: number = 1;', '```'].join('\n');
    const dual = [single, '', '```js', 'const plain = 1;', '```'].join('\n');
    const fromSingle = renderTargetContext(
      profile({ language: 'typescript-strict' }),
      resolved([
        ruleFragment({
          id: 'example-lib',
          name: 'Example',
          category: 'library',
          scope: 'always',
          order: 40,
          body: single,
        }),
      ]),
    );
    const fromDual = renderTargetContext(
      profile({ language: 'typescript-strict' }),
      resolved([
        ruleFragment({
          id: 'example-lib',
          name: 'Example',
          category: 'library',
          scope: 'always',
          order: 40,
          body: dual,
        }),
      ]),
    );
    expect(fromDual.fragments.always[0]?.body).toBe(fromSingle.fragments.always[0]?.body);
    expect(fromDual.fragments.always[0]?.body).toBe(single);
  });

  it('renders architecture dual Contracts and prose extensions per language', async () => {
    const bundled = await loadRegistry(defaultRegistryDir());
    for (const id of ARCHITECTURE_IDS) {
      const fragment = bundled.fragments.find((entry) => entry.meta.id === id);
      expect(fragment, id).toBeDefined();
      if (fragment === undefined) continue;
      expect(hasTypescriptOnlyMarker(fragment.body), id).toBe(false);
      expect(hasTypeScriptContractFence(fragment.body), id).toBe(true);
      expect(hasJavaScriptContractFence(fragment.body), id).toBe(true);
    }

    const feature = bundled.fragments.find((entry) => entry.meta.id === 'feature-based');
    expect(feature).toBeDefined();
    if (feature === undefined) return;
    const selection = resolved([feature]);
    const ts = renderTargetContext(
      profile({ language: 'typescript-strict', architecture: { id: 'feature-based', confidence: 1 } }),
      selection,
    );
    const js = renderTargetContext(
      profile({ language: 'javascript', architecture: { id: 'feature-based', confidence: 1 } }),
      selection,
    );
    const tsBody = ts.fragments.always.find((entry) => entry.id === 'feature-based')?.body ?? '';
    const jsBody = js.fragments.always.find((entry) => entry.id === 'feature-based')?.body ?? '';
    expect(getSections(tsBody).get('Summary')).toContain('index.ts');
    expect(getSections(tsBody).get('Summary')).not.toContain('index.js');
    expect(getSections(jsBody).get('Summary')).toContain('index.js');
    expect(getSections(jsBody).get('Summary')).not.toContain('index.ts');
    expect(tsBody).toContain('```ts');
    expect(tsBody).not.toContain('```js');
    expect(jsBody).toContain('```js');
    expect(jsBody).not.toContain('```ts');
    expect(tsBody).toContain('import type { Invoice }');
    expect(jsBody).not.toContain('import type');
  });

  it('sorts each scope by order then id, including workflows', () => {
    const ctx = renderTargetContext(
      profile(),
      resolved(
        [
          ruleFragment({
            id: 'zeta',
            name: 'Zeta',
            category: 'language',
            scope: 'always',
            order: 30,
            body: 'ZETA',
          }),
          ruleFragment({
            id: 'auto-b',
            name: 'Auto B',
            category: 'library',
            scope: 'auto',
            order: 10,
            body: 'AUTO_B',
            globs: ['{{src}}b.ts'],
          }),
          layeredFragment(),
          ruleFragment({
            id: 'alpha',
            name: 'Alpha',
            category: 'language',
            scope: 'always',
            order: 20,
            body: 'ALPHA',
          }),
          ruleFragment({
            id: 'auto-a',
            name: 'Auto A',
            category: 'library',
            scope: 'auto',
            order: 10,
            body: 'AUTO_A',
            globs: ['{{src}}a.ts'],
          }),
          ruleFragment({
            id: 'mentioned',
            name: 'Mentioned',
            category: 'library',
            scope: 'manual',
            order: 1,
            body: 'MANUAL',
          }),
        ],
        [
          workflowFragment({ id: 'second', name: 'Second', order: 60, body: 'SECOND' }),
          workflowFragment({
            id: 'first',
            name: 'First',
            order: 50,
            body: 'FIRST',
            argumentHint: '<name>',
          }),
        ],
      ),
    );

    expect(ctx.fragments.always.map((fragment) => fragment.id)).toEqual(['layered', 'alpha', 'zeta']);
    expect(ctx.fragments.auto.map((fragment) => fragment.id)).toEqual(['auto-a', 'auto-b']);
    expect(ctx.fragments.auto.map((fragment) => fragment.globs)).toEqual([['src/a.ts'], ['src/b.ts']]);
    expect(ctx.fragments.manual.map((fragment) => fragment.id)).toEqual(['mentioned']);
    expect(ctx.workflows.map((workflow) => workflow.id)).toEqual(['first', 'second']);
  });
});

describe('agentRuleBody', () => {
  it('omits framework Map and leaves other categories unchanged', () => {
    const framework = renderTargetContext(
      profile(),
      resolved([
        layeredFragment(),
        ruleFragment({
          id: 'nextjs-app-router',
          name: 'Next.js App Router',
          category: 'framework',
          scope: 'glob',
          order: 30,
          globs: ['{{src}}app/**/*.ts'],
          body: [
            '## Map',
            '| Path | Responsibility |',
            '| `{{src}}app/` | Route segments. |',
            '',
            '## Boundary',
            'Server Components by default.',
          ].join('\n'),
        }),
      ]),
    ).fragments.glob[0];
    const library = renderTargetContext(
      profile(),
      resolved([
        layeredFragment(),
        ruleFragment({
          id: 'zustand',
          name: 'Zustand',
          category: 'library',
          scope: 'auto',
          order: 40,
          globs: ['{{src}}**/*.ts'],
          body: ['## Map', 'Keep this for libraries.', '## Boundary', 'Client state.'].join('\n'),
        }),
      ]),
    ).fragments.auto[0];

    expect(framework).toBeDefined();
    expect(library).toBeDefined();
    if (framework === undefined || library === undefined) return;

    expect(framework.body).toContain('## Map');
    expect(agentRuleBody(framework)).not.toContain('## Map');
    expect(agentRuleBody(framework)).toContain('## Boundary');
    expect(agentRuleBody(framework)).toContain('Server Components by default.');
    expect(agentRuleBody(library)).toBe(library.body);
  });
});
