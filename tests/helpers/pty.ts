import { chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn as spawnPty, type IPty } from 'node-pty';
import xterm from '@xterm/headless';

const { Terminal } = xterm;
type HeadlessTerminal = InstanceType<typeof Terminal>;

const cliPath = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const require = createRequire(import.meta.url);

export const KEY = {
  enter: '\r',
  up: '\x1b[A',
  down: '\x1b[B',
  space: ' ',
} as const;

export type PtyKey =
  | string
  | {
      readonly key: string;
      /** Do not send until the settled screen matches. */
      readonly waitFor?: RegExp | string;
    };

export interface PtyScreenOptions {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Keys to send after the screen settles, with a settle between each. */
  readonly keys?: readonly PtyKey[];
  readonly settleMs?: number;
  readonly timeoutMs?: number;
}

export interface PtyScreenResult {
  /** Screen after each settle, including the final post-exit frame. */
  readonly screens: readonly string[];
  readonly screen: string;
  readonly exitCode: number;
}

/**
 * Spawn `dist/cli.js` in a pseudo-terminal, feed keys after the screen settles,
 * and return the rendered buffer with color codes removed.
 */
export async function runPtyScreen(options: PtyScreenOptions): Promise<PtyScreenResult> {
  if (process.platform === 'win32') {
    throw new Error('Pty screen tests are skipped on Windows.');
  }
  ensureSpawnHelperExecutable();

  const cols = options.cols ?? 80;
  const rows = options.rows ?? 60;
  const settleMs = options.settleMs ?? 150;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const env = buildEnv(options.env);

  const term = new Terminal({
    cols,
    rows,
    scrollback: 2000,
    allowProposedApi: true,
    convertEol: true,
  });

  const pty: IPty = spawnPty(process.execPath, [cliPath, ...options.args], {
    name: env.TERM ?? 'xterm-256color',
    cols,
    rows,
    cwd: options.cwd,
    env,
  });

  const exited = new Promise<number>((resolve) => {
    pty.onExit(({ exitCode: code }) => {
      resolve(code);
    });
  });

  const writes: Promise<void>[] = [];
  pty.onData((data) => {
    writes.push(
      new Promise<void>((resolve) => {
        term.write(data, () => {
          resolve();
        });
      }),
    );
  });

  const flushWrites = async (): Promise<void> => {
    while (writes.length > 0) {
      const pending = writes.splice(0);
      await Promise.all(pending);
    }
  };

  const screens: string[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    for (const step of options.keys ?? []) {
      const key = typeof step === 'string' ? step : step.key;
      const waitFor = typeof step === 'string' ? undefined : step.waitFor;
      await flushWrites();
      await settle(term, settleMs, deadline, flushWrites);
      if (waitFor !== undefined) {
        await waitForScreen(term, waitFor, settleMs, deadline, flushWrites);
      }
      screens.push(readScreen(term));
      pty.write(key);
    }
    const exitCode = await Promise.race([
      exited,
      sleep(Math.max(0, deadline - Date.now())).then(async () => {
        await flushWrites();
        screens.push(readScreen(term));
        const preview = screens[screens.length - 1] ?? '';
        throw new Error(
          `Pty timed out after ${String(timeoutMs)}ms\n--- screen ---\n${preview.slice(-1200)}`,
        );
      }),
    ]);
    await flushWrites();
    await settle(term, settleMs, deadline, flushWrites);
    screens.push(readScreen(term));
    const screen = screens[screens.length - 1] ?? '';
    return { screens, screen, exitCode };
  } finally {
    try {
      pty.kill();
    } catch {
      // already exited
    }
  }
}

export function readScreen(term: HeadlessTerminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index);
    lines.push(line === undefined ? '' : line.translateToString(true));
  }
  while (lines.length > 0 && lines[lines.length - 1]?.trim().length === 0) {
    lines.pop();
  }
  // Drop leading blank rows left by the banner gap.
  while (lines.length > 0 && lines[0]?.trim().length === 0) {
    lines.shift();
  }
  return lines.join('\n');
}

/** Visible lines must not exceed the terminal width. */
export function assertLinesFit(screen: string, cols: number): void {
  for (const line of screen.split('\n')) {
    if (line.length > cols) {
      throw new Error(`Line exceeds ${String(cols)} columns (${String(line.length)}): ${JSON.stringify(line)}`);
    }
  }
}

/**
 * Every non-empty line between the first rail glyph and the closing `└`
 * starts with a rail or Clack box glyph.
 */
