import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { defaultRegistryDir, findPackageRoot } from '../../src/registry/locate.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-'));
  directories.push(dir);
  return dir;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('findPackageRoot', () => {
  it('resolves the package root from a src module URL', () => {
    const fromUrl = pathToFileURL(path.join(packageRoot, 'src', 'registry', 'locate.ts')).href;
    expect(findPackageRoot(fromUrl)).toBe(packageRoot);
  });

  it('resolves the package root from the built dist/cli.js URL', () => {
    const fromUrl = pathToFileURL(path.join(packageRoot, 'dist', 'cli.js')).href;
    expect(findPackageRoot(fromUrl)).toBe(packageRoot);
  });

  it('skips package.json files whose name is not @agentinit/cli', async () => {
    const root = await tempDir();
    const nested = path.join(root, 'packages', 'app');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@agentinit/cli' }));
    await writeFile(path.join(root, 'packages', 'package.json'), JSON.stringify({ name: 'other-workspace' }));
    await writeFile(path.join(nested, 'package.json'), JSON.stringify({ name: 'nested-app' }));

    expect(findPackageRoot(pathToFileURL(path.join(nested, 'module.js')).href)).toBe(root);
  });

  it('stops at the nearest package.json named @agentinit/cli', async () => {
    const root = await tempDir();
    const nested = path.join(root, 'packages', 'cli');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@agentinit/cli' }));
    await writeFile(path.join(nested, 'package.json'), JSON.stringify({ name: '@agentinit/cli' }));

    expect(findPackageRoot(pathToFileURL(path.join(nested, 'module.js')).href)).toBe(nested);
  });

  it('throws when no package.json names @agentinit/cli', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'other' }));
    const fromUrl = pathToFileURL(path.join(root, 'src', 'module.js')).href;

    expect(() => findPackageRoot(fromUrl)).toThrow(AgentInitError);
    expect(() => findPackageRoot(fromUrl)).toThrow('@agentinit/cli');
  });

  it('throws when a package.json on the walk is invalid JSON', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), '{');
    const fromUrl = pathToFileURL(path.join(root, 'module.js')).href;

    expect(() => findPackageRoot(fromUrl)).toThrow(AgentInitError);
    expect(() => findPackageRoot(fromUrl)).toThrow('Invalid package.json');
  });
});

describe('defaultRegistryDir', () => {
  it('joins registry/ onto the package root', () => {
    expect(defaultRegistryDir()).toBe(path.join(packageRoot, 'registry'));
  });
});
