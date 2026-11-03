import { describe, expect, it } from 'vitest';
import { colorEnabled, createTheme, supportsUnicode } from '../../src/ui/theme.js';

describe('supportsUnicode', () => {
  it.each([
    { env: { TERM: 'dumb' }, platform: 'linux' as const, unicode: false },
    { env: { TERM: 'dumb', WT_SESSION: '1' }, platform: 'win32' as const, unicode: false },
    { env: {}, platform: 'darwin' as const, unicode: true },
    { env: {}, platform: 'linux' as const, unicode: true },
    { env: {}, platform: 'win32' as const, unicode: false },
    { env: { WT_SESSION: '1' }, platform: 'win32' as const, unicode: true },
    { env: { TERM_PROGRAM: 'vscode' }, platform: 'win32' as const, unicode: true },
    { env: { TERM_PROGRAM: 'WindowsTerminal' }, platform: 'win32' as const, unicode: true },
    { env: { ConEmuANSI: '1' }, platform: 'win32' as const, unicode: true },
    { env: { ANSICON: '1' }, platform: 'win32' as const, unicode: true },
  ])('is $unicode on $platform', ({ env, platform, unicode }) => {
    expect(supportsUnicode(env, platform)).toBe(unicode);
  });
});

describe('colorEnabled', () => {
  it('stays on until NO_COLOR or a dumb terminal is set', () => {
    expect(colorEnabled({})).toBe(true);
    expect(colorEnabled({ NO_COLOR: '' })).toBe(false);
    expect(colorEnabled({ NO_COLOR: '1' })).toBe(false);
    expect(colorEnabled({ TERM: 'dumb' })).toBe(false);
  });
});

describe('createTheme', () => {
  it('uses Clack glyphs in a Unicode terminal and ASCII otherwise', () => {
    expect(createTheme(false, true).glyphs).toMatchObject({
      info: '●',
      success: '◆',
      warn: '▲',
      error: '■',
      step: '◇',
      barEnd: '└',
    });
    expect(createTheme(false, false).glyphs).toMatchObject({
      info: '*',
      success: '+',
      warn: '!',
      error: 'x',
      step: '>',
      barStart: '+',
      bar: '|',
      barEnd: '+',
    });
  });

  it('emits no color when the stream is not a terminal or color is off', () => {
    expect(createTheme(false, true).accent('agentinit')).toBe('agentinit');
    expect(createTheme(true, true, false).accent('agentinit')).toBe('agentinit');
    expect(createTheme(true, true, true).accent('agentinit')).toContain('\u001b[');
  });
});
