import type { Writable } from 'node:stream';
import pc from 'picocolors';

export interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  step: (message: string) => void;
}

export interface LoggerStreams {
  stdout: Writable;
  stderr: Writable;
}

export function createLogger(io: LoggerStreams, json: boolean): Logger {
  const stdoutColors = pc.createColors(isTerminal(io.stdout));
  const stderrColors = pc.createColors(isTerminal(io.stderr));

  const write = (level: 'info' | 'success' | 'warn' | 'error' | 'step', message: string): void => {
    const useStderr = json || level === 'warn' || level === 'error';
    const stream = useStderr ? io.stderr : io.stdout;
    const colors = useStderr ? stderrColors : stdoutColors;
    const paint = {
      info: colors.cyan,
      success: colors.green,
      warn: colors.yellow,
      error: colors.red,
      step: colors.magenta,
    }[level];
    stream.write(`${paint(message)}\n`);
  };

  return {
    info: (message) => { write('info', message); },
    success: (message) => { write('success', message); },
    warn: (message) => { write('warn', message); },
    error: (message) => { write('error', message); },
    step: (message) => { write('step', message); },
  };
}

function isTerminal(stream: object): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}
