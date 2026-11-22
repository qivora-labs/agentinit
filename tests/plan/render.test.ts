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

const FRAMEWORK_IDS = [
  'express',
  'express-4',
  'fastify',
  'nextjs-app-router',
  'nextjs-app-router-15',
  'nextjs-pages-router',
  'react-vite',
] as const;

const UI_STATE_LIBRARY_IDS = ['shadcn', 'tailwind', 'tanstack-query', 'zustand'] as const;
const FORMS_TESTING_LIBRARY_IDS = ['playwright', 'react-hook-form-zod', 'vitest'] as const;

function renderedFragmentBody(
  ctx: ReturnType<typeof renderTargetContext>,
  id: string,
): string {
  const fragments = [
    ...ctx.fragments.always,
    ...ctx.fragments.glob,
    ...ctx.fragments.auto,
    ...ctx.fragments.manual,
  ];
  return fragments.find((entry) => entry.id === id)?.body ?? '';
}

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
    const featureSelection = resolved([feature]);
    const featureTs = renderTargetContext(
      profile({ language: 'typescript-strict', architecture: { id: 'feature-based', confidence: 1 } }),
      featureSelection,
    );
    const featureJs = renderTargetContext(
      profile({ language: 'javascript', architecture: { id: 'feature-based', confidence: 1 } }),
      featureSelection,
    );
    const featureTsBody = featureTs.fragments.always.find((entry) => entry.id === 'feature-based')?.body ?? '';
    const featureJsBody = featureJs.fragments.always.find((entry) => entry.id === 'feature-based')?.body ?? '';
    expect(getSections(featureTsBody).get('Summary')).toContain('index.ts');
    expect(getSections(featureTsBody).get('Summary')).not.toContain('index.js');
    expect(getSections(featureJsBody).get('Summary')).toContain('index.js');
    expect(getSections(featureJsBody).get('Summary')).not.toContain('index.ts');
    expect(featureTsBody).toContain('```ts');
    expect(featureTsBody).not.toContain('```js');
    expect(featureJsBody).toContain('```js');
    expect(featureJsBody).not.toContain('```ts');
    expect(featureTsBody).toContain('import type { Invoice }');
    expect(featureJsBody).not.toContain('import type');

    const layered = bundled.fragments.find((entry) => entry.meta.id === 'layered');
    expect(layered).toBeDefined();
    if (layered === undefined) return;
    const layeredSelection = resolved([layered]);
    const layeredTs = renderTargetContext(
      profile({ language: 'typescript-strict', architecture: { id: 'layered', confidence: 1 } }),
      layeredSelection,
    );
    const layeredJs = renderTargetContext(
      profile({ language: 'javascript', architecture: { id: 'layered', confidence: 1 } }),
      layeredSelection,
    );
    const layeredTsBody = layeredTs.fragments.always.find((entry) => entry.id === 'layered')?.body ?? '';
    const layeredJsBody = layeredJs.fragments.always.find((entry) => entry.id === 'layered')?.body ?? '';
    expect(layeredTsBody).toContain('load-invoice.ts');
    expect(layeredTsBody).toContain('import type { Invoice }');
    expect(layeredTsBody).toContain('import type { InvoiceStore }');
    expect(layeredJsBody).toContain('load-invoice.js');
    expect(layeredJsBody).not.toContain('import type');
    expect(layeredJsBody).toContain('export function loadInvoice(store, id)');
  });

  it('renders framework dual Contracts and prose extensions per language', async () => {
    const bundled = await loadRegistry(defaultRegistryDir());
    for (const id of FRAMEWORK_IDS) {
      const fragment = bundled.fragments.find((entry) => entry.meta.id === id);
      expect(fragment, id).toBeDefined();
      if (fragment === undefined) continue;
      expect(hasTypescriptOnlyMarker(fragment.body), id).toBe(false);
      expect(hasTypeScriptContractFence(fragment.body), id).toBe(true);
      expect(hasJavaScriptContractFence(fragment.body), id).toBe(true);
    }

    const next = bundled.fragments.find((entry) => entry.meta.id === 'nextjs-app-router');
    expect(next).toBeDefined();
    if (next === undefined) return;
    const nextSelection = resolved([next]);
    const nextTs = renderTargetContext(profile({ language: 'typescript-strict' }), nextSelection);
    const nextJs = renderTargetContext(profile({ language: 'javascript' }), nextSelection);
    const nextTsBody = renderedFragmentBody(nextTs, 'nextjs-app-router');
    const nextJsBody = renderedFragmentBody(nextJs, 'nextjs-app-router');
    expect(nextTsBody).toContain('route.ts');
    expect(nextTsBody).toContain('error.tsx');
    expect(nextTsBody).not.toContain('route.js');
    expect(nextJsBody).toContain('route.js');
    expect(nextJsBody).toContain('error.jsx');
    expect(nextJsBody).not.toContain('route.ts');
    expect(nextTsBody).toContain('```tsx');
    expect(nextTsBody).not.toContain('```jsx');
    expect(nextJsBody).toContain('```jsx');
    expect(nextJsBody).not.toContain('```tsx');
    expect(nextTsBody).toContain('params: Promise<{ id: string }>');
    expect(nextJsBody).toContain('export default async function Page({ params })');
    expect(nextJsBody).not.toContain('Promise<{ id: string }>');

    const express = bundled.fragments.find((entry) => entry.meta.id === 'express');
    expect(express).toBeDefined();
    if (express === undefined) return;
    const expressSelection = resolved([express]);
    const expressTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), expressSelection),
      'express',
    );
    const expressJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), expressSelection),
      'express',
    );
    expect(expressTsBody).toContain('(err: unknown, _req: Request, res: Response, _next: NextFunction)');
    expect(expressJsBody).toContain('(err, _req, res, _next)');
    expect(expressJsBody).not.toContain('err: unknown');
    expect(expressTsBody).toContain('```ts');
    expect(expressTsBody).not.toContain('```js');
    expect(expressJsBody).toContain('```js');
    expect(expressJsBody).not.toContain('```ts');

    const fastify = bundled.fragments.find((entry) => entry.meta.id === 'fastify');
    expect(fastify).toBeDefined();
    if (fastify === undefined) return;
    const fastifySelection = resolved([fastify]);
    const fastifyTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), fastifySelection),
      'fastify',
    );
    const fastifyJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), fastifySelection),
      'fastify',
    );
    expect(fastifyTsBody).toContain('withTypeProvider');
    expect(fastifyTsBody).toContain('fastify: FastifyInstance');
    expect(fastifyJsBody).not.toContain('withTypeProvider');
    expect(fastifyJsBody).not.toContain('FastifyInstance');
    expect(fastifyJsBody).toContain('export async function userRoutes(fastify)');
  });

  it('renders ui and state library dual Contracts per language', async () => {
    const bundled = await loadRegistry(defaultRegistryDir());
    for (const id of UI_STATE_LIBRARY_IDS) {
      const fragment = bundled.fragments.find((entry) => entry.meta.id === id);
      expect(fragment, id).toBeDefined();
      if (fragment === undefined) continue;
      expect(hasTypescriptOnlyMarker(fragment.body), id).toBe(false);
      expect(hasTypeScriptContractFence(fragment.body), id).toBe(true);
      expect(hasJavaScriptContractFence(fragment.body), id).toBe(true);
    }

    const tanstack = bundled.fragments.find((entry) => entry.meta.id === 'tanstack-query');
    expect(tanstack).toBeDefined();
    if (tanstack === undefined) return;
    const tanstackSelection = resolved([tanstack]);
    const tanstackTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), tanstackSelection),
      'tanstack-query',
    );
    const tanstackJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), tanstackSelection),
      'tanstack-query',
    );
    expect(tanstackTsBody).toContain('```tsx');
    expect(tanstackTsBody).not.toContain('```jsx');
    expect(tanstackJsBody).toContain('```jsx');
    expect(tanstackJsBody).not.toContain('```tsx');
    expect(tanstackTsBody).toContain('UseMutationResult<unknown, Error, unknown>');
    expect(tanstackJsBody).toContain('export function useAddTodo()');
    expect(tanstackJsBody).not.toContain('UseMutationResult');

    const zustand = bundled.fragments.find((entry) => entry.meta.id === 'zustand');
    expect(zustand).toBeDefined();
    if (zustand === undefined) return;
    const zustandSelection = resolved([zustand]);
    const zustandTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), zustandSelection),
      'zustand',
    );
    const zustandJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), zustandSelection),
      'zustand',
    );
    expect(zustandTsBody).toContain('create<CartState>()((set) => ({');
    expect(zustandJsBody).toContain('create((set) => ({');
    expect(zustandJsBody).not.toContain('create<CartState>');
    expect(zustandJsBody).toContain('useShallow((state) => ({ count: state.count, add: state.add }))');

    const shadcn = bundled.fragments.find((entry) => entry.meta.id === 'shadcn');
    expect(shadcn).toBeDefined();
    if (shadcn === undefined) return;
    const shadcnSelection = resolved([shadcn]);
    const shadcnJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), shadcnSelection),
      'shadcn',
    );
    expect(shadcnJsBody).toContain('"tsx": false');
    expect(shadcnJsBody).toContain('buttonVariants({ variant: "outline" })');

    const tailwind = bundled.fragments.find((entry) => entry.meta.id === 'tailwind');
    expect(tailwind).toBeDefined();
    if (tailwind === undefined) return;
    const tailwindSelection = resolved([tailwind]);
    const tailwindTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), tailwindSelection),
      'tailwind',
    );
    const tailwindJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), tailwindSelection),
      'tailwind',
    );
    expect(tailwindTsBody).toContain('```tsx');
    expect(tailwindTsBody).not.toContain('```jsx');
    expect(tailwindJsBody).toContain('```jsx');
    expect(tailwindJsBody).not.toContain('```tsx');
    expect(tailwindTsBody).toContain(
      'export function Banner({ error, className }: { error: boolean; className?: string })',
    );
    expect(tailwindJsBody).toContain('export function Banner({ error, className })');
    expect(tailwindJsBody).not.toContain('error: boolean');
    expect(tailwindJsBody).toContain('cn("px-3 text-green-600", error && "text-red-600", className)');
    expect(tailwindJsBody).toContain('text-${color}-600');
  });

  it('renders forms and testing library dual Contracts per language', async () => {
    const bundled = await loadRegistry(defaultRegistryDir());
    for (const id of FORMS_TESTING_LIBRARY_IDS) {
      const fragment = bundled.fragments.find((entry) => entry.meta.id === id);
      expect(fragment, id).toBeDefined();
      if (fragment === undefined) continue;
      expect(hasTypescriptOnlyMarker(fragment.body), id).toBe(false);
      expect(hasTypeScriptContractFence(fragment.body), id).toBe(true);
      expect(hasJavaScriptContractFence(fragment.body), id).toBe(true);
    }

    const rhf = bundled.fragments.find((entry) => entry.meta.id === 'react-hook-form-zod');
    expect(rhf).toBeDefined();
    if (rhf === undefined) return;
    const rhfSelection = resolved([rhf]);
    const rhfTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), rhfSelection),
      'react-hook-form-zod',
    );
    const rhfJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), rhfSelection),
      'react-hook-form-zod',
    );
    expect(rhfTsBody).toContain('```tsx');
    expect(rhfTsBody).not.toContain('```jsx');
    expect(rhfJsBody).toContain('```jsx');
    expect(rhfJsBody).not.toContain('```tsx');
    expect(rhfTsBody).toContain('z.infer<typeof profileSchema>');
    expect(rhfTsBody).toContain(
      'useForm<z.input<typeof profileSchema>, unknown, z.output<typeof profileSchema>>',
    );
    expect(rhfTsBody).toContain('take submitted values from `z.infer`');
    expect(rhfJsBody).not.toContain('z.infer');
    expect(rhfJsBody).not.toContain('SubmitHandler');
    expect(rhfJsBody).toContain('useForm({');
    expect(rhfJsBody).toContain('export function parseProfile(input)');

    const vitestFragment = bundled.fragments.find((entry) => entry.meta.id === 'vitest');
    expect(vitestFragment).toBeDefined();
    if (vitestFragment === undefined) return;
    const vitestSelection = resolved([vitestFragment]);
    const vitestTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), vitestSelection),
      'vitest',
    );
    const vitestJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), vitestSelection),
      'vitest',
    );
    expect(vitestTsBody).toContain('```ts');
    expect(vitestTsBody).not.toContain('```js');
    expect(vitestJsBody).toContain('```js');
    expect(vitestJsBody).not.toContain('```ts');
    expect(vitestTsBody).toContain('function runLater(callback: () => void, ms: number)');
    expect(vitestJsBody).toContain('function runLater(callback, ms)');
    expect(vitestJsBody).not.toContain('callback: () => void');

    const playwrightFragment = bundled.fragments.find((entry) => entry.meta.id === 'playwright');
    expect(playwrightFragment).toBeDefined();
    if (playwrightFragment === undefined) return;
    const playwrightSelection = resolved([playwrightFragment]);
    const playwrightTsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'typescript-strict' }), playwrightSelection),
      'playwright',
    );
    const playwrightJsBody = renderedFragmentBody(
      renderTargetContext(profile({ language: 'javascript' }), playwrightSelection),
      'playwright',
    );
    expect(playwrightTsBody).toContain('```ts');
    expect(playwrightTsBody).not.toContain('```js');
    expect(playwrightJsBody).toContain('```js');
    expect(playwrightJsBody).not.toContain('```ts');
    expect(playwrightJsBody).toContain('const saveButton = page.getByRole("button", { name: "Save" })');
    expect(playwrightJsBody).toContain('const savedStatus = page.getByRole("status", { name: "Saved Ada" })');
    expect(playwrightJsBody).toContain('await expect(savedStatus).toBeVisible()');
    expect(playwrightJsBody).toContain('await expect(savedStatus).toHaveText("Saved Ada")');
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
