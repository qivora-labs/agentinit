import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareText } from '../src/compare-text.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureDir = fileURLToPath(new URL('../tests/fixtures/next15-src', import.meta.url));

const REQUIRED_FILES = ['package.json', 'LICENSE'] as const;

export interface TarballExpectations {
  /**
   * The root README is added in T31. Require it only when that file exists,
   * so this check starts failing if a later README is left out of the pack.
   */
  readonly requireReadme?: boolean;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runSmoke(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'agentinit-smoke-'));
  try {
    const packDir = path.join(root, 'pack');
    const installDir = path.join(root, 'install');
    const projectDir = path.join(root, 'project');
    await mkdir(packDir);
    await mkdir(installDir);

    await runTool('pnpm', ['build'], repoRoot, 180_000);
    await runTool('pnpm', ['pack', '--pack-destination', packDir], repoRoot, 60_000);

    const tarball = await findTarball(packDir);
    const listed = await runTool('tar', ['-tzf', tarball], root, 30_000);
    const entries = listed.stdout.split(/\r?\n/).filter((line) => line.length > 0);
    assertTarballEntries(entries, { requireReadme: await pathExists(path.join(repoRoot, 'README.md')) });

    // A private manifest keeps `npm install` from prompting. The tarball is a
    // local file; npm still fetches that package's runtime dependencies.
    await writeFile(
      path.join(installDir, 'package.json'),
      `${JSON.stringify({ name: 'agentinit-smoke-install', private: true }, null, 2)}\n`,
    );
    await runTool('npm', ['install', tarball], installDir, 300_000);

    const bin = binaryPath(installDir);
    await access(bin, constants.F_OK);

    const version = await runBinary(bin, ['--version'], installDir);
    const expected = await readPackageVersion(repoRoot);
    const actual = version.stdout.trim();
    if (actual !== expected) {
      throw new Error(`--version printed ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}.`);
    }

    const listedFragments = await runBinary(bin, ['list', '--json'], installDir);
    parseFragmentList(listedFragments.stdout);

    await cp(fixtureDir, projectDir, { recursive: true });
    await runBinary(bin, ['init', '--yes', '--dry-run', '--cwd', projectDir], installDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Published layout: `package.json`, `README.md`, `LICENSE`, `dist/cli.js`, `registry/**`. */
export function assertTarballEntries(entries: readonly string[], expectations: TarballExpectations = {}): void {
  const relative = entries.map(toPackageRelative);
  const unexpected = relative.filter((entry) => !isAllowedPackedPath(entry)).sort(compareText);
  if (unexpected.length > 0) {
    throw new Error(`Tarball contains unexpected paths:\n${unexpected.map((entry) => `  ${entry}`).join('\n')}`);
  }

  const files = relative.filter((entry) => entry.length > 0 && !entry.endsWith('/'));
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error(`Tarball is missing ${required}.`);
  }
  if (!files.includes('dist/cli.js')) throw new Error('Tarball is missing dist/cli.js.');
  if (!files.some((file) => file.startsWith('registry/'))) {
    throw new Error('Tarball is missing registry/. Include "registry" in package.json "files".');
  }
  if (expectations.requireReadme === true && !files.includes('README.md')) {
    throw new Error('Tarball is missing README.md.');
  }
}

function toPackageRelative(entry: string): string {
  const normalized = entry.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized === 'package') return '';
  const prefix = 'package/';
  if (!normalized.startsWith(prefix)) {
    throw new Error(`Tarball entry is outside package/: ${entry}`);
  }
  return normalized.slice(prefix.length);
}

function isAllowedPackedPath(entry: string): boolean {
  const bare = entry.endsWith('/') ? entry.slice(0, -1) : entry;
  if (bare === '') return true;
  if (bare.split('/').includes('..')) return false;
  if (bare === 'package.json' || bare === 'README.md' || bare === 'LICENSE') return !entry.endsWith('/');
  // Only dist/cli.js — package.json "files" must not use a bare "dist" glob.
  if (bare === 'dist' || bare === 'dist/cli.js') return true;
  if (bare === 'registry' || bare.startsWith('registry/')) return true;
  return false;
}

function binaryPath(installDir: string): string {
  const name = process.platform === 'win32' ? 'agentinit.cmd' : 'agentinit';
  return path.join(installDir, 'node_modules', '.bin', name);
}

async function findTarball(dir: string): Promise<string> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.tgz'));
  const name = names[0];
  if (name === undefined || names.length !== 1) {
    throw new Error(`Expected one tarball in ${dir}, found ${String(names.length)}.`);
  }
  return path.join(dir, name);
}

