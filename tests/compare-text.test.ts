import { describe, expect, it } from 'vitest';
import { compareText } from '../src/compare-text.js';

describe('compareText', () => {
  it.each([
    ['a', 'b', -1],
    ['b', 'a', 1],
    ['same', 'same', 0],
    ['A', 'a', -1],
    ['e', 'é', -1],
  ])('compareText(%j, %j) is %j', (left, right, order) => {
    expect(compareText(left, right)).toBe(order);
  });
});
