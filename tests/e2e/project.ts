import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareText } from '../../src/compare-text.js';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

export interface TempProject {
  copyFixture: (name: string) => Promise<string>;
  empty: () => Promise<string>;
  cleanup: () => Promise<void>;
}

export function createTempProject(prefix: string): TempProject {
  const directories: string[] = [];
  return {
    async copyFixture(name: string): Promise<string> {
      const parent = await mkdtemp(path.join(tmpdir(), prefix));
      directories.push(parent);
      const dir = path.join(parent, 'project');
      await cp(path.join(fixtures, name), dir, { recursive: true });
      return dir;
    },
    async empty(): Promise<string> {
      const dir = await mkdtemp(path.join(tmpdir(), prefix));
      directories.push(dir);
      return dir;
    },
    async cleanup(): Promise<void> {
      await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
    },
  };
}

export async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
  await walk(root, '');
  files.sort(compareText);
  return files;
}

export async function treeText(root: string): Promise<string> {
  const parts: string[] = [];
  for (const file of await listFiles(root)) {
    parts.push(`===== ${file}\n${await readFile(path.join(root, file), 'utf8')}`);
  }
  return `${parts.join('\n')}\n`;
}

export async function treeDigest(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await listFiles(root)) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
