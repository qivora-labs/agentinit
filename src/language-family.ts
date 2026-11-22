import type { Language } from './types.js';

/** JavaScript vs TypeScript family; strictness and JSDoc are preferences, not family. */
export type LanguageFamily = 'typescript' | 'javascript';

export function languageFamily(language: Language): LanguageFamily {
  return language === 'javascript' || language === 'javascript-jsdoc' ? 'javascript' : 'typescript';
}

export function languageFamilyLabel(family: LanguageFamily): string {
  switch (family) {
    case 'typescript':
      return 'TypeScript';
    case 'javascript':
      return 'JavaScript';
    default: {
      const unexpected: never = family;
      throw new Error(`Unhandled language family: ${String(unexpected)}`);
    }
  }
}

/** Short display label for a concrete language id (picker / change list). */
export function languageLabel(language: Language): string {
  switch (language) {
    case 'typescript-strict':
      return 'TypeScript · strict';
    case 'typescript':
      return 'TypeScript';
    case 'javascript-jsdoc':
      return 'JavaScript · JSDoc';
    case 'javascript':
      return 'JavaScript';
    default: {
      const unexpected: never = language;
      throw new Error(`Unhandled language: ${String(unexpected)}`);
    }
  }
}
