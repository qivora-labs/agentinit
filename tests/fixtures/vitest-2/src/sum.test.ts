import { describe, expect, it } from 'vitest';
import { sum } from './sum.js';

describe('sum', () => {
  it('returns the total of both numbers', () => {
    expect(sum(1, 2)).toBe(3);
  });
});
