import { describe, expect, it } from 'vitest';
import { sanitizeDisplayText, sanitizeMultilineDisplayText } from '../../src/ui/display-text.js';

const cases: readonly { readonly name: string; readonly value: string; readonly text: string }[] = [
  { name: 'plain text', value: 'React + Vite', text: 'React + Vite' },
  { name: 'a CSI color sequence', value: '\u001b[31mred\u001b[0m', text: 'red' },
  { name: 'an OSC title terminated by BEL', value: 'a\u001b]0;evil\u0007b', text: 'ab' },
  { name: 'an OSC title terminated by ST', value: 'a\u001b]0;evil\u001b\\b', text: 'ab' },
  { name: 'a C1 CSI sequence', value: 'a\u009b2Jb', text: 'ab' },
  { name: 'a two-byte escape', value: 'a\u001bcb', text: 'ab' },
  { name: 'carriage return and newline', value: 'a\r\nb', text: 'ab' },
  { name: 'line and paragraph separators', value: 'a\u2028b\u2029c', text: 'abc' },
  { name: 'null, tab, and delete', value: 'a\u0000\tb\u007fc', text: 'abc' },
];

describe('sanitizeDisplayText', () => {
  it.each(cases)('strips $name', ({ value, text }) => {
    expect(sanitizeDisplayText(value)).toBe(text);
  });

  it('drops an unfinished escape introducer and keeps the text after it', () => {
    expect(sanitizeDisplayText('name\u001b]0;evil and the question?')).toBe(
      'name]0;evil and the question?',
    );
  });
});

describe('sanitizeMultilineDisplayText', () => {
  it('keeps newlines and still strips other controls', () => {
    expect(sanitizeMultilineDisplayText('a\nb\r\u001b[31mc')).toBe('a\nbc');
  });

  it('does not treat a newline as the end of an unfinished sequence', () => {
    expect(sanitizeMultilineDisplayText('evil\u001b]0;title\nnext line')).toBe('evil]0;title\nnext line');
  });
});
