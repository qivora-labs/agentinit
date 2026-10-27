import { glob } from 'tinyglobby';
import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { AgentInitError } from '../errors.js';
import type { FragmentCategory } from '../types.js';
import { defaultRegistryDir } from './locate.js';
import { parseFragment, type Fragment } from './parse.js';

export const FRAGMENT_CATEGORIES = [
  'architecture',
  'language',
  'framework',
  'library',
  'workflow',
] as const satisfies readonly FragmentCategory[];

const CATEGORY_FOLDER = {
  architecture: 'architectures',
  language: 'languages',
  framework: 'frameworks',
  library: 'libraries',
  workflow: 'workflows',
} as const satisfies Record<FragmentCategory, string>;

const REFERENCE_FIELDS = ['requires', 'conflictsWith', 'compatibleWith'] as const;

export interface Registry {
  fragments: Fragment[];
  byId: Map<string, Fragment>;
  byCategory(category: FragmentCategory): Fragment[];
}

interface LoadedFile {
  relativePath: string;
  fragment: Fragment | undefined;
  errors: string[];
}

export async function loadRegistry(dir: string = defaultRegistryDir()): Promise<Registry> {
  if ((await registryDirectory(dir)) === 'missing') return createRegistry([]);

  const relativePaths = await listFragmentPaths(dir);
  const files: LoadedFile[] = [];
  for (const relativePath of relativePaths) {
    files.push(await readFragmentFile(dir, relativePath));
  }

  const ids = new Set<string>();
  for (const file of files) {
    if (file.fragment !== undefined) ids.add(file.fragment.meta.id);
  }

  const firstSeen = new Map<string, string>();
  for (const file of files) {
    if (file.fragment === undefined) continue;
    const id = file.fragment.meta.id;
    const previous = firstSeen.get(id);
    if (previous === undefined) firstSeen.set(id, file.relativePath);
    else file.errors.push(`${file.relativePath}: duplicate id "${id}" (first seen at ${previous})`);
    file.errors.push(...referenceErrors(file.fragment, ids));
  }

  const errors = files.flatMap((file) => file.errors);
  if (errors.length > 0) throw new AgentInitError(errors.join('\n'));

  const fragments: Fragment[] = [];
  for (const file of files) {
    if (file.fragment !== undefined) fragments.push(file.fragment);
  }
  return createRegistry(fragments);
}

/**
 * `meta/` holds the v0.2 customize fragment (PRD §4.2). v0.1 skips the folder
 * so unpublished content there cannot fail the load.
 */
function isMetaPath(relativePath: string): boolean {
  return relativePath === 'meta' || relativePath.startsWith('meta/');
}

/**
 * Content tasks add the markdown later. A checkout with no registry
 * directory, or a package that omitted it, is an empty registry.
 */
async function registryDirectory(dir: string): Promise<'missing' | 'present'> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) throw new AgentInitError(`Not a directory: ${dir}`);
    return 'present';
  } catch (error) {
    if (error instanceof AgentInitError) throw error;
    if (nodeErrorCode(error) === 'ENOENT') return 'missing';
    throw new AgentInitError(`Cannot read registry directory: ${dir}`);
  }
}

async function listFragmentPaths(dir: string): Promise<string[]> {
  const matches = await glob('**/*.md', {
    cwd: dir,
    absolute: false,
    dot: false,
    onlyFiles: true,
  });
  return [...new Set(matches.map(toPosix))]
    .filter((relativePath) => !isMetaPath(relativePath))
    .sort(comparePath);
}

async function readFragmentFile(dir: string, relativePath: string): Promise<LoadedFile> {
  const file: LoadedFile = { relativePath, fragment: undefined, errors: [] };
  let text: string;
  try {
    text = await readFile(path.resolve(dir, ...relativePath.split('/')), 'utf8');
  } catch (error) {
    if (nodeErrorCode(error) === undefined) throw error;
    file.errors.push(`${relativePath}: cannot read file`);
    return file;
  }

  try {
    file.fragment = parseFragment(text, relativePath);
  } catch (error) {
    if (error instanceof AgentInitError) {
      file.errors.push(error.message);
      return file;
    }
    throw error;
  }

  file.errors.push(...locationErrors(relativePath, file.fragment));
  return file;
}

function locationErrors(relativePath: string, fragment: Fragment): string[] {
  const segments = relativePath.split('/');
  const folder = segments[0];
  const fileName = segments[1];
  if (folder === undefined || fileName === undefined || segments.length !== 2) {
    return [`${relativePath}: expected <folder>/<id>.md`];
  }

  const errors: string[] = [];
  const folderCategory = categoryForFolder(folder);
  if (folderCategory === undefined) {
    errors.push(`${relativePath}: unknown registry folder "${folder}"`);
  } else if (folderCategory !== fragment.meta.category) {
    const expected = CATEGORY_FOLDER[fragment.meta.category];
    errors.push(
      `${relativePath}: folder "${folder}" does not match category "${fragment.meta.category}"; expected "${expected}"`,
    );
  }

  const expectedFile = `${fragment.meta.id}.md`;
  if (fileName !== expectedFile) {
    errors.push(`${relativePath}: file name "${fileName}" does not match id "${fragment.meta.id}"`);
  }
  return errors;
}

function referenceErrors(fragment: Fragment, ids: ReadonlySet<string>): string[] {
  if (fragment.meta.category === 'workflow') return [];
  const errors: string[] = [];
  for (const field of REFERENCE_FIELDS) {
    const references = fragment.meta[field];
    if (references === undefined) continue;
    for (const id of references) {
      if (!ids.has(id)) {
        errors.push(`${fragment.sourcePath}: ${field}: unknown id "${id}"`);
      }
    }
  }
  return errors;
}

function categoryForFolder(folder: string): FragmentCategory | undefined {
  for (const category of FRAGMENT_CATEGORIES) {
    if (CATEGORY_FOLDER[category] === folder) return category;
  }
  return undefined;
}

function createRegistry(fragments: readonly Fragment[]): Registry {
  const ordered = [...fragments].sort(compareFragments);
  const byId = new Map(ordered.map((fragment) => [fragment.meta.id, fragment]));
  return {
    fragments: ordered,
    byId,
    byCategory(category: FragmentCategory): Fragment[] {
      return ordered.filter((fragment) => fragment.meta.category === category);
    },
  };
}

function compareFragments(a: Fragment, b: Fragment): number {
  if (a.meta.order !== b.meta.order) return a.meta.order - b.meta.order;
  return comparePath(a.meta.id, b.meta.id);
}

function comparePath(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function toPosix(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
