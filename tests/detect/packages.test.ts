import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectPackageManager,
  detectScripts,
  existingFiles,
  findLookupRoot,
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

  it('reads yarn classic lockfile versions by descriptor, including scoped and multi-descriptor entries', async () => {
    const root = await copyFixture('yarn-classic-versions');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '16.4.0',
      '@tanstack/react-query': '5.107.1',
    });
  });

  it('reads yarn berry lockfile versions through npm: descriptors', async () => {
    const root = await copyFixture('yarn-berry-versions');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '16.4.0',
      '@tanstack/react-query': '5.107.1',
    });
  });

  it.each([
    { fixture: 'yarn-classic-two-versions', behavior: 'yarn classic picks the descriptor that matches package.json' },
    { fixture: 'yarn-berry-two-versions', behavior: 'yarn berry picks the npm: descriptor that matches package.json' },
  ] as const)('$behavior', async ({ fixture }) => {
    const root = await copyFixture(fixture);

    expect(resolveVersions(root, loadPackage(root))).toEqual({ next: '16.4.0' });
  });

  it('reads bun.lock versions from packages entries, including scoped names', async () => {
    const root = await copyFixture('bun-lock-versions');

    expect(resolveVersions(root, loadPackage(root))).toEqual({
      next: '16.4.0',
      '@tanstack/react-query': '5.107.1',
    });
  });

  it('prefers a bun workspace-scoped packages entry over the hoisted one', async () => {
    const root = await copyFixture('bun-workspace-lock');

    expect(resolveVersions(root, loadPackage(root))).toEqual({ ms: '2.1.3' });
  });

  it('falls back to the range when only bun.lockb is present', async () => {
    const root = await copyFixture('lockfile-bunb');

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

    const invalidYarn = await copyFixture('invalid-yarn-lock');
    expect(resolveVersions(invalidYarn, loadPackage(invalidYarn))).toEqual({
      next: '16.0.0',
    });

    const invalidBun = await copyFixture('invalid-bun-lock');
    expect(resolveVersions(invalidBun, loadPackage(invalidBun))).toEqual({
      next: '16.0.0',
    });
  });

  it('prefers the installed version over yarn.lock', async () => {
    const root = await copyFixture('yarn-installed-wins');

    expect(resolveVersions(root, loadPackage(root))).toEqual({ next: '16.1.0' });
  });

  it('falls back to the range when yarn.lock or bun.lock descriptors do not match package.json', async () => {
    const yarn = await copyFixture('lockfile-yarn');
    expect(resolveVersions(yarn, loadPackage(yarn))).toEqual({ next: '15.1.0' });

    const bun = await copyFixture('lockfile-bun');
    expect(resolveVersions(bun, loadPackage(bun))).toEqual({ next: '15.1.0' });
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

  it('ignores an installed manifest whose canonical path leaves the project', async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await writeFile(path.join(outside, 'package.json'), JSON.stringify({ version: '9.9.9' }));
    await mkdir(path.join(root, 'node_modules', 'next'), { recursive: true });
    await symlink(path.join(outside, 'package.json'), path.join(root, 'node_modules', 'next', 'package.json'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '^15.1.0' } }));

    expect(resolveVersions(root, loadPackage(root))).toEqual({ next: '15.1.0' });
  });

  it('reads an installed manifest when its symlink stays inside the project', async () => {
    const root = await tempDir();
    const store = path.join(root, 'node_modules', '.pnpm', 'next@15.3.2', 'node_modules', 'next');
    await mkdir(store, { recursive: true });
    await writeFile(path.join(store, 'package.json'), JSON.stringify({ version: '15.3.2' }));
    await symlink(store, path.join(root, 'node_modules', 'next'), 'dir');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '^15.1.0' } }));

    expect(resolveVersions(root, loadPackage(root))).toEqual({ next: '15.3.2' });
  });

  it('reads a pnpm-style symlink whose target is under the lookup root, not the package', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    await writeFile(path.join(repo, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    await writeFile(
      path.join(repo, 'package.json'),
      JSON.stringify({ name: 'repo', private: true, packageManager: 'pnpm@9.0.0' }),
    );
    await writeFile(
      path.join(repo, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  packages/web:',
        '    dependencies:',
        '      next:',
        '        specifier: ^16.0.0',
        '        version: 16.0.0',
        '',
      ].join('\n'),
    );
    const pkg = path.join(repo, 'packages', 'web');
    await mkdir(pkg, { recursive: true });
    await writeFile(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { next: '^16.0.0' } }),
    );
    const store = path.join(repo, 'node_modules', '.pnpm', 'next@16.4.0', 'node_modules', 'next');
    await mkdir(store, { recursive: true });
    await writeFile(path.join(store, 'package.json'), JSON.stringify({ version: '16.4.0' }));
    await mkdir(path.join(pkg, 'node_modules'), { recursive: true });
    await symlink(store, path.join(pkg, 'node_modules', 'next'), 'dir');

    expect(resolveVersions(pkg, loadPackage(pkg))).toEqual({ next: '16.4.0' });
  });

  it('reads pnpm importers for a workspace package and resolves catalog: from that entry', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    await writeFile(
      path.join(repo, 'package.json'),
      JSON.stringify({ name: 'repo', private: true, packageManager: 'pnpm@9.0.0' }),
    );
    await writeFile(
      path.join(repo, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      next:',
        '        specifier: ^15.0.0',
        '        version: 15.0.0',
        '  packages/web:',
        '    dependencies:',
        '      next:',
        '        specifier: ^16.0.0',
        '        version: 16.4.0',
        '      react:',
        '        specifier: "catalog:"',
        '        version: 19.1.0',
        '',
      ].join('\n'),
    );
    const pkg = path.join(repo, 'packages', 'web');
    await mkdir(pkg, { recursive: true });
    await writeFile(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: 'web',
        dependencies: { next: '^16.0.0', react: 'catalog:' },
      }),
    );

    expect(resolveVersions(pkg, loadPackage(pkg))).toEqual({
      next: '16.4.0',
      react: '19.1.0',
    });
  });

  it('reads a hoisted npm workspace install and prefers a nested lockfile entry', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    await writeFile(
      path.join(repo, 'package.json'),
      JSON.stringify({ name: 'repo', private: true, workspaces: ['packages/*'] }),
    );
    await writeFile(
      path.join(repo, 'package-lock.json'),
      JSON.stringify({
        name: 'repo',
        lockfileVersion: 3,
        packages: {
          '': { name: 'repo' },
          'node_modules/next': { version: '16.0.0' },
          'packages/web/node_modules/next': { version: '16.4.0' },
          'node_modules/react': { version: '19.0.0' },
        },
      }),
    );
    const pkg = path.join(repo, 'packages', 'web');
    await mkdir(pkg, { recursive: true });
    await writeFile(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { next: '^16.0.0', react: '^19.0.0' } }),
    );

    expect(resolveVersions(pkg, loadPackage(pkg))).toEqual({
      next: '16.4.0',
      react: '19.0.0',
    });

    await mkdir(path.join(repo, 'node_modules', 'next'), { recursive: true });
    await writeFile(
      path.join(repo, 'node_modules', 'next', 'package.json'),
      JSON.stringify({ version: '16.3.1' }),
    );
    expect(resolveVersions(pkg, loadPackage(pkg))).toEqual({
      next: '16.3.1',
      react: '19.0.0',
    });
  });

  it('ignores a symlink whose target leaves the lookup root and falls through to the lockfile', async () => {
    const repo = await tempDir();
    const outside = await tempDir();
    await mkdir(path.join(repo, '.git'));
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'repo', private: true }));
    await writeFile(
      path.join(repo, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  packages/web:',
        '    dependencies:',
        '      next:',
        '        specifier: ^16.0.0',
        '        version: 16.4.0',
        '',
      ].join('\n'),
    );
    const pkg = path.join(repo, 'packages', 'web');
    await mkdir(path.join(pkg, 'node_modules', 'next'), { recursive: true });
    await writeFile(path.join(outside, 'package.json'), JSON.stringify({ version: '9.9.9' }));
    await symlink(
      path.join(outside, 'package.json'),
      path.join(pkg, 'node_modules', 'next', 'package.json'),
    );
    await writeFile(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { next: '^16.0.0' } }),
    );

    expect(resolveVersions(pkg, loadPackage(pkg))).toEqual({ next: '16.4.0' });
  });

  it('does not read a lockfile above the git root, and without git does not walk parents', async () => {
    const outer = await tempDir();
    await writeFile(
      path.join(outer, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      next:',
        '        specifier: ^16.0.0',
        '        version: 16.4.0',
        '',
      ].join('\n'),
    );

    const noGit = path.join(outer, 'project');
    await mkdir(noGit);
    await writeFile(
      path.join(noGit, 'package.json'),
      JSON.stringify({ dependencies: { next: '^16.0.0' } }),
    );
    expect(findLookupRoot(noGit)).toBe(path.resolve(noGit));
    expect(resolveVersions(noGit, loadPackage(noGit))).toEqual({ next: '16.0.0' });

    const withGit = path.join(outer, 'repo');
    await mkdir(path.join(withGit, '.git'), { recursive: true });
    await writeFile(
      path.join(withGit, 'package.json'),
      JSON.stringify({ dependencies: { next: '^15.1.0' } }),
    );
    expect(findLookupRoot(withGit)).toBe(path.resolve(withGit));
    expect(resolveVersions(withGit, loadPackage(withGit))).toEqual({ next: '15.1.0' });
  });
});

