import { statSync } from 'node:fs';
import * as path from 'node:path';

/**
 * npm and yarn both store workspace globs in `package.json`. Yarn may nest
 * them under `packages`. Either shape is reported as `npm`.
 */
export type PackageWorkspaces = readonly string[] | { readonly packages?: readonly string[] };

/**
 * `workspaces` stays `unknown` because this value comes from parsed JSON.
 * Only a non-empty glob list, or a non-empty `packages` list, is a root.
 */
export interface WorkspacePackageJson {
  readonly workspaces?: unknown;
}

export type MonorepoTool = 'pnpm' | 'npm' | 'turbo' | 'nx' | 'lerna';

export type MonorepoDetection =
  | { readonly isRoot: false }
  | { readonly isRoot: true; readonly tool: MonorepoTool };

/**
 * Markers are read only inside `root`. A package checked out under a workspace
 * has none of these files, so it is not a root. v0.1 does not walk upward.
 *
 * First match wins. `pnpm-workspace.yaml` is ahead of `turbo.json` because a
 * pnpm workspace often carries both, and the workspace file is the root signal.
 * An empty list, `null`, and any value that is not a glob list are not a root.
 */
export function isMonorepoRoot(root: string, pkgJson: WorkspacePackageJson): MonorepoDetection {
  if (isFile(path.join(root, 'pnpm-workspace.yaml'))) return detected('pnpm');
  if (hasPackageWorkspaces(pkgJson)) return detected('npm');
  if (isFile(path.join(root, 'turbo.json'))) return detected('turbo');
  if (isFile(path.join(root, 'nx.json'))) return detected('nx');
  if (isFile(path.join(root, 'lerna.json'))) return detected('lerna');
  return { isRoot: false };
}

/**
 * Directory that contains `.git`, walking from `start` toward the filesystem
 * root. `.git` may be a directory or a file (worktrees and submodules). The
 * path returned is that working tree, including a linked worktree, not the
 * main repository named inside a `.git` file. `null` when no `.git` exists.
 */
export function findGitRoot(start: string): string | null {
  let current = path.resolve(start);
  const filesystemRoot = path.parse(current).root;

  for (;;) {
    if (isGitEntry(path.join(current, '.git'))) return path.resolve(current);
    if (current === filesystemRoot) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function detected(tool: MonorepoTool): MonorepoDetection {
  return { isRoot: true, tool };
}

function hasPackageWorkspaces(pkgJson: WorkspacePackageJson): boolean {
  const workspaces = pkgJson.workspaces;
  if (Array.isArray(workspaces)) return workspaces.length > 0;
  if (!isRecord(workspaces)) return false;
  const packages = workspaces.packages;
  return Array.isArray(packages) && packages.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGitEntry(gitPath: string): boolean {
  try {
    const stats = statSync(gitPath);
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}
