import { createPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { formatDiff } from '../../src/ui/diff.js';
import { createTheme } from '../../src/ui/theme.js';

const plain = createTheme(false, true);
const tty = createTheme(true, true, true);

const SAMPLE = [
  'Index: CLAUDE.md',
  '===================================================================',
  '--- CLAUDE.md',
  '+++ CLAUDE.md',
  '@@ -1,2 +1,3 @@',
  ' keep',
  '-old',
  '+new',
  '+extra',
  '',
  '',
].join('\n');

describe('formatDiff', () => {
  it('drops Index, ===, ---, +++ headers and trailing blank lines', async () => {
    const formatted = formatDiff(SAMPLE, plain);
    expect(formatted).toBe(['@@ -1,2 +1,3 @@', ' keep', '-old', '+new', '+extra'].join('\n'));
    expect(formatted).not.toMatch(/^Index:/mu);
    expect(formatted).not.toMatch(/^===/mu);
    expect(formatted).not.toMatch(/^--- /mu);
    expect(formatted).not.toMatch(/^\+\+\+ /mu);
    expect(formatted.endsWith('\n')).toBe(false);
    await expect(`${formatted}\n`).toMatchFileSnapshot('../__snapshots__/ui/conflict-diff.txt');
  });

  it('keeps hunk lines that only look like headers (removed markdown HR)', () => {
    const unified = [
      'Index: notes.md',
      '===================================================================',
      '--- notes.md',
      '+++ notes.md',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '----',
      '+still here',
    ].join('\n');
    const formatted = formatDiff(unified, plain);
    expect(formatted.split('\n')).toEqual(['@@ -1,2 +1,2 @@', ' keep', '----', '+still here']);
  });

  it('paints + green, - red, and @@ gray on a TTY', () => {
    const formatted = formatDiff(SAMPLE, tty);
    expect(formatted).toContain('\u001b[32m+new\u001b[39m');
    expect(formatted).toContain('\u001b[31m-old\u001b[39m');
    expect(formatted).toContain('\u001b[90m@@ -1,2 +1,3 @@\u001b[39m');
    expect(formatted).toContain(' keep');
  });

  it('caps a long diff at 40 lines on a TTY', () => {
    const before = Array.from({ length: 60 }, (_, index) => `line-${String(index)}\n`).join('');
    const after = Array.from({ length: 60 }, (_, index) => `next-${String(index)}\n`).join('');
    const unified = createPatch('file.md', before, after);
    const formatted = formatDiff(unified, tty);
    const lines = formatted.split('\n');
    expect(lines.length).toBe(41);
    expect(lines[40]).toMatch(/^… \d+ more lines \(run with --dry-run to see all\)$/u);
  });

  it('shows the full diff when full is set', () => {
    const before = Array.from({ length: 60 }, (_, index) => `line-${String(index)}\n`).join('');
    const after = Array.from({ length: 60 }, (_, index) => `next-${String(index)}\n`).join('');
    const unified = createPatch('file.md', before, after);
    const formatted = formatDiff(unified, tty, { full: true });
    expect(formatted).not.toContain('more lines');
    expect(formatted.split('\n').length).toBeGreaterThan(40);
  });

  it('does not cap on a pipe', () => {
    const before = Array.from({ length: 60 }, (_, index) => `line-${String(index)}\n`).join('');
    const after = Array.from({ length: 60 }, (_, index) => `next-${String(index)}\n`).join('');
    const unified = createPatch('file.md', before, after);
    const formatted = formatDiff(unified, plain);
    expect(formatted).not.toContain('more lines');
    expect(formatted.split('\n').length).toBeGreaterThan(40);
  });
});
