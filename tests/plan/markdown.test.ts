import { describe, expect, it } from 'vitest';
import { escapeMarkdownText, headingSlug, markdownInlineCode, nestHeadings } from '../../src/plan/markdown.js';

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

describe('escapeMarkdownText', () => {
  it.each([
    ['Business rules.', 'Business rules.'],
    ['a|b', 'a\\|b'],
    ['use `code`', 'use \\`code\\`'],
    ['a\\b', 'a\\\\b'],
    ['See [docs](http://evil.test)', 'See \\[docs\\](http://evil.test)'],
    ['a<b>', 'a\\<b\\>'],
    ['a\nb', 'a b'],
    ['a\r\nb', 'a b'],
    ['a\u2028b', 'a b'],
  ])('escapes %j as %j', (value, escaped) => {
    expect(escapeMarkdownText(value)).toBe(escaped);
  });
});

describe('markdownInlineCode', () => {
  it.each([
    ['src/lib', '`src/lib`'],
    ['src/components/<group>/', '`src/components/<group>/`'],
    ['a|b', 'a\\|b'],
    ['c`d', '``c`d``'],
    ['`c', '`` `c ``'],
    ['a\nb', '`a b`'],
    ['p|q`r', 'p\\|q\\`r'],
  ])('formats %j as %j', (value, formatted) => {
    expect(markdownInlineCode(value)).toBe(formatted);
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
