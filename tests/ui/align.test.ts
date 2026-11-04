import { describe, expect, it } from 'vitest';
import { alignColumns, stripAnsi, visibleWidth } from '../../src/ui/align.js';
import { createTheme } from '../../src/ui/theme.js';

describe('visibleWidth', () => {
  it('ignores ANSI color codes', () => {
    const theme = createTheme(true, true, true);
    expect(visibleWidth(theme.accent('Cursor'))).toBe(6);
    expect(stripAnsi(theme.warn('skipped'))).toBe('skipped');
  });
});

describe('alignColumns', () => {
  it('pads cells so columns line up', () => {
    expect(
      alignColumns([
        ['Cursor', '5 files', '.cursor/'],
        ['GitHub Copilot', '1 file', '.github/'],
      ]),
    ).toEqual([
      'Cursor          5 files  .cursor/',
      'GitHub Copilot  1 file   .github/',
    ]);
  });

  it('measures painted cells by visible width', () => {
    const theme = createTheme(true, true, true);
    const rows = alignColumns([
      [theme.accent('Cursor'), '5 files'],
      ['Windsurf', '1 file'],
    ]);
    expect(stripAnsi(rows[0] ?? '')).toBe('Cursor    5 files');
    expect(rows[1]).toBe('Windsurf  1 file');
  });
});
