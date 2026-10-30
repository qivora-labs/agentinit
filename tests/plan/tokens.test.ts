import { describe, expect, it } from 'vitest';
import { ALWAYS_ON_TOKEN_LIMIT, alwaysOnTokenWarning, estimateTokens } from '../../src/plan/tokens.js';

describe('estimateTokens', () => {
  it.each([
    ['', 0],
    ['a', 1],
    ['abcd', 1],
    ['abcde', 2],
    ['x'.repeat(6000), 1500],
    ['x'.repeat(6001), 1501],
  ])('ceil(characters / 4) for %j is %i', (text, expected) => {
    expect(estimateTokens(text)).toBe(expected);
  });
});

describe('alwaysOnTokenWarning', () => {
  it('stays quiet at the 1,500 budget and warns above it', () => {
    expect(ALWAYS_ON_TOKEN_LIMIT).toBe(1500);
    expect(alwaysOnTokenWarning(1500)).toBeUndefined();
    expect(alwaysOnTokenWarning(1501)).toEqual({
      kind: 'always-on-tokens',
      tokens: 1501,
      limit: 1500,
    });
  });
});
