import { beforeAll, describe, expect, it } from 'vitest';
import { expandLanguageGlobs, type LanguageGlobFacts } from '../../src/plan/language-globs.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import { resolveSelection } from '../../src/registry/resolve.js';
import { copilotAdapter } from '../../src/targets/copilot.js';
import { cursorAdapter } from '../../src/targets/cursor.js';
import { windsurfAdapter } from '../../src/targets/windsurf.js';
import type { Language } from '../../src/types.js';
import { profile } from './helpers.js';

/** Same budget Windsurf enforces in `src/targets/windsurf.ts`. */
const RULE_CHAR_LIMIT = 12_000;

function facts(overrides: Partial<LanguageGlobFacts> = {}): LanguageGlobFacts {
  return {
    language: 'typescript-strict',
    allowJs: false,
    ...overrides,
  };
}

const SAMPLE = [
  '{{src}}**/*.ts',
  '{{src}}**/*.tsx',
  '**/*.test.ts',
  'styles/**/*.css',
] as const;

describe('expandLanguageGlobs', () => {
  it.each(['javascript', 'javascript-jsdoc'] as const)(
    'rewrites TypeScript extensions to JavaScript for %s',
    (language: Language) => {
      expect(expandLanguageGlobs(SAMPLE, facts({ language }))).toEqual([
        '{{src}}**/*.js',
        '{{src}}**/*.jsx',
        '**/*.test.js',
        'styles/**/*.css',
      ]);
    },
  );

  it('leaves TypeScript globs unchanged when allowJs is false', () => {
    const input = [...SAMPLE];
    expect(expandLanguageGlobs(input, facts({ language: 'typescript', allowJs: false }))).toEqual(
      input,
    );
    expect(expandLanguageGlobs(input, facts({ language: 'typescript-strict' }))).toEqual(input);
  });

  it('widens TypeScript globs with JavaScript siblings when allowJs is true', () => {
    expect(
      expandLanguageGlobs(
        ['src/app/**/*.ts', 'src/app/**/*.tsx', '**/*.css'],
        facts({ language: 'typescript-strict', allowJs: true }),
      ),
    ).toEqual([
      'src/app/**/*.ts',
      'src/app/**/*.js',
      'src/app/**/*.tsx',
      'src/app/**/*.jsx',
      '**/*.css',
    ]);
  });

  it('does not map .tsx to .js', () => {
    expect(expandLanguageGlobs(['a.tsx'], facts({ language: 'javascript' }))).toEqual(['a.jsx']);
    expect(expandLanguageGlobs(['a.tsx'], facts({ allowJs: true }))).toEqual(['a.tsx', 'a.jsx']);
  });

  it('does not invent .mjs, .cjs, .mts, or .cts siblings', () => {
    const input = ['a.mts', 'b.cts', 'c.mjs', 'd.cjs'];
    expect(expandLanguageGlobs(input, facts({ language: 'javascript' }))).toEqual(input);
    expect(expandLanguageGlobs(input, facts({ allowJs: true }))).toEqual(input);
  });

  it('deduplicates after JavaScript rewrite and after allowJs widening', () => {
    expect(expandLanguageGlobs(['a.ts', 'a.js', 'a.ts'], facts({ language: 'javascript' }))).toEqual([
      'a.js',
    ]);
    expect(expandLanguageGlobs(['a.ts', 'a.js'], facts({ allowJs: true }))).toEqual(['a.ts', 'a.js']);
  });

  it('is idempotent for each language mode', () => {
    const jsOnce = expandLanguageGlobs(SAMPLE, facts({ language: 'javascript' }));
    expect(expandLanguageGlobs(jsOnce, facts({ language: 'javascript' }))).toEqual(jsOnce);

    const allowJsOnce = expandLanguageGlobs(SAMPLE, facts({ allowJs: true }));
    expect(expandLanguageGlobs(allowJsOnce, facts({ allowJs: true }))).toEqual(allowJsOnce);

    const tsOnce = expandLanguageGlobs(SAMPLE, facts());
    expect(expandLanguageGlobs(tsOnce, facts())).toEqual(tsOnce);
  });
});

describe('expanded vitest globs stay under joined-string budgets', () => {
  let registry: Registry;

  beforeAll(async () => {
    registry = await loadRegistry();
  });

  it('keeps vitest + allowJs under 12,000 characters for Cursor, Windsurf, and Copilot', () => {
    const selection = resolveSelection(registry, {
      language: 'typescript-strict',
      architecture: 'layered',
      frameworks: [],
      libraries: ['vitest'],
      origin: {},
    });
    const ctx = renderTargetContext(
      profile({ language: 'typescript-strict', allowJs: true, agents: ['cursor', 'windsurf', 'copilot'] }),
      selection,
    );
    const vitest = ctx.fragments.glob.find((fragment) => fragment.id === 'vitest');
    expect(vitest).toBeDefined();
    expect(vitest?.globs.length).toBeGreaterThan(23);

    const windsurf = windsurfAdapter(ctx).find((op) => op.path === '.windsurf/rules/agentinit-vitest.md');
    const cursor = cursorAdapter(ctx).find((op) => op.path === '.cursor/rules/agentinit-vitest.mdc');
    const copilot = copilotAdapter(ctx).find(
      (op) => op.path === '.github/instructions/agentinit-vitest.instructions.md',
    );

    expect(windsurf?.content.length).toBeLessThan(RULE_CHAR_LIMIT);
    expect(cursor?.content.length).toBeLessThan(RULE_CHAR_LIMIT);
    expect(copilot?.content.length).toBeLessThan(RULE_CHAR_LIMIT);
  });
});
