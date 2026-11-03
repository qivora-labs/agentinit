import type { Writable } from 'node:stream';
import { formatBanner, formatClose, type CloseTone } from './brand.js';
import { createTheme, type Theme } from './theme.js';

export interface Logger {
  readonly presented: boolean;
  readonly theme: Theme;
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  step: (message: string) => void;
  /** Wordmark on a TTY. A pipe, `--json`, and a second call write nothing. */
  open: () => void;
  /**
   * Bottom rule. On a pipe this prints `message` once, so a status line can
   * move here without showing up twice. `ttyOnly` is chrome that pipes omit.
   * No message closes the frame on a TTY and writes nothing on a pipe.
   */
  close: (message?: string, options?: CloseOptions) => void;
}

export interface CloseOptions {
  readonly stream?: 'stdout' | 'stderr';
  readonly ttyOnly?: boolean;
  readonly tone?: CloseTone;
}

export interface LoggerStreams {
  stdout: Writable;
  stderr: Writable;
}

export interface LoggerChrome {
  readonly unicode?: boolean;
  /** When false, a TTY stays monochrome (`NO_COLOR`, `TERM=dumb`). */
  readonly color?: boolean;
}

type Level = 'info' | 'success' | 'warn' | 'error' | 'step';

export function createLogger(io: LoggerStreams, json: boolean, chrome: LoggerChrome = {}): Logger {
  const unicode = chrome.unicode ?? true;
  const allowColor = chrome.color ?? true;
  const stdoutTty = !json && isTerminal(io.stdout);
  const stderrTty = !json && isTerminal(io.stderr);
  const stdoutTheme = createTheme(stdoutTty, unicode, stdoutTty && allowColor);
  const stderrTheme = createTheme(stderrTty, unicode, stderrTty && allowColor);
  let opened = false;

  const write = (level: Level, message: string): void => {
    const useStderr = json || level === 'warn' || level === 'error';
    const stream = useStderr ? io.stderr : io.stdout;
    const theme = useStderr ? stderrTheme : stdoutTheme;
    stream.write(`${renderLine(theme, level, message)}\n`);
  };

  const open = (): void => {
    if (opened || !stdoutTty) return;
    opened = true;
    io.stdout.write(`${formatBanner(stdoutTheme)}\n\n`);
  };

  const close = (message?: string, options?: CloseOptions): void => {
    const streamName = options?.stream ?? 'stdout';
    const stream = streamName === 'stderr' ? io.stderr : io.stdout;
    // A json payload owns stdout. Never append a rule to it.
    if (json && streamName === 'stdout') return;

    const theme = streamName === 'stderr' ? stderrTheme : stdoutTheme;
    if (!theme.tty) {
      if (message === undefined || options?.ttyOnly === true) return;
      stream.write(`${message}\n`);
      return;
    }

    if (message === undefined) {
      stream.write(`${theme.muted(theme.glyphs.barEnd)}\n`);
      return;
    }
    stream.write(`${formatClose(theme, message, options?.tone ?? 'neutral')}\n`);
  };

  return {
    presented: stdoutTty,
    theme: stdoutTheme,
    info: (message) => { write('info', message); },
    success: (message) => { write('success', message); },
    warn: (message) => { write('warn', message); },
    error: (message) => { write('error', message); },
    step: (message) => { write('step', message); },
    open,
    close,
  };
}

function renderLine(theme: Theme, level: Level, message: string): string {
  // A file tree, diff, or report is one block. A glyph on the first line would orphan the rest.
  if (!theme.tty || message.includes('\n')) return message;
  return `${glyphFor(theme, level)}  ${message}`;
}

function glyphFor(theme: Theme, level: Level): string {
  switch (level) {
    case 'info':
      return theme.accent(theme.glyphs.info);
    case 'success':
      return theme.success(theme.glyphs.success);
    case 'warn':
      return theme.warn(theme.glyphs.warn);
    case 'error':
      return theme.error(theme.glyphs.error);
    case 'step':
      return theme.accent(theme.glyphs.step);
    default: {
      const unexpected: never = level;
      return unexpected;
    }
  }
}

function isTerminal(stream: object): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}
