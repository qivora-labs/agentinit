import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/registry/load.js';
import { runCli } from './helpers/run.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-'));
  directories.push(dir);
  return dir;
}

describe('run', () => {
  it('prints the package version and returns 0', async () => {
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('0.0.0\n');
    expect(result.stderr).toBe('');
  });

  it('accepts a process.argv-shaped array for --version', async () => {
    const result = await runCli([process.execPath, 'agentinit', '--version']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('0.0.0\n');
  });

  it('lists commands and the global flags', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('doctor');
    for (const flag of ['--yes', '-y', '--dry-run', '--agents', '--cwd', '--force', '--json']) {
      expect(result.stdout).toContain(flag);
    }
  });

  it('rejects an unknown agent and lists the valid values', async () => {
    const result = await runCli(['init', '--agents', 'cursor,foo']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('foo');
    for (const agent of ['cursor', 'claude', 'windsurf', 'copilot']) {
      expect(result.stderr).toContain(agent);
    }
    expect(result.stderr).not.toContain('This is a bug');
  });

  it('rejects a missing --cwd with a readable message', async () => {
    const requested = '/does/not/exist';
    const result = await runCli(['init', '--cwd', requested]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(path.resolve(requested));
    expect(result.stderr).not.toContain('This is a bug');
    expect(result.stderr).not.toContain('    at ');
  });

  it('rejects a --cwd path that is a file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'notes.txt');
    await writeFile(file, 'hello');
    const result = await runCli(['list', '--cwd', file]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Not a directory');
    expect(result.stderr).toContain(file);
    expect(result.stderr).not.toContain('This is a bug');
  });

  // Windows stat returns ENOENT here; POSIX returns ENOTDIR.
  it('rejects a --cwd path nested under a file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'notes.txt');
    await writeFile(file, 'hello');
    const nested = path.join(file, 'child');
    const result = await runCli(['list', '--cwd', nested]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Not a directory');
    expect(result.stderr).toContain(nested);
    expect(result.stderr).not.toContain('This is a bug');
    expect(result.stderr).not.toContain('ENOTDIR');
  });

  it('resolves a relative --cwd against the current directory', async () => {
    const result = await runCli(['list', '--cwd', 'definitely-missing-agentinit-dir']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(path.resolve('definitely-missing-agentinit-dir'));
  });

  it('rejects init when input is not interactive', async () => {
    const dir = await tempDir();
    const result = await runCli(['init', '--cwd', dir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Interactive input is required.');
    expect(result.stderr).toContain('--yes');
    expect(result.stderr).not.toContain('This is a bug');
  });

  it('reports an empty directory as not initialized', async () => {
    const dir = await tempDir();
    const result = await runCli(['doctor', '--cwd', dir]);
    expect(result.code).toBe(2);
    expect(result.stdout).toContain('Not initialized');
    expect(result.stdout).toContain('npx @agentinit/cli init');
    expect(result.stderr).toBe('');
  });

  it('routes a bare invocation to init', async () => {
    const result = await runCli([]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Interactive input is required.');
  });

  it('lists fragments when stdin is not a terminal', async () => {
    const result = await runCli(['list'], { stdinTTY: false, stdoutTTY: false });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const registry = await loadRegistry();
    if (registry.fragments.length === 0) {
      expect(result.stdout).toBe('No fragments available.\n');
      return;
    }
    for (const fragment of registry.fragments) {
      expect(result.stdout).toContain(fragment.meta.id);
    }
  });

  it('reports an unknown command without the bug line', async () => {
    const result = await runCli(['explode']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('explode');
    expect(result.stderr).not.toContain('This is a bug');
  });
});
