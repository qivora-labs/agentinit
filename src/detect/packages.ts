import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { minVersion, valid, validRange } from 'semver';
import { parse as parseYaml } from 'yaml';
import { AgentInitError } from '../errors.js';
import type { PackageManager } from '../types.js';

const KNOWN_SCRIPTS = ['build', 'dev', 'lint', 'test', 'typecheck'] as const;

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
] as const satisfies readonly (readonly [string, PackageManager])[];

export interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly packageManager?: string;
  readonly scripts?: Readonly<Record<string, string>>;
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

  const dependencies = readStringRecord(record.dependencies, manifestPath);
  const devDependencies = readStringRecord(record.devDependencies, manifestPath);
  const packageManager = readOptionalString(record.packageManager, manifestPath);
  const scripts = readStringRecord(record.scripts, manifestPath);

  return {
    ...(dependencies !== undefined ? { dependencies } : {}),
    ...(devDependencies !== undefined ? { devDependencies } : {}),
    ...(packageManager !== undefined ? { packageManager } : {}),
    ...(scripts !== undefined ? { scripts } : {}),
  };
}

/**
 * Installed `node_modules/<name>/package.json` wins, then a parsed lockfile, then
 * `semver.minVersion` of the range. Unresolvable specifiers are `null`.
 * The same name in both dependency maps keeps the `dependencies` specifier.
 */
export function resolveVersions(root: string, pkgJson: PackageJson): Record<string, string | null> {
  const locked = readLockfileVersions(root);
  const versions: Record<string, string | null> = {};
  for (const [name, specifier] of dependencySpecifiers(pkgJson)) {
    versions[name] =
      installedVersion(root, name) ?? locked.get(name) ?? versionFromSpecifier(specifier);
  }
  return versions;
}

/** `packageManager` field, then the first known lockfile, then `npm`. */
export function detectPackageManager(root: string, pkgJson: PackageJson): PackageManager {
  const fromField = packageManagerFromField(pkgJson.packageManager);
  if (fromField !== null) return fromField;
  for (const [file, manager] of LOCKFILES) {
    if (isFile(path.join(root, file))) return manager;
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
    if (resolved !== null && isFile(resolved)) found.push(candidate);
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
 * A dependency name is a path under `node_modules`. Names that resolve outside
 * that directory are ignored so detection cannot read arbitrary files.
 * Missing or unreadable install manifests fall through to the lockfile.
 */
function installedVersion(root: string, name: string): string | null {
  const modulesRoot = path.resolve(root, 'node_modules');
  const manifestPath = path.resolve(modulesRoot, name, 'package.json');
  if (!isInside(modulesRoot, manifestPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
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
 * also present. Unknown or invalid lockfiles contribute no versions.
 */
function readLockfileVersions(root: string): ReadonlyMap<string, string> {
  const pnpmLock = path.join(root, 'pnpm-lock.yaml');
  if (isFile(pnpmLock)) return readPnpmLockVersions(pnpmLock);
  const npmLock = path.join(root, 'package-lock.json');
  if (isFile(npmLock)) return readNpmLockVersions(npmLock);
  return new Map();
}

function readNpmLockVersions(filePath: string): Map<string, string> {
  const versions = new Map<string, string>();
  const data = parseJsonRecord(filePath);
  if (data === null) return versions;
  const packages = asRecord(data.packages);
  if (packages === null) return versions;

  for (const [key, entry] of Object.entries(packages)) {
    if (!key.startsWith('node_modules/')) continue;
    const name = key.slice('node_modules/'.length);
    if (name === '' || name.includes('/node_modules/')) continue;
    const version = lockEntryVersion(entry);
    if (version !== null) versions.set(name, version);
  }
  return versions;
}

function readPnpmLockVersions(filePath: string): Map<string, string> {
  const versions = new Map<string, string>();
  const data = parseYamlRecord(filePath);
  if (data === null) return versions;
  const importers = asRecord(data.importers);
  const importer = importers === null ? null : asRecord(importers['.']);
  if (importer === null) return versions;

  collectPnpmVersions(importer.dependencies, versions);
  collectPnpmVersions(importer.devDependencies, versions);
  return versions;
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

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
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
