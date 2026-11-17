import type { Language } from '../types.js';

/** Profile facts that decide how rendered rule globs are expanded. */
export interface LanguageGlobFacts {
  readonly language: Language;
  readonly allowJs: boolean;
}

/**
 * Map a TypeScript extension at the end of a rendered glob to its JavaScript
 * sibling. `.tsx` is checked before `.ts` so `.tsx` does not become `.jsx` via
 * a bare `.ts` suffix match. No `.mjs` / `.cjs` / `.mts` / `.cts` mapping.
 */
function javascriptSibling(glob: string): string | null {
  if (glob.endsWith('.tsx')) return `${glob.slice(0, -'.tsx'.length)}.jsx`;
  if (glob.endsWith('.ts')) return `${glob.slice(0, -'.ts'.length)}.js`;
  return null;
}

function isJavaScriptLanguage(language: Language): boolean {
  return language === 'javascript' || language === 'javascript-jsdoc';
}

/**
 * Expand or rewrite rendered globs for the project language.
 *
 * - JavaScript: `.ts` → `.js`, `.tsx` → `.jsx` (replacement; no TypeScript
 *   extensions remain).
 * - TypeScript with `allowJs`: keep each original, then insert its sibling
 *   immediately after (deduplicated).
 * - TypeScript without `allowJs`: unchanged.
 *
 * Order is deterministic. Forward slashes are preserved; no braces or commas
 * are introduced inside a pattern.
 */
export function expandLanguageGlobs(
  globs: readonly string[],
  facts: LanguageGlobFacts,
): string[] {
  if (isJavaScriptLanguage(facts.language)) {
    return rewriteForJavaScript(globs);
  }
  if (facts.allowJs) {
    return widenForAllowJs(globs);
  }
  return [...globs];
}

function rewriteForJavaScript(globs: readonly string[]): string[] {
  const rendered: string[] = [];
  const seen = new Set<string>();
  for (const glob of globs) {
    const value = javascriptSibling(glob) ?? glob;
    if (seen.has(value)) continue;
    seen.add(value);
    rendered.push(value);
  }
  return rendered;
}

function widenForAllowJs(globs: readonly string[]): string[] {
  const rendered: string[] = [];
  const seen = new Set<string>();
  for (const glob of globs) {
    if (!seen.has(glob)) {
      seen.add(glob);
      rendered.push(glob);
    }
    const sibling = javascriptSibling(glob);
    if (sibling === null || seen.has(sibling)) continue;
    seen.add(sibling);
    rendered.push(sibling);
  }
  return rendered;
}
