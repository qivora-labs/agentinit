import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectPackageManager,
  detectScripts,
  existingFiles,
  readPackageJson,
  resolveVersions,
  type PackageJson,
} from '../../src/detect/packages.js';
import { AgentInitError } from '../../src/errors.js';

const fixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/detect-packages',
);

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-detect-'));
  directories.push(dir);
  return dir;
}

async function copyFixture(name: string): Promise<string> {
  const dir = await tempDir();
  await cp(path.join(fixturesRoot, name), dir, { recursive: true });
  return dir;
}

function loadPackage(root: string): PackageJson {
  const pkg = readPackageJson(root);
  if (pkg === null) throw new Error(`missing package.json in ${root}`);
  return pkg;
}

describe('readPackageJson', () => {
  it('returns null when package.json is missing', async () => {
    const root = await tempDir();
    expect(readPackageJson(root)).toBeNull();
  });

  it('copies workspaces and rejects a malformed workspaces field', async () => {
    const root = await tempDir();
    const manifestPath = path.join(root, 'package.json');

    await writeFile(manifestPath, JSON.stringify({ workspaces: ['packages/*', 'apps/*'] }));
    expect(readPackageJson(root)?.workspaces).toEqual(['packages/*', 'apps/*']);

    await writeFile(
      manifestPath,
      JSON.stringify({ workspaces: { packages: ['packages/*'], nohoist: ['**/react'] } }),
    );
    expect(readPackageJson(root)?.workspaces).toEqual({ packages: ['packages/*'] });

    await writeFile(manifestPath, JSON.stringify({ name: 'app' }));
    expect(readPackageJson(root)?.workspaces).toBeUndefined();

    await writeFile(manifestPath, JSON.stringify({ workspaces: {} }));
    expect(readPackageJson(root)?.workspaces).toEqual({});

    for (const workspaces of [null, 'packages/*', ['packages/*', 1], { packages: 'packages/*' }]) {
      await writeFile(manifestPath, JSON.stringify({ workspaces }));
      expect(() => readPackageJson(root)).toThrow(AgentInitError);
      expect(() => readPackageJson(root)).toThrow(manifestPath);
    }
  });

  it('throws a readable error naming a malformed package.json', async () => {
    const root = await copyFixture('malformed');
    const manifestPath = path.join(root, 'package.json');

    expect(() => readPackageJson(root)).toThrow(AgentInitError);
    expect(() => readPackageJson(root)).toThrow(manifestPath);
  });
});

