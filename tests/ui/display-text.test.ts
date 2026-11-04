import { describe, expect, it } from 'vitest';
import { fitToWidth, sanitizeDisplayText, sanitizeMultilineDisplayText } from '../../src/ui/display-text.js';

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

describe('fitToWidth', () => {
  const rail = '│  ';

  it('wraps at word boundaries and repeats the rail prefix', () => {
    expect(fitToWidth('review the changes with git diff now', 20, rail)).toBe(
      ['│  review the', '│  changes with git', '│  diff now'].join('\n'),
    );
  });

  it('hard-breaks a single word longer than the content width', () => {
    expect(fitToWidth('abcdefghijklmnop', 10, rail)).toBe(
      ['│  abcdefg', '│  hijklmn', '│  op'].join('\n'),
    );
  });

  it('ignores color codes when measuring width', () => {
    const painted = `\u001b[33m${'warning '.repeat(5).trim()}\u001b[0m`;
    const wrapped = fitToWidth(painted, 18, rail);
    expect(wrapped.split('\n').every((line) => line.startsWith(rail))).toBe(true);
    expect(wrapped).toContain('\u001b[33m');
    expect(wrapped).toContain('\u001b[0m');
    for (const line of wrapped.split('\n')) {
      const plain = stripColor(line);
      expect(plain.length).toBeLessThanOrEqual(18);
    }
  });

  it('prefixes every line including short ones', () => {
    expect(fitToWidth('ok\nnext', 40, rail)).toBe('│  ok\n│  next');
  });

  it('uses a different prefix on wrap continuations', () => {
    expect(fitToWidth('review the changes with git diff now', 20, '▲  ', rail)).toBe(
      ['▲  review the', '│  changes with git', '│  diff now'].join('\n'),
    );
  });
});

function stripColor(text: string): string {
  let plain = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '\u001b') {
      plain += char ?? '';
      continue;
    }
    const end = text.indexOf('m', index);
    index = end === -1 ? text.length : end;
  }
  return plain;
}
