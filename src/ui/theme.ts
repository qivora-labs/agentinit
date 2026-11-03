import pc from 'picocolors';

export interface ThemeGlyphs {
  readonly info: string;
  readonly success: string;
  readonly warn: string;
  readonly error: string;
  readonly step: string;
  readonly barStart: string;
  readonly bar: string;
  readonly barEnd: string;
}

export interface Theme {
  /** False on a pipe and in `--json`, so painters leave the text alone. */
  readonly tty: boolean;
  readonly unicode: boolean;
  readonly glyphs: ThemeGlyphs;
  readonly accent: (text: string) => string;
  readonly boldAccent: (text: string) => string;
  readonly muted: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly success: (text: string) => string;
  readonly warn: (text: string) => string;
  readonly error: (text: string) => string;
}

const UNICODE_GLYPHS = {
  info: '●',
  success: '◆',
  warn: '▲',
  error: '■',
  step: '◇',
  barStart: '┌',
  bar: '│',
  barEnd: '└',
} satisfies ThemeGlyphs;

const ASCII_GLYPHS = {
  info: '*',
  success: '+',
  warn: '!',
  error: 'x',
  step: '>',
  barStart: '+',
  bar: '|',
  barEnd: '+',
} satisfies ThemeGlyphs;

/**
 * Box drawing is garbage on a dumb terminal and on the legacy Windows console.
 * Callers pass `process` in; this module does not read it.
 */
export function supportsUnicode(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): boolean {
  if (env.TERM === 'dumb') return false;
  if (platform !== 'win32') return true;
  return env.WT_SESSION !== undefined
    || env.TERM_PROGRAM === 'vscode'
    || env.TERM_PROGRAM === 'WindowsTerminal'
    || env.ConEmuANSI === '1'
    || env.ANSICON !== undefined;
}

/** Set `NO_COLOR` (even empty) or `TERM=dumb` disables color. A pipe is handled separately. */
export function colorEnabled(env: NodeJS.ProcessEnv): boolean {
  if ('NO_COLOR' in env) return false;
  if (env.TERM === 'dumb') return false;
  return true;
}

export function createTheme(tty: boolean, unicode: boolean, color = tty): Theme {
  const colors = pc.createColors(tty && color);
  return {
    tty,
    unicode,
    glyphs: unicode ? UNICODE_GLYPHS : ASCII_GLYPHS,
    accent: colors.cyan,
    boldAccent: (text) => colors.bold(colors.cyan(text)),
    muted: colors.gray,
    dim: colors.dim,
    success: colors.green,
    warn: colors.yellow,
    error: colors.red,
  };
}
