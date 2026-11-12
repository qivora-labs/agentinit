import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { parseTsconfig } from 'get-tsconfig';
import { AgentInitError, UnsupportedProjectError } from '../errors.js';
import type { Language } from '../types.js';
import { jsoncToJson } from './jsonc.js';
import type { PackageJson } from './packages.js';

const TSCONFIG_FILE = 'tsconfig.json';

export interface TsConfigSettings {
  readonly strict: boolean;
  /** Path aliases from `compilerOptions.paths`, after `extends` is merged. */
  readonly paths: Record<string, string[]>;
  /**
   * Empty when every `extends` target resolved.
   * At most one warning: `get-tsconfig` throws on the first target it cannot
   * find, so later entries in an `extends` array are not reported separately.
   */
  readonly warnings: readonly string[];
}

/**
 * `tsconfig.json` or a `typescript` dependency is required.
 * JavaScript-only projects stop here, before anything is written.
 */
export function assertTypeScriptProject(root: string, pkgJson: PackageJson): void {
  if (hasTypeScriptDependency(pkgJson) || isFile(tsconfigPath(root))) return;
  throw new UnsupportedProjectError("JavaScript projects aren't supported yet");
}

/**
 * Reads only `<root>/tsconfig.json`. Parent directories are not searched, so a
 * nested package does not inherit a tsconfig that sits above its root.
 * Returns `null` when the file is missing (allowed when `typescript` is installed).
 *
 * `get-tsconfig` throws when an `extends` target is missing. That is a warning:
 * local `strict` and `paths` are still returned so detection can continue.
 */
export function readTsConfig(root: string): TsConfigSettings | null {
  const filePath = tsconfigPath(root);
  if (!isFile(filePath)) return null;

  try {
    return settingsFrom(parseTsconfig(filePath).compilerOptions, []);
  } catch (error) {
    const target = unresolvedExtendsTarget(error);
    if (target === null) throw invalidTsconfig(filePath, error);
    return settingsFrom(localCompilerOptions(filePath), [unresolvedExtendsWarning(target)]);
  }
}

/** `typescript-strict` only when `strict` is true. A missing tsconfig stays `typescript`. */
export function suggestLanguage(tsconfig: { readonly strict: boolean } | null): Language {
  return tsconfig?.strict === true ? 'typescript-strict' : 'typescript';
}

function hasTypeScriptDependency(pkgJson: PackageJson): boolean {
  return (
    pkgJson.dependencies?.typescript !== undefined ||
    pkgJson.devDependencies?.typescript !== undefined
  );
}

function tsconfigPath(root: string): string {
  return path.join(root, TSCONFIG_FILE);
}

function settingsFrom(compilerOptions: unknown, warnings: readonly string[]): TsConfigSettings {
  const options = asRecord(compilerOptions);
  return {
    strict: options?.strict === true,
    paths: readPaths(options?.paths),
    warnings,
  };
}

/**
 * `get-tsconfig` reports a missing extends target as `File '<target>' not found.`
 * Other failures (for example a circular extends) are real config errors.
 */
function unresolvedExtendsTarget(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const prefix = "File '";
  const suffix = "' not found.";
  const { message } = error;
  if (!message.startsWith(prefix) || !message.endsWith(suffix)) return null;
  const target = message.slice(prefix.length, message.length - suffix.length);
  return target === '' ? null : target;
}

function unresolvedExtendsWarning(target: string): string {
  return `Could not resolve tsconfig extends "${target}". Using options from ${TSCONFIG_FILE}.`;
}

function invalidTsconfig(filePath: string, error: unknown): AgentInitError {
  if (error instanceof AgentInitError) return error;
  const detail = error instanceof Error ? error.message : 'Unreadable tsconfig.json';
  return new AgentInitError(`Invalid tsconfig.json: ${filePath}. ${detail}`);
}

/** Compiler options written in this file, without resolving `extends`. */
function localCompilerOptions(filePath: string): unknown {
  const data = parseJsonc(readText(filePath), filePath);
  const record = asRecord(data);
  if (record === null) throw new AgentInitError(`Invalid tsconfig.json: ${filePath}`);
  return record.compilerOptions;
}

function readPaths(value: unknown): Record<string, string[]> {
  const record = asRecord(value);
  if (record === null) return {};
  const paths: Record<string, string[]> = {};
  for (const [alias, targets] of Object.entries(record)) {
    if (!isStringArray(targets)) continue;
    paths[alias] = [...targets];
  }
  return paths;
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (typeof item !== 'string') return false;
  }
  return true;
}

function readText(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    throw new AgentInitError(`Cannot read ${filePath}.`);
  }
}

/**
 * Fallback parser for the unresolved-`extends` path. `get-tsconfig` does not
 * return the local file when resolution throws, and tsconfig files are JSONC.
 */
function parseJsonc(text: string, filePath: string): unknown {
  try {
    return JSON.parse(jsoncToJson(text)) as unknown;
  } catch {
    throw new AgentInitError(`Invalid tsconfig.json: ${filePath}`);
  }
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
