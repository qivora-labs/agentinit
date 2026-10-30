import { describe, expect, it } from 'vitest';
import { headingSlug, nestHeadings } from '../../src/plan/markdown.js';

describe('headingSlug', () => {
  it.each([
    ['Project commands', 'project-commands'],
    ['TypeScript strict', 'typescript-strict'],
    ['API', 'api'],
    ['  I  ', '--i--'],
    ["What's new?", 'whats-new'],
    ['Hello, World!', 'hello-world'],
    ['123', '123'],
    ['1.2 Release', '12-release'],
    ['😄 emoji', '-emoji'],
    ['foo_bar', 'foo_bar'],
    ['API & SDK', 'api--sdk'],
    ['Привет non-latin 你好', 'привет-non-latin-你好'],
  ])('slug for %j is %j', (title, slug) => {
    expect(headingSlug(title)).toBe(slug);
  });
});

describe('nestHeadings', () => {
  it.each([
    ['# Title', '## Title'],
    ['## Title', '### Title'],
    ['### Title', '#### Title'],
    ['#### Title', '##### Title'],
    ['##### Title', '###### Title'],
    ['###### Title', '###### Title'],
    ['####### Title', '####### Title'],
    ['   ##### Deep', '   ###### Deep'],
    ['    # Code', '    # Code'],
  ])('shifts %j to %j', (input, nested) => {
    expect(nestHeadings(input)).toBe(nested);
  });

  it('leaves headings inside a fence at their original level', () => {
    const body = ['## Outside', '', '```md', '## Inside', '###### Inside', '```', '##### After'].join('\n');
    expect(nestHeadings(body)).toBe(
      ['### Outside', '', '```md', '## Inside', '###### Inside', '```', '###### After'].join('\n'),
    );
  });
});
