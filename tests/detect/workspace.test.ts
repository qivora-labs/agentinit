import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPackageJson } from '../../src/detect/packages.js';
import {
  findGitRoot,
  isMonorepoRoot,
  type MonorepoTool,
  type WorkspacePackageJson,
} from '../../src/detect/workspace.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-detect-'));
  directories.push(dir);
  return dir;
}

describe('isMonorepoRoot', () => {
  it.each([
    {
      behavior: 'detects a pnpm workspace from pnpm-workspace.yaml',
      tool: 'pnpm',
      file: 'pnpm-workspace.yaml',
      pkg: {} satisfies WorkspacePackageJson,
    },
    {
      behavior: 'detects npm workspaces from a workspaces array',
      tool: 'npm',
      pkg: { workspaces: ['packages/*'] } satisfies WorkspacePackageJson,
    },
    {
      behavior: 'detects yarn workspaces from workspaces.packages',
      tool: 'npm',
      pkg: { workspaces: { packages: ['packages/*'] } } satisfies WorkspacePackageJson,
    },
    {
      behavior: 'detects Turborepo from turbo.json',
      tool: 'turbo',
      file: 'turbo.json',
      pkg: {} satisfies WorkspacePackageJson,
    },
    {
      behavior: 'detects Nx from nx.json',
      tool: 'nx',
      file: 'nx.json',
      pkg: {} satisfies WorkspacePackageJson,
    },
    {
      behavior: 'detects Lerna from lerna.json',
      tool: 'lerna',
      file: 'lerna.json',
      pkg: {} satisfies WorkspacePackageJson,
    },
  ] as const)('$behavior', async ({ tool, file, pkg }: {
    behavior: string;
    tool: MonorepoTool;
    file?: string;
    pkg: WorkspacePackageJson;
  }) => {
    const root = await tempDir();
    if (file !== undefined) await writeFile(path.join(root, file), '');

    expect(isMonorepoRoot(root, pkg)).toEqual({ isRoot: true, tool });
  });

  it.each([
    { behavior: 'ignores an empty workspaces array', pkg: { workspaces: [] } },
    { behavior: 'ignores an empty workspaces.packages array', pkg: { workspaces: { packages: [] } } },
    { behavior: 'ignores a package.json without workspaces', pkg: {} },
    { behavior: 'ignores null workspaces', pkg: { workspaces: null } },
    { behavior: 'ignores a string workspaces field', pkg: { workspaces: 'packages/*' } },
    { behavior: 'ignores workspaces.packages that is not an array', pkg: { workspaces: { packages: 'packages/*' } } },
  ] as const)('$behavior', async ({ pkg }) => {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), '{}\n');

    expect(isMonorepoRoot(root, pkg)).toEqual({ isRoot: false });
  });

  it('does not treat a workspace package as the monorepo root', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    const pkgDir = path.join(root, 'packages', 'web');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(pkgDir, 'package.json'), '{}\n');

    expect(isMonorepoRoot(root, {})).toEqual({ isRoot: true, tool: 'pnpm' });
    expect(isMonorepoRoot(pkgDir, {})).toEqual({ isRoot: false });
  });

  it('reports pnpm when pnpm-workspace.yaml and turbo.json are both present', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), '');
    await writeFile(path.join(root, 'turbo.json'), '');

    expect(isMonorepoRoot(root, { workspaces: ['packages/*'] })).toEqual({
      isRoot: true,
      tool: 'pnpm',
    });
  });

  it('reports npm workspaces ahead of turbo.json', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'turbo.json'), '');

    expect(isMonorepoRoot(root, { workspaces: ['packages/*'] })).toEqual({
      isRoot: true,
      tool: 'npm',
    });
  });

  it('detects npm workspaces from the package.json reader', async () => {
    const root = await tempDir();
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['packages/*'], nohoist: ['**/react'] } }),
    );
    const pkg = readPackageJson(root);
    if (pkg === null) throw new Error('missing package.json');

    expect(isMonorepoRoot(root, pkg)).toEqual({ isRoot: true, tool: 'npm' });
  });

  it('ignores marker names that are directories', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'pnpm-workspace.yaml'));
    await mkdir(path.join(root, 'turbo.json'));
    await mkdir(path.join(root, 'nx.json'));
    await mkdir(path.join(root, 'lerna.json'));

    expect(isMonorepoRoot(root, {})).toEqual({ isRoot: false });
  });
});

describe('findGitRoot', () => {
  it('returns the directory that contains a .git directory', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    const nested = path.join(repo, 'packages', 'web');
    await mkdir(nested, { recursive: true });

    expect(findGitRoot(repo)).toBe(repo);
    expect(findGitRoot(nested)).toBe(repo);
  });

  it('returns the directory that contains a .git file', async () => {
    const repo = await tempDir();
    const nested = path.join(repo, 'apps', 'web');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, '.git'), 'gitdir: /main/repo/.git/worktrees/web\n');

    expect(findGitRoot(nested)).toBe(nested);
    expect(findGitRoot(path.join(nested, 'src'))).toBe(nested);
  });

  it('returns null when no .git exists above the start path', async () => {
    const dir = await tempDir();
    const nested = path.join(dir, 'src');
    await mkdir(nested);

    expect(findGitRoot(dir)).toBeNull();
    expect(findGitRoot(nested)).toBeNull();
  });

  it('stops at the nearest .git entry', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    const nested = path.join(repo, 'packages', 'web');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, '.git'), 'gitdir: /main/repo/.git/modules/web\n');

    expect(findGitRoot(nested)).toBe(nested);
  });

  // path.relative across drives is absolute. Windows CI checks out on D: and
  // puts temp files on C:, so step into the temp parent and keep `..` literal.
  it('resolves a relative start path that contains ..', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    await mkdir(path.join(repo, 'src'));
    const previous = process.cwd();

    try {
      process.chdir(path.dirname(repo));
      const start = `${path.basename(repo)}${path.sep}src${path.sep}..`;

      expect(start.includes('..')).toBe(true);
      expect(path.isAbsolute(start)).toBe(false);
      expect(findGitRoot(start)).toBe(realpathSync(repo));
    } finally {
      process.chdir(previous);
    }
  });
});
