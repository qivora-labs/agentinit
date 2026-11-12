import { readFileSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { minVersion, valid, validRange } from 'semver';
import { parse as parseYaml } from 'yaml';
import { AgentInitError } from '../errors.js';
import type { PackageManager } from '../types.js';
import { findGitRoot, type PackageWorkspaces } from './workspace.js';

const KNOWN_SCRIPTS = ['build', 'dev', 'lint', 'test', 'typecheck'] as const;

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
] as const satisfies readonly (readonly [string, PackageManager])[];

export interface PackageJson {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly packageManager?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly workspaces?: PackageWorkspaces;
}

/** `null` when `package.json` is absent. Invalid JSON or a non-object manifest throws. */
export function readPackageJson(root: string): PackageJson | null {
  const manifestPath = path.join(root, 'package.json');
  const raw = readProjectText(manifestPath);
  if (raw === null) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
  }

  const record = asRecord(data);
  if (record === null) throw new AgentInitError(`Invalid package.json: ${manifestPath}`);

  const name = readOptionalString(record.name, manifestPath);
  const dependencies = readStringRecord(record.dependencies, manifestPath);
  const devDependencies = readStringRecord(record.devDependencies, manifestPath);
  const packageManager = readOptionalString(record.packageManager, manifestPath);
  const scripts = readStringRecord(record.scripts, manifestPath);
  const workspaces = readWorkspaces(record.workspaces, manifestPath);

  return {
    ...(name !== undefined ? { name } : {}),
    ...(dependencies !== undefined ? { dependencies } : {}),
    ...(devDependencies !== undefined ? { devDependencies } : {}),
    ...(packageManager !== undefined ? { packageManager } : {}),
    ...(scripts !== undefined ? { scripts } : {}),
    ...(workspaces !== undefined ? { workspaces } : {}),
  };
}

/**
 * Nearest directory that has a recognised lockfile, starting at the project
 * and never above the git root. With no git repository only the project is
 * considered, so a lockfile in a home directory is never read. When the
 * project has its own lockfile, or none is found, the lookup root is the
 * project and non-workspace behavior is unchanged.
 */
export function findLookupRoot(root: string): string {
  const projectRoot = path.resolve(root);
  if (hasRecognisedLockfile(projectRoot)) return projectRoot;

  const gitRoot = findGitRoot(projectRoot);
  if (gitRoot === null) return projectRoot;

  let current = projectRoot;
  for (;;) {
    if (current === gitRoot) return projectRoot;
    const parent = path.dirname(current);
    if (parent === current || !isInsideOrSame(gitRoot, parent)) return projectRoot;
    current = parent;
    if (hasRecognisedLockfile(current)) return current;
  }
}

/**
 * Installed `node_modules/<name>/package.json` wins, then a parsed lockfile, then
 * `semver.minVersion` of the range. Unresolvable specifiers are `null`.
 * The same name in both dependency maps keeps the `dependencies` specifier.
 * Installed packages and lockfiles are resolved from the lookup root (§3.3).
 */
export function resolveVersions(root: string, pkgJson: PackageJson): Record<string, string | null> {
  const projectRoot = path.resolve(root);
  const lookupRoot = findLookupRoot(projectRoot);
  const locked = readLockfileVersions(projectRoot, lookupRoot);
  const versions: Record<string, string | null> = {};
  for (const [name, specifier] of dependencySpecifiers(pkgJson)) {
    versions[name] =
      installedVersion(projectRoot, lookupRoot, name) ??
      locked.get(name) ??
      versionFromSpecifier(specifier);
  }
  return versions;
}

/**
 * Project `packageManager` field, then the lookup root's field, then the
 * lockfile at the lookup root, then `npm`.
 */
export function detectPackageManager(root: string, pkgJson: PackageJson): PackageManager {
  const fromField = packageManagerFromField(pkgJson.packageManager);
  if (fromField !== null) return fromField;

  const projectRoot = path.resolve(root);
  const lookupRoot = findLookupRoot(projectRoot);
  if (lookupRoot !== projectRoot) {
    const rootPkg = readPackageJson(lookupRoot);
    const fromRootField = packageManagerFromField(rootPkg?.packageManager);
    if (fromRootField !== null) return fromRootField;
  }

  for (const [file, manager] of LOCKFILES) {
    if (isFile(path.join(lookupRoot, file))) return manager;
  }
  return 'npm';
}

/** Only `build`, `dev`, `lint`, `test`, and `typecheck`, and only when present. */
export function detectScripts(pkgJson: PackageJson): Record<string, string> {
  const scripts = pkgJson.scripts;
  if (scripts === undefined) return {};
  const found: Record<string, string> = {};
  for (const name of KNOWN_SCRIPTS) {
    const command = scripts[name];
    if (command !== undefined) found[name] = command;
  }
  return found;
}

