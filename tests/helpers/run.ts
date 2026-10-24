import { Readable, Writable } from 'node:stream';
import { run, type CommandIo } from '../../src/main.js';

export interface CapturedStream {
  stream: Writable;
  text: () => string;
}

export function captureStream(isTTY = false): CapturedStream {
  let text = '';
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      callback();
    },
  });
  Object.defineProperty(stream, 'isTTY', { value: isTTY });
  return {
    stream,
    text: () => text,
  };
}

export function captureStdin(isTTY: boolean): Readable {
  const stdin = new Readable({
    read() {
      this.push(null);
    },
  });
  Object.defineProperty(stdin, 'isTTY', { value: isTTY });
  return stdin;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCli(
  argv: string[],
  options?: { readonly stdinTTY?: boolean; readonly stdoutTTY?: boolean },
): Promise<RunResult> {
  const stdout = captureStream(options?.stdoutTTY ?? false);
  const stderr = captureStream(false);
  const io: CommandIo = {
    stdout: stdout.stream,
    stderr: stderr.stream,
    stdin: captureStdin(options?.stdinTTY ?? false),
  };
  const code = await run(argv, io);
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}
