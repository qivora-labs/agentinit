import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentInitError } from '../errors.js';

const PACKAGE_NAME = '@agentinit/cli';

/**
 * Walk past package.json files that belong to a parent workspace or a nested
 * package. The bundled registry lives next to this package's own manifest,
 * from `src/` in tests and from `dist/` in the published build.
 */
export function findPackageRoot(fromUrl: string): string {
  let current = path.dirname(fileURLToPath(fromUrl));
  let previous = '';
  while (current !== previous) {
    const manifestPath = path.join(current, 'package.json');
    if (readPackageName(manifestPath) === PACKAGE_NAME) return current;
    previous = current;
    current = path.dirname(current);
  }
  throw new AgentInitError(`Could not find the ${PACKAGE_NAME} package root.`);
}

export function defaultRegistryDir(): string {
  return path.join(findPackageRoot(import.meta.url), 'registry');
}

function readPackageName(manifestPath: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return undefined;
    throw new AgentInitError(`Cannot read ${manifestPath}.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new AgentInitError(`Invalid package.json: ${manifestPath}`);
  }

  if (typeof data !== 'object' || data === null || !('name' in data)) return undefined;
  return typeof data.name === 'string' ? data.name : undefined;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
