import { describe, expect, it } from 'vitest';
import { closestMatch, levenshtein } from '../src/suggest.js';

describe('levenshtein', () => {
  it.each([
    ['', '', 0],
    ['a', '', 1],
    ['', 'a', 1],
    ['cursor', 'cursor', 0],
    ['cursr', 'cursor', 1],
    ['xyz', 'cursor', 6],
  ])('%j → %j is %i', (left, right, distance) => {
    expect(levenshtein(left, right)).toBe(distance);
  });
});

describe('closestMatch', () => {
  const agents = ['cursor', 'claude', 'windsurf', 'copilot'] as const;

  it('returns the closest candidate within distance 2', () => {
    expect(closestMatch('cursr', agents)).toBe('cursor');
    expect(closestMatch('claud', agents)).toBe('claude');
  });

  it('returns undefined when nothing is close enough', () => {
    expect(closestMatch('xyz', agents)).toBeUndefined();
  });

  it('keeps the first candidate when distances tie', () => {
    expect(closestMatch('ab', ['ac', 'ad'])).toBe('ac');
  });
});