/** Candidates that exist as files inside `root`, in candidate order. */
export function existingFiles(root: string, candidates: readonly string[]): string[] {
  const resolvedRoot = path.resolve(root);
  const found: string[] = [];
  for (const candidate of candidates) {
    const resolved = resolveInside(resolvedRoot, candidate);
    if (resolved !== null && isFileInside(resolvedRoot, resolved)) found.push(candidate);
  }
  return found;
}

function dependencySpecifiers(pkgJson: PackageJson): Map<string, string> {
  const specifiers = new Map<string, string>();
  for (const [name, specifier] of Object.entries(pkgJson.dependencies ?? {})) {
    specifiers.set(name, specifier);
  }
  for (const [name, specifier] of Object.entries(pkgJson.devDependencies ?? {})) {
    if (!specifiers.has(name)) specifiers.set(name, specifier);
  }
  return specifiers;
}

/**
 * Walks `node_modules/<name>/package.json` from the project up to the lookup
 * root (Node's resolution order). A dependency name is a path under that
 * directory; names that resolve outside it are ignored. Symlinks are followed
 * only when the canonical target stays inside the lookup root. Missing or
 * unreadable install manifests fall through to the lockfile.
 */
function installedVersion(projectRoot: string, lookupRoot: string, name: string): string | null {
  let current = projectRoot;
  for (;;) {
    const version = installedVersionAt(current, lookupRoot, name);
    if (version !== null) return version;
    if (current === lookupRoot) return null;
    const parent = path.dirname(current);
    if (parent === current || !isInsideOrSame(lookupRoot, parent)) return null;
    current = parent;
  }
}

function installedVersionAt(dir: string, lookupRoot: string, name: string): string | null {
  const modulesRoot = path.resolve(dir, 'node_modules');
  const manifestPath = path.resolve(modulesRoot, name, 'package.json');
  if (!isInside(modulesRoot, manifestPath)) return null;

  const realManifest = realpathInside(lookupRoot, manifestPath);
  if (realManifest === null) return null;

  let raw: string;
  try {
    raw = readFileSync(realManifest, 'utf8');
  } catch {
    return null;
  }

  try {
    const record = asRecord(JSON.parse(raw) as unknown);
    if (record === null || typeof record.version !== 'string') return null;
    return valid(record.version);
  } catch {
    return null;
  }
}

/**
 * `yarn.lock` and `bun.lock` / `bun.lockb` are not parsed in v0.1; those
 * projects fall through to the range in package.json. When `pnpm-lock.yaml`
 * exists it is the only lockfile consulted, even if `package-lock.json` is
 * also present. Unknown or invalid lockfiles contribute no versions. Lockfiles
 * are read at the lookup root; pnpm uses that project's importer, and npm
 * prefers a nested `packages` entry over a hoisted one.
 */
function readLockfileVersions(
  projectRoot: string,
  lookupRoot: string,
): ReadonlyMap<string, string> {
  const importerPath = posixRelative(lookupRoot, projectRoot);
  const pnpmLock = path.join(lookupRoot, 'pnpm-lock.yaml');
  if (isFile(pnpmLock)) return readPnpmLockVersions(pnpmLock, importerPath);
  const npmLock = path.join(lookupRoot, 'package-lock.json');
  if (isFile(npmLock)) return readNpmLockVersions(npmLock, importerPath);
  return new Map();
}

function readNpmLockVersions(filePath: string, importerPath: string): Map<string, string> {
  const versions = new Map<string, string>();
  const data = parseJsonRecord(filePath);
  if (data === null) return versions;
  const packages = asRecord(data.packages);
  if (packages === null) return versions;

  const nestedPrefix =
    importerPath === '.' ? null : `${importerPath}/node_modules/`;
  if (nestedPrefix !== null) {
    collectNpmLockVersions(packages, nestedPrefix, versions);
  }
  collectNpmLockVersions(packages, 'node_modules/', versions);
  return versions;
}

function collectNpmLockVersions(
  packages: Readonly<Record<string, unknown>>,
  prefix: string,
  versions: Map<string, string>,
): void {
  for (const [key, entry] of Object.entries(packages)) {
    if (!key.startsWith(prefix)) continue;
    const name = key.slice(prefix.length);
    if (name === '' || name.includes('/node_modules/') || versions.has(name)) continue;
    const version = lockEntryVersion(entry);
    if (version !== null) versions.set(name, version);
  }
}

function readPnpmLockVersions(filePath: string, importerPath: string): Map<string, string> {
  const versions = new Map<string, string>();
  const data = parseYamlRecord(filePath);
  if (data === null) return versions;
  const importers = asRecord(data.importers);
  const importer = importers === null ? null : asRecord(importers[importerPath]);
  if (importer === null) return versions;

  collectPnpmVersions(importer.dependencies, versions);
  collectPnpmVersions(importer.devDependencies, versions);
  return versions;
}

