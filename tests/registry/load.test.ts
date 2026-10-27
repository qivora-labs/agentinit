import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { ERROR } from '../../src/exit-codes.js';
import { loadRegistry } from '../../src/registry/load.js';

const fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));
const sampleDir = path.join(fixtures, 'registry-sample');
const invalidDir = path.join(fixtures, 'registry-invalid');

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-'));
  directories.push(dir);
  return dir;
}

function rule(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'Name',
    version: '1.0.0',
    order: 10,
    description: 'A fragment.',
    scope: 'always',
    sources: ['https://example.com/docs'],
    verifiedAt: '2026-10-17',
    ...overrides,
  };
}

async function writeFragment(root: string, relativePath: string, data: Record<string, unknown>): Promise<void> {
  const file = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `---\n${stringify(data)}---\n## Body\ntext\n`);
}

async function loadError(dir: string): Promise<AgentInitError> {
  try {
    await loadRegistry(dir);
  } catch (error) {
    if (error instanceof AgentInitError) return error;
    throw error;
  }
  throw new Error('expected loadRegistry to throw');
}

describe('loadRegistry', () => {
  it('returns sample fragments sorted by order then id and skips meta/', async () => {
    const registry = await loadRegistry(sampleDir);
    expect(registry.fragments.map((fragment) => fragment.meta.id)).toEqual([
      'layered',
      'typescript',
      'typescript-strict',
      'nextjs-app-router',
      'nextjs-pages-router',
      'forms',
      'shadcn',
      'tailwind',
      'vitest',
      'zustand',
      'new-feature',
      'review-arch',
    ]);
    expect([...registry.byId.keys()]).toEqual([
      'layered',
      'typescript',
      'typescript-strict',
      'nextjs-app-router',
      'nextjs-pages-router',
      'forms',
      'shadcn',
      'tailwind',
      'vitest',
      'zustand',
      'new-feature',
      'review-arch',
    ]);
    expect(registry.byCategory('library').map((fragment) => fragment.meta.id)).toEqual([
      'forms',
      'shadcn',
      'tailwind',
      'vitest',
      'zustand',
    ]);
    expect(registry.byCategory('workflow').map((fragment) => fragment.meta.id)).toEqual([
      'new-feature',
      'review-arch',
    ]);
    expect(registry.byId.get('zustand')?.sourcePath).toBe('libraries/zustand.md');

    const zustand = registry.byId.get('zustand');
    if (zustand === undefined || zustand.meta.category === 'workflow') {
      throw new Error('expected the zustand library fragment');
    }
    expect(zustand.meta.requires).toEqual(['typescript-strict']);
    expect(zustand.meta.conflictsWith).toEqual(['layered']);
    expect(zustand.meta.compatibleWith).toEqual(['nextjs-app-router']);
    expect(registry.byId.get('customize')).toBeUndefined();
  });

  it('sorts equal order values by id', async () => {
    const dir = await tempDir();
    await writeFragment(dir, 'libraries/zeta.md', rule({ id: 'zeta', name: 'Zeta', category: 'library', order: 5 }));
    await writeFragment(dir, 'libraries/alpha.md', rule({ id: 'alpha', name: 'Alpha', category: 'library', order: 5 }));
    await writeFragment(dir, 'architectures/mid.md', rule({ id: 'mid', name: 'Mid', category: 'architecture', order: 5 }));
    await writeFragment(dir, 'frameworks/early.md', rule({ id: 'early', name: 'Early', category: 'framework', order: 1 }));
    await writeFile(path.join(dir, 'notes.txt'), 'not a fragment');

    const registry = await loadRegistry(dir);
    expect(registry.fragments.map((fragment) => fragment.meta.id)).toEqual(['early', 'alpha', 'mid', 'zeta']);
    expect(registry.byCategory('library').map((fragment) => fragment.meta.id)).toEqual(['alpha', 'zeta']);
  });

  it('treats a missing directory as an empty registry', async () => {
    const dir = await tempDir();
    const registry = await loadRegistry(path.join(dir, 'missing'));
    expect(registry.fragments).toEqual([]);
    expect(registry.byCategory('architecture')).toEqual([]);
    expect(registry.byId.size).toBe(0);
  });

  it('rejects a registry path that is a file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'registry.md');
    await writeFile(file, '---\n');
    const error = await loadError(file);
    expect(error.exitCode).toBe(ERROR);
    expect(error.message).toContain('Not a directory');
    expect(error.message).toContain(file);
  });

  it('reports a fragment in the wrong category folder', async () => {
    const error = await loadError(path.join(invalidDir, 'wrong-folder'));
    expect(error.exitCode).toBe(ERROR);
    expect(error.message).toBe(
      'frameworks/zustand.md: folder "frameworks" does not match category "library"; expected "libraries"',
    );
  });

  it('reports a file name that does not match the id', async () => {
    const error = await loadError(path.join(invalidDir, 'file-name'));
    expect(error.message).toBe(
      'libraries/wrong-name.md: file name "wrong-name.md" does not match id "zustand"',
    );
  });

  it('reports a duplicate id once', async () => {
    const error = await loadError(path.join(invalidDir, 'duplicate-id'));
    expect(error.message).toBe(
      'libraries/zustand.md: duplicate id "zustand" (first seen at frameworks/zustand.md)',
    );
  });

  it('reports a requires id that is not in the registry', async () => {
    const error = await loadError(path.join(invalidDir, 'dangling-requires'));
    expect(error.message).toBe('libraries/zustand.md: requires: unknown id "tailwind"');
  });

  it('reports every invalid file in one error, in path order', async () => {
    const error = await loadError(path.join(invalidDir, 'multiple'));
    expect(error.message).toBe(
      [
        'architectures/broken.md: missing frontmatter block',
        'frameworks/layered.md: folder "frameworks" does not match category "library"; expected "libraries"',
        'languages/typescript.md: requires: unknown id "missing-lang"',
        'languages/typescript.md: conflictsWith: unknown id "missing-conflict"',
        'languages/typescript.md: compatibleWith: unknown id "missing-compat"',
        'libraries/mismatch.md: file name "mismatch.md" does not match id "zustand"',
        'libraries/zustand.md: duplicate id "zustand" (first seen at libraries/mismatch.md)',
      ].join('\n'),
    );
  });

  it('reports an unknown folder and a nested path', async () => {
    const dir = await tempDir();
    await writeFragment(dir, 'notes/stray.md', rule({ id: 'stray', name: 'Stray', category: 'library' }));
    await writeFragment(
      dir,
      'libraries/nested/zustand.md',
      rule({ id: 'zustand', name: 'Zustand', category: 'library' }),
    );
    await writeFragment(dir, 'readme.md', rule({ id: 'readme', name: 'Readme', category: 'library' }));

    const error = await loadError(dir);
    expect(error.message).toBe(
      [
        'libraries/nested/zustand.md: expected <folder>/<id>.md',
        'notes/stray.md: unknown registry folder "notes"',
        'readme.md: expected <folder>/<id>.md',
      ].join('\n'),
    );
  });

  it('reports a file name whose case does not match the id', async () => {
    const dir = await tempDir();
    await writeFragment(dir, 'libraries/Zustand.md', rule({ id: 'zustand', name: 'Zustand', category: 'library' }));
    const error = await loadError(dir);
    expect(error.message).toBe('libraries/Zustand.md: file name "Zustand.md" does not match id "zustand"');
  });
});
