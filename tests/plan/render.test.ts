import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import { resolveSelection, type ResolvedSelection } from '../../src/registry/resolve.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { layeredFragment, profile, resolved, ruleFragment, workflowFragment } from './helpers.js';

const sampleDir = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));

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
    expect(ctx.placeholders).toEqual({ src: 'src/', pm: 'pnpm', scripts: { lint: 'eslint .', test: 'vitest' } });
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