async function readPackageVersion(root: string): Promise<string> {
  const manifestPath = path.join(root, 'package.json');
  const data = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  if (typeof data !== 'object' || data === null || !('version' in data) || typeof data.version !== 'string') {
    throw new Error(`${manifestPath} is missing a version string.`);
  }
  return data.version;
}

function parseFragmentList(stdout: string): void {
  let data: unknown;
  try {
    data = JSON.parse(stdout) as unknown;
  } catch {
    throw new Error(`list --json did not print JSON:\n${stdout}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('list --json must print a non-empty array.');
  }
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function runTool(
  command: 'pnpm' | 'npm' | 'tar',
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  // npm and pnpm on Windows are .cmd shims, which Node will not run without cmd.exe.
  const windowsShim = process.platform === 'win32' && command !== 'tar';
  const executable = windowsShim ? `${command}.cmd` : command;
  return runExecutable(executable, args, cwd, windowsShim, timeoutMs);
}

function runBinary(executable: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  return runExecutable(executable, args, cwd, process.platform === 'win32', 120_000);
}

/**
 * `cmd.exe /d /s /c` arguments. Node's `shell: true` joins argv with spaces and
 * does not quote it, so a temp path under `C:\Users\Foo Bar\` is split.
 * `/s` strips one pair of surrounding quotes; each special argument is quoted
 * inside that pair.
 */
export function windowsCmdArgs(executable: string, args: readonly string[]): readonly [string, string, string, string] {
  const command = [executable, ...args].map(quoteCmdArg).join(' ');
  return ['/d', '/s', '/c', `"${command}"`];
}

/** Tokens cmd.exe can take literally. Anything else is quoted. */
const CMD_PLAIN = /^[A-Za-z0-9_./:=+@\\-]+$/u;

function quoteCmdArg(value: string): string {
  if (value.length === 0) return '""';
  const trailing = /\\+$/u.exec(value);
  if (CMD_PLAIN.test(value) && trailing === null) return value;
  // A trailing backslash would escape the closing quote. `%` still expands inside quotes.
  const slashes = trailing === null ? '' : trailing[0];
  const body = `${value.slice(0, value.length - slashes.length)}${slashes}${slashes}`
    .replaceAll('"', '""')
    .replaceAll('%', '%%');
  return `"${body}"`;
}

function runExecutable(
  executable: string,
  args: readonly string[],
  cwd: string,
  cmd: boolean,
  timeoutMs: number,
): Promise<CommandResult> {
  // `.cmd` shims have to run through cmd.exe. Build that command line here so
  // Node does not concatenate the arguments itself.
  const command = cmd ? windowsCmdArgs(executable, args) : null;
  return new Promise((resolve, reject) => {
    const child = spawn(
      command === null ? executable : (process.env.comspec ?? 'cmd.exe'),
      command === null ? [...args] : [...command],
      {
        cwd,
        windowsHide: true,
        windowsVerbatimArguments: command !== null,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          npm_config_audit: 'false',
          npm_config_fund: 'false',
          NO_UPDATE_NOTIFIER: '1',
        },
      },
    );
    const out = child.stdout;
    const err = child.stderr;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (handler: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => {
        reject(new Error(`Timed out after ${String(timeoutMs)}ms: ${formatCommand(executable, args)}`));
      });
    }, timeoutMs);

    out.setEncoding('utf8');
    err.setEncoding('utf8');
    out.on('data', (chunk: string | Buffer) => {
      stdout += textChunk(chunk);
    });
    err.on('data', (chunk: string | Buffer) => {
      stderr += textChunk(chunk);
    });
    child.on('error', (error: Error) => {
      finish(() => {
        reject(error);
      });
    });
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(formatFailure(executable, args, code, stdout, stderr)));
      });
    });
  });
}

function textChunk(chunk: string | Buffer): string {
  return typeof chunk === 'string' ? chunk : chunk.toString('utf8');
}

function formatCommand(executable: string, args: readonly string[]): string {
  return [executable, ...args].join(' ');
}

function formatFailure(
  executable: string,
  args: readonly string[],
  code: number | null,
  stdout: string,
  stderr: string,
): string {
  const status = code === null ? 'a signal' : `exit ${String(code)}`;
  return [`${formatCommand(executable, args)} failed with ${status}.`, stdout.trim(), stderr.trim()]
    .filter((part) => part.length > 0)
    .join('\n');
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (isDirectRun()) {
  try {
    await runSmoke();
    process.stdout.write('Packed tarball smoke test passed.\n');
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