describe('findLookupRoot', () => {
  it('returns the project when it has a lockfile or when no lockfile is found', async () => {
    const withLock = await copyFixture('pnpm-lock');
    expect(findLookupRoot(withLock)).toBe(path.resolve(withLock));

    const bare = await tempDir();
    await writeFile(path.join(bare, 'package.json'), JSON.stringify({ name: 'app' }));
    expect(findLookupRoot(bare)).toBe(path.resolve(bare));
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

  it('uses the lookup root packageManager and lockfile for a workspace package', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    await writeFile(
      path.join(repo, 'package.json'),
      JSON.stringify({ name: 'repo', private: true, packageManager: 'pnpm@10.14.0' }),
    );
    await writeFile(path.join(repo, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters: {}\n");
    const pkg = path.join(repo, 'packages', 'web');
    await mkdir(pkg, { recursive: true });
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: 'web' }));

    expect(detectPackageManager(pkg, loadPackage(pkg))).toBe('pnpm');

    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'repo', private: true }));
    expect(detectPackageManager(pkg, loadPackage(pkg))).toBe('pnpm');
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

  it('skips a symlink whose canonical target leaves the project', async () => {
    const parent = await tempDir();
    const root = path.join(parent, 'project');
    await mkdir(root);
    const inside = path.join(root, 'components.json');
    const outside = path.join(parent, 'escaped.json');
    await writeFile(inside, '{}');
    await writeFile(outside, '{}');
    await symlink(inside, path.join(root, 'alias.json'));
    await symlink(outside, path.join(root, 'linked.json'));

    expect(existingFiles(root, ['linked.json', 'alias.json', 'missing.json'])).toEqual(['alias.json']);
  });
});
