import { describe, expect, it } from 'vitest';
import { headingSlug } from '../../src/plan/markdown.js';

describe('headingSlug', () => {
  it.each([
    ['Project commands', 'project-commands'],
    ['TypeScript strict', 'typescript-strict'],
    ['API', 'api'],
    ['  I  ', 'i'],
  ])('slug for %j is %j', (title, slug) => {
    expect(headingSlug(title)).toBe(slug);
  });
});