describe('resolveVersions', () => {
  it('prefers the installed version over the lockfile and the range', async () => {
    const root = await copyFixture('installed-wins');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '15.3.2',
      react: '19.0.1',
      '@scope/ui': '1.4.5',
      zod: '3.23.8',
      typescript: '5.6.3',
    });
  });

  it('reads package-lock.json when node_modules is absent', async () => {
    const root = await copyFixture('package-lock');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '15.1.1',
      '@tanstack/react-query': '5.59.16',
      typescript: '5.6.3',
    });
  });

  it('prefers pnpm-lock.yaml over package-lock.json when both exist', async () => {
    const root = await copyFixture('lockfile-pnpm-and-npm');

    expect(resolveVersions(root, loadPackage(root))).toEqual({ next: '2.0.0' });
    expect(detectPackageManager(root, loadPackage(root))).toBe('pnpm');
  });

  it('reads pnpm-lock.yaml and strips peer suffixes when node_modules is absent', async () => {
    const root = await copyFixture('pnpm-lock');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '15.1.6',
      react: '19.0.0',
      zod: '3.23.8',
      typescript: '5.6.3',
    });
  });

  it('resolves caret and tilde ranges and npm aliases, and leaves protocol specifiers unresolved', async () => {
    const root = await copyFixture('ranges');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '15.1.0',
      eslint: '9.10.0',
      react: '19.0.0',
      '@types/react': '19.0.1',
      ui: null,
      internal: null,
      config: null,
      local: null,
      gitpkg: null,
      urlpkg: null,
      gh: null,
      floating: null,
      shared: '1.2.3',
      vitest: null,
    });
  });

  it.each([
    { fixture: 'lockfile-yarn', behavior: 'falls back to the range when yarn.lock is present' },
    { fixture: 'lockfile-bun', behavior: 'falls back to the range when bun.lock is present' },
    { fixture: 'lockfile-bunb', behavior: 'falls back to the range when bun.lockb is present' },
  ] as const)('$behavior', async ({ fixture }) => {
    const root = await copyFixture(fixture);

    expect(resolveVersions(root, loadPackage(root))).toEqual({ next: '15.1.0' });
  });

  it('falls back to the range when an installed manifest or lockfile cannot be parsed', async () => {
    const brokenInstall = await copyFixture('installed-unreadable');
    expect(resolveVersions(brokenInstall, loadPackage(brokenInstall))).toEqual({
      next: '15.2.4',
      react: '19.0.1',
    });

    const unknownLock = await copyFixture('unknown-lockfile');
    expect(resolveVersions(unknownLock, loadPackage(unknownLock))).toEqual({
      next: '15.1.0',
    });

    const invalidPnpm = await copyFixture('invalid-pnpm-lock');
    expect(resolveVersions(invalidPnpm, loadPackage(invalidPnpm))).toEqual({
      next: '15.1.0',
    });
  });

  it('ignores dependency names that resolve outside node_modules', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'sneaky'), { recursive: true });
    await writeFile(path.join(root, 'sneaky', 'package.json'), JSON.stringify({ version: '9.9.9' }));
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { '../sneaky': '^1.2.3' } }),
    );

    expect(resolveVersions(root, loadPackage(root))).toEqual({ '../sneaky': '1.2.3' });
  });
});

describe('detectPackageManager', () => {
  it.each([
    {
      fixture: 'package-manager-field',
      manager: 'pnpm',
      behavior: 'uses the packageManager field before lockfiles',
    },
    {
      fixture: 'pnpm-lock',
      manager: 'pnpm',
      behavior: 'detects pnpm from pnpm-lock.yaml',
    },
    {
      fixture: 'lockfile-yarn',
      manager: 'yarn',
      behavior: 'detects yarn from yarn.lock',
    },
    {
      fixture: 'lockfile-bun',
      manager: 'bun',
      behavior: 'detects bun from bun.lock',
    },
    {
      fixture: 'lockfile-bunb',
      manager: 'bun',
      behavior: 'detects bun from bun.lockb',
    },
    {
      fixture: 'package-lock',
      manager: 'npm',
      behavior: 'detects npm from package-lock.json',
    },
    {
      fixture: 'lockfile-priority',
      manager: 'yarn',
      behavior: 'prefers yarn.lock over package-lock.json',
    },
    {
      fixture: 'package-manager-unknown',
      manager: 'yarn',
      behavior: 'falls through when packageManager names an unknown tool',
    },
    {
      fixture: 'default-npm',
      manager: 'npm',
      behavior: 'defaults to npm when no field or lockfile exists',
    },
  ] as const)('$behavior', async ({ fixture, manager }) => {
    const root = await copyFixture(fixture);
    expect(detectPackageManager(root, loadPackage(root))).toBe(manager);
  });
});

describe('detectScripts', () => {
  it('returns only known scripts that exist', async () => {
    const root = await copyFixture('scripts');

    expect(detectScripts(loadPackage(root))).toEqual({
      build: 'tsc',
      lint: 'eslint .',
      test: 'vitest run',
    });
  });
});

describe('existingFiles', () => {
  it('returns marker files that exist inside the project, in candidate order', async () => {
    const parent = await tempDir();
    const root = path.join(parent, 'project');
    await cp(path.join(fixturesRoot, 'markers'), root, { recursive: true });
    await writeFile(path.join(parent, 'escaped.json'), '{}');
    await mkdir(path.join(root, 'folder'));

    expect(
      existingFiles(root, [
        'nested/config.json',
        'missing.json',
        'folder',
        'components.json',
        '../escaped.json',
      ]),
    ).toEqual(['nested/config.json', 'components.json']);
  });
});
