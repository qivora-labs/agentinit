import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe('package.json files', () => {
  it('lists only dist/cli.js from dist/', () => {
    expect(pkg.files).toEqual(['dist/cli.js', 'registry']);
  });

  it('omits stray dist paths from npm pack even when they exist on disk', async () => {
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

    // Windows npm is a .cmd shim; execFile cannot resolve bare `npm` (ENOENT).
    const isWindows = process.platform === 'win32';
    const { stdout, stderr } = await execFileAsync(isWindows ? 'npm.cmd' : 'npm', ['pack', '--dry-run'], {
      cwd: dir,
      encoding: 'utf8',
      shell: isWindows,
    });
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
  });
});
