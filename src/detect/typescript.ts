import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { parseTsconfig } from 'get-tsconfig';
import { AgentInitError } from '../errors.js';
import type { Language, ModuleSystem } from '../types.js';
import { jsoncToJson } from './jsonc.js';
import type { PackageJson } from './packages.js';

const TSCONFIG_FILE = 'tsconfig.json';
const JSCONFIG_FILE = 'jsconfig.json';

export interface CompilerConfigSettings {
  readonly strict: boolean;
  readonly allowJs: boolean;
  readonly checkJs: boolean;
  /** Path aliases from `compilerOptions.paths`, after `extends` is merged. */
  readonly paths: Record<string, string[]>;
  /**
   * Empty when every `extends` target resolved.
   * At most one warning: `get-tsconfig` throws on the first target it cannot
   * find, so later entries in an `extends` array are not reported separately.
   */
  readonly warnings: readonly string[];
  /** Which config file supplied these options. */
  readonly source: 'tsconfig' | 'jsconfig';
}

/** Facts later tasks use for globs, examples, and the module-system line. */
export interface LanguageDetection {
  readonly language: Language;
  readonly allowJs: boolean;
  readonly checkJs: boolean;
  readonly moduleSystem: ModuleSystem | null;
  readonly warnings: readonly string[];
}

/**
 * TypeScript when `tsconfig.json` or a `typescript` dependency exists.
 * Otherwise JavaScript. Prefers `tsconfig.json` over `jsconfig.json` when both
 * exist; reads `jsconfig.json` only when there is no `tsconfig.json`.
 */
export function detectLanguage(root: string, pkgJson: PackageJson): LanguageDetection {
  const hasTsconfig = isFile(configPath(root, TSCONFIG_FILE));
  const isTypeScript = hasTypeScriptDependency(pkgJson) || hasTsconfig;
  // Prefer tsconfig when present; otherwise read jsconfig for paths / checkJs.
  const config = hasTsconfig
    ? readCompilerConfig(root, TSCONFIG_FILE)
    : readCompilerConfig(root, JSCONFIG_FILE);

  const allowJs = config?.allowJs === true;
  const checkJs = config?.checkJs === true;
  const strict = config?.strict === true;

  return {
    language: suggestLanguage({ isTypeScript, strict, checkJs }),
    allowJs,
    checkJs,
    moduleSystem: moduleSystemFrom(pkgJson),
    warnings: config?.warnings ?? [],
  };
}

/**
 * Reads only `<root>/tsconfig.json`. Parent directories are not searched, so a
 * nested package does not inherit a tsconfig that sits above its root.
 * Returns `null` when the file is missing (allowed when `typescript` is installed).
 *
 * `get-tsconfig` throws when an `extends` target is missing. That is a warning:
 * local `strict` and `paths` are still returned so detection can continue.
 */
export function readTsConfig(root: string): CompilerConfigSettings | null {
  return readCompilerConfig(root, TSCONFIG_FILE);
}

/** Same rules as `readTsConfig`, for `<root>/jsconfig.json`. */
export function readJsConfig(root: string): CompilerConfigSettings | null {
  return readCompilerConfig(root, JSCONFIG_FILE);
}

export function suggestLanguage(input: {
  readonly isTypeScript: boolean;
  readonly strict: boolean;
  readonly checkJs: boolean;
}): Language {
  if (input.isTypeScript) {
    return input.strict ? 'typescript-strict' : 'typescript';
  }
  return input.checkJs ? 'javascript-jsdoc' : 'javascript';
}

export function moduleSystemFrom(pkgJson: PackageJson): ModuleSystem | null {
  const type = pkgJson.type;
  if (type === 'module') return 'esm';
  if (type === 'commonjs') return 'cjs';
  return null;
}

function readCompilerConfig(
  root: string,
  fileName: typeof TSCONFIG_FILE | typeof JSCONFIG_FILE,
): CompilerConfigSettings | null {
  const filePath = configPath(root, fileName);
  if (!isFile(filePath)) return null;
  const source = fileName === TSCONFIG_FILE ? 'tsconfig' : 'jsconfig';

  try {
    return settingsFrom(parseTsconfig(filePath).compilerOptions, [], source);
  } catch (error) {
    const target = unresolvedExtendsTarget(error);
    if (target === null) throw invalidConfig(filePath, fileName, error);
    return settingsFrom(localCompilerOptions(filePath, fileName), [unresolvedExtendsWarning(target, fileName)], source);
  }
}

function hasTypeScriptDependency(pkgJson: PackageJson): boolean {
  return (
    pkgJson.dependencies?.typescript !== undefined ||
    pkgJson.devDependencies?.typescript !== undefined
  );
}

function configPath(root: string, fileName: string): string {
  return path.join(root, fileName);
}

function settingsFrom(
  compilerOptions: unknown,
  warnings: readonly string[],
  source: CompilerConfigSettings['source'],
): CompilerConfigSettings {
  const options = asRecord(compilerOptions);
  return {
    strict: options?.strict === true,
    // jsconfig defaults allowJs to true (TypeScript); mirror that when the
    // unresolved-extends fallback skips get-tsconfig's merged defaults.
    allowJs: source === 'jsconfig' ? options?.allowJs !== false : options?.allowJs === true,
    checkJs: options?.checkJs === true,
    paths: readPaths(options?.paths),
    warnings,
    source,
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

function unresolvedExtendsWarning(target: string, fileName: string): string {
  const label = fileName === TSCONFIG_FILE ? 'tsconfig' : 'jsconfig';
  return `Could not resolve ${label} extends "${target}". Using options from ${fileName}.`;
}

function invalidConfig(filePath: string, fileName: string, error: unknown): AgentInitError {
  if (error instanceof AgentInitError) return error;
  const detail = error instanceof Error ? error.message : `Unreadable ${fileName}`;
  return new AgentInitError(`Invalid ${fileName}: ${filePath}. ${detail}`);
}

/** Compiler options written in this file, without resolving `extends`. */
function localCompilerOptions(filePath: string, fileName: string): unknown {
  const data = parseJsonc(readText(filePath), filePath, fileName);
  const record = asRecord(data);
  if (record === null) throw new AgentInitError(`Invalid ${fileName}: ${filePath}`);
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
 * return the local file when resolution throws, and tsconfig/jsconfig are JSONC.
 */
function parseJsonc(text: string, filePath: string, fileName: string): unknown {
  try {
    return JSON.parse(jsoncToJson(text)) as unknown;
  } catch {
    throw new AgentInitError(`Invalid ${fileName}: ${filePath}`);
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