export function assertFramedRail(screen: string): void {
  const lines = screen.split('\n');
  const start = lines.findIndex((line) => startsWithRail(line));
  if (start === -1) return;
  const end = findLastIndex(
    lines,
    (line) => line.trimStart().startsWith('└') || line.trimStart().startsWith('+'),
  );
  if (end === -1 || end <= start) return;
  for (let index = start; index <= end; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0) continue;
    if (isFramedLine(line)) continue;
    throw new Error(`Unframed line at ${String(index)}: ${JSON.stringify(line)}`);
  }
}

function isFramedLine(line: string): boolean {
  // paintDoctorChecks: `  ${message}` and `    Fix: ${fix}` (T37), not on the rail.
  if (isDoctorDetail(line)) return true;
  const trimmed = line.trimStart();
  return (
    startsWithRail(trimmed)
    || trimmed.startsWith('│')
    || trimmed.startsWith('|')
    || trimmed.startsWith('┌')
    || trimmed.startsWith('└')
    || trimmed.startsWith('├')
    || trimmed.startsWith('╮')
    || trimmed.startsWith('╯')
    || trimmed.startsWith('╭')
    || trimmed.startsWith('╰')
    || trimmed.startsWith('◇')
    || trimmed.startsWith('◆')
    || trimmed.startsWith('●')
    || trimmed.startsWith('▲')
    || trimmed.startsWith('■')
    || trimmed.startsWith('*')
    || trimmed.startsWith('+')
    || trimmed.startsWith('>')
    || trimmed.startsWith('!')
    || trimmed.startsWith('x')
  );
}

/** Matches the two indent levels `paintDoctorChecks` emits for issue rows. */
function isDoctorDetail(line: string): boolean {
  return /^ {2}\S/.test(line) || line.startsWith('    Fix: ');
}

function startsWithRail(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith('│')
    || trimmed.startsWith('|')
    || trimmed.startsWith('┌')
    || trimmed.startsWith('+')
  );
}

function findLastIndex(lines: readonly string[], pred: (line: string) => boolean): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (pred(lines[index] ?? '')) return index;
  }
  return -1;
}

async function settle(
  term: HeadlessTerminal,
  settleMs: number,
  deadline: number,
  flushWrites: () => Promise<void>,
): Promise<void> {
  let previous = readScreen(term);
  let stableFor = 0;
  const step = 50;
  while (Date.now() < deadline) {
    await sleep(step);
    await flushWrites();
    const next = readScreen(term);
    if (next === previous) {
      stableFor += step;
      if (stableFor >= settleMs) return;
    } else {
      previous = next;
      stableFor = 0;
    }
  }
  throw new Error('Screen did not settle before timeout');
}

async function waitForScreen(
  term: HeadlessTerminal,
  pattern: RegExp | string,
  settleMs: number,
  deadline: number,
  flushWrites: () => Promise<void>,
): Promise<void> {
  const matches = (screen: string): boolean =>
    typeof pattern === 'string' ? screen.includes(pattern) : pattern.test(screen);
  while (Date.now() < deadline) {
    await flushWrites();
    const screen = readScreen(term);
    if (matches(screen)) {
      await settle(term, settleMs, deadline, flushWrites);
      if (matches(readScreen(term))) return;
      continue;
    }
    await sleep(50);
  }
  throw new Error(`Screen never matched ${String(pattern)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildEnv(override: NodeJS.ProcessEnv | undefined): Record<string, string> {
  const env: Record<string, string> = {
    ...stripUndefined(process.env),
    TERM: 'xterm-256color',
    FORCE_COLOR: '1',
    CI: '1',
    ...stripUndefined(override),
  };
  if (override === undefined || !('NO_COLOR' in override)) {
    delete env.NO_COLOR;
  }
  if (override?.TERM !== undefined) env.TERM = override.TERM;
  if (override?.NO_COLOR !== undefined) {
    delete env.FORCE_COLOR;
  }
  return env;
}

function stripUndefined(env: NodeJS.ProcessEnv | undefined): Record<string, string> {
  if (env === undefined) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * pnpm may extract prebuilds without the executable bit when install scripts
 * are skipped. Without +x, spawn fails with posix_spawnp.
 */
function ensureSpawnHelperExecutable(): void {
  const root = path.dirname(require.resolve('node-pty/package.json'));
  const candidates = [
    path.join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(root, 'build', 'Release', 'spawn-helper'),
  ];
  for (const helper of candidates) {
    try {
      chmodSync(helper, 0o755);
    } catch {
      // missing on this platform/layout
    }
  }
}