function hasRecognisedLockfile(dir: string): boolean {
  return LOCKFILES.some(([file]) => isFile(path.join(dir, file)));
}

/** Forward-slash relative path; `.` when `from` and `to` are the same directory. */
function posixRelative(from: string, to: string): string {
  const relative = path.relative(from, to);
  if (relative === '') return '.';
  return relative.split(path.sep).join('/');
}

function collectPnpmVersions(value: unknown, versions: Map<string, string>): void {
  const group = asRecord(value);
  if (group === null) return;
  for (const [name, entry] of Object.entries(group)) {
    if (versions.has(name)) continue;
    const version = lockEntryVersion(entry);
    if (version !== null) versions.set(name, version);
  }
}

function lockEntryVersion(entry: unknown): string | null {
  const record = asRecord(entry);
  if (record === null || typeof record.version !== 'string') return null;
  return peerlessVersion(record.version);
}

/** pnpm appends peers as `1.2.3(react@19.0.0)`. The package version is the head. */
function peerlessVersion(version: string): string | null {
  const head = version.split('(')[0]?.trim() ?? '';
  return valid(head);
}

/**
 * `semver.minVersion` throws on dist-tags and protocol specifiers. `validRange`
 * is null for those, which leaves the version unresolved instead of failing
 * detection. `npm:<name>@<range>` uses the inner range (`npm:@scope/pkg@^1.2.3`
 * included).
 */
function versionFromSpecifier(specifier: string): string | null {
  try {
    const range = npmAliasRange(specifier);
    if (range === null) return null;
    const trimmed = range.trim();
    if (trimmed === '' || validRange(trimmed) === null) return null;
    return minVersion(trimmed)?.version ?? null;
  } catch {
    return null;
  }
}

function npmAliasRange(specifier: string): string | null {
  if (!specifier.startsWith('npm:')) return specifier;
  const body = specifier.slice('npm:'.length);
  const at = body.lastIndexOf('@');
  if (at <= 0) return null;
  return body.slice(at + 1);
}

function packageManagerFromField(field: string | undefined): PackageManager | null {
  if (field === undefined) return null;
  const name = field.trim().split('@')[0]?.trim() ?? '';
  if (isPackageManager(name)) return name;
  return null;
}

function isPackageManager(name: string): name is PackageManager {
  return name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun';
}

function readProjectText(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return null;
    throw new AgentInitError(`Cannot read ${filePath}.`);
  }
}

function parseJsonRecord(filePath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return asRecord(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function parseYamlRecord(filePath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return asRecord(parseYaml(raw));
  } catch {
    return null;
  }
}

function readStringRecord(value: unknown, manifestPath: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value);
  if (record === null) throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
  const entries: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
    entries[key] = entry;
  }
  return entries;
}

/**
 * npm stores a string array. Yarn may use `{ packages, nohoist }`; only
 * `packages` is kept, because monorepo detection compares glob lists.
 */
function readWorkspaces(value: unknown, manifestPath: string): PackageWorkspaces | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return readWorkspaceGlobs(value, manifestPath);
  const record = asRecord(value);
  if (record === null) throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
  if (record.packages === undefined) return {};
  return { packages: readWorkspaceGlobs(record.packages, manifestPath) };
}

function readWorkspaceGlobs(value: unknown, manifestPath: string): string[] {
  if (!Array.isArray(value)) throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
  const globs: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
    globs.push(entry);
  }
  return globs;
}

function readOptionalString(value: unknown, manifestPath: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
  return value;
}

function resolveInside(root: string, candidate: string): string | null {
  if (candidate === '' || path.isAbsolute(candidate)) return null;
  const resolved = path.resolve(root, candidate);
  if (!isInside(root, resolved) || resolved === root) return null;
  return resolved;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  if (relative === '' || relative === '..' || path.isAbsolute(relative)) return false;
  return !relative.startsWith(`..${path.sep}`);
}

function isInsideOrSame(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedRoot === resolvedCandidate || isInside(resolvedRoot, resolvedCandidate);
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * `statSync` follows symlinks. The canonical path has to stay inside `root`
 * (the project, or the lookup root for installed packages), or a link can
 * name a file outside that boundary.
 */
function isFileInside(root: string, filePath: string): boolean {
  const real = realpathInside(root, filePath);
  if (real === null) return false;
  try {
    return statSync(real).isFile();
  } catch {
    return false;
  }
}

function realpathInside(root: string, candidate: string): string | null {
  try {
    const realRoot = realpathSync.native(root);
    const realCandidate = realpathSync.native(candidate);
    if (!isInside(realRoot, realCandidate)) return null;
    return realCandidate;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
