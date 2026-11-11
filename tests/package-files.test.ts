import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { windowsCmdArgs } from '../scripts/smoke.js';

const directories: string[] = [];

/** npm pack on Windows CI often exceeds Vitest's 5s default. */
const PACK_TIMEOUT_MS = 60_000;

afterEach(async () => {
  const pending = directories.splice(0);
  for (const dir of pending) {
    await removeTempDir(dir);
  }
});

describe('package.json files', () => {
  it('lists only dist/cli.js from dist/', () => {
    expect(pkg.files).toEqual(['dist/cli.js', 'registry']);
  });

  it(
    'omits stray dist paths from npm pack even when they exist on disk',
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-pack-files-'));
      directories.push(dir);

      await writeFile(
        path.join(dir, 'package.json'),
        `${JSON.stringify(
          {
            name: 'agentinit-pack-files-check',
            version: '0.0.0',
            files: pkg.files,
          },
          null,
          2,
        )}\n`,
      );
      await mkdir(path.join(dir, 'dist', 'junk'), { recursive: true });
      await writeFile(path.join(dir, 'dist', 'cli.js'), 'export {}\n');
      await writeFile(path.join(dir, 'dist', 'junk', 'x'), 'stray\n');
      await mkdir(path.join(dir, 'registry'), { recursive: true });
      await writeFile(path.join(dir, 'registry', 'keep.md'), '# keep\n');

      const { stdout, stderr } = await runNpmPackDryRun(dir);
      // Lines look like: `npm notice 10B dist/cli.js`
      const packed = `${stdout}\n${stderr}`
        .split(/\r?\n/)
        .flatMap((line) => {
          const match = /^npm notice\s+\d+[A-Za-z]*\s+(\S+)$/u.exec(line.trim());
          return match?.[1] === undefined ? [] : [match[1]];
        });

      expect(packed).toContain('dist/cli.js');
      expect(packed).toContain('registry/keep.md');
      expect(packed.some((entry) => entry.startsWith('dist/junk'))).toBe(false);
    },
    PACK_TIMEOUT_MS,
  );
});

function runNpmPackDryRun(cwd: string): Promise<{ stdout: string; stderr: string }> {
  // Same Windows .cmd + cmd.exe path as scripts/smoke.ts — `execFile` + `shell: true`
  // is slow/fragile there and timed out under Vitest's 5s default on windows-latest.
  const windows = process.platform === 'win32';
  const executable = windows ? 'npm.cmd' : 'npm';
  const args = ['pack', '--dry-run'] as const;
  const cmdArgs = windows ? windowsCmdArgs(executable, args) : null;

  return new Promise((resolve, reject) => {
    const child = spawn(
      cmdArgs === null ? executable : (process.env.comspec ?? 'cmd.exe'),
      cmdArgs === null ? [...args] : [...cmdArgs],
      {
        cwd,
        windowsHide: true,
        windowsVerbatimArguments: cmdArgs !== null,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          npm_config_audit: 'false',
          npm_config_fund: 'false',
          NO_UPDATE_NOTIFIER: '1',
        },
      },
    );

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
        reject(new Error(`Timed out after ${String(PACK_TIMEOUT_MS)}ms: ${executable} ${args.join(' ')}`));
      });
    }, PACK_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
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
        reject(
          new Error(
            `${executable} ${args.join(' ')} failed with ${String(code)}.\n${stdout.trim()}\n${stderr.trim()}`,
          ),
        );
      });
    });
  });
}

async function removeTempDir(dir: string): Promise<void> {
  // Windows often keeps the temp dir locked briefly after npm.cmd exits (EBUSY).
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, 100 * (attempt + 1));
      });
    }
  }
  throw lastError;
}
