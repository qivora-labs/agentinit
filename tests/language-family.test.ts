import { describe, expect, it } from 'vitest';
import {
  languageFamily,
  languageFamilyLabel,
  languageLabel,
} from '../src/language-family.js';

describe('languageFamily', () => {
  it.each([
    ['typescript-strict', 'typescript'],
    ['typescript', 'typescript'],
    ['javascript', 'javascript'],
    ['javascript-jsdoc', 'javascript'],
  ] as const)('%s → %s', (language, family) => {
    expect(languageFamily(language)).toBe(family);
  });
});

describe('languageFamilyLabel', () => {
  it.each([
    ['typescript', 'TypeScript'],
    ['javascript', 'JavaScript'],
  ] as const)('%s → %s', (family, label) => {
    expect(languageFamilyLabel(family)).toBe(label);
  });
});

describe('languageLabel', () => {
  it.each([
    ['typescript-strict', 'TypeScript · strict'],
    ['typescript', 'TypeScript'],
    ['javascript-jsdoc', 'JavaScript · JSDoc'],
    ['javascript', 'JavaScript'],
  ] as const)('%s → %s', (language, label) => {
    expect(languageLabel(language)).toBe(label);
  });
});
