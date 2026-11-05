import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectNextRouters,
  detectSrcDir,
  inferArchitecture,
  listFolders,
  type ArchitectureId,
  type ArchitectureInference,
} from '../../src/detect/layout.js';

const fixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/detect-layout',
);

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-layout-'));
  directories.push(dir);
  return dir;
}

async function copyFixture(name: string): Promise<string> {
  const dir = await tempDir();
  await cp(path.join(fixturesRoot, name), dir, { recursive: true });
  return dir;
}

function namedFolders(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `area-${String(index)}`);
}

function expectBand(
  result: ArchitectureInference,
  id: ArchitectureId,
  confidence: 'high' | 'low',
): void {
  expect(result.id).toBe(id);
  expect(result.confidence).toBeGreaterThan(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  if (confidence === 'high') {
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    return;
  }
  expect(result.confidence).toBeLessThan(0.7);
}

describe('detectSrcDir', () => {
  it.each([
    { fixture: 'src-with-ts', srcDir: 'src', behavior: 'returns src when a nested .ts file exists' },
    { fixture: 'src-with-tsx', srcDir: 'src', behavior: 'returns src when a nested .tsx file exists' },
    { fixture: 'src-empty', srcDir: '', behavior: 'returns empty when src has no TypeScript files' },
    { fixture: 'src-missing', srcDir: '', behavior: 'returns empty when src does not exist' },
  ] as const)('$behavior', async ({ fixture, srcDir }) => {
    const root = await copyFixture(fixture);
    expect(detectSrcDir(root)).toBe(srcDir);
  });

  it('returns empty when src is a file', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'src'), 'export {};\n');
    expect(detectSrcDir(root)).toBe('');
  });

  it('returns empty when src contains only declaration files', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'src', 'types'), { recursive: true });
    await writeFile(path.join(root, 'src', 'vite-env.d.ts'), 'export {};\n');
    await writeFile(path.join(root, 'src', 'types', 'index.d.ts'), 'export {};\n');

    expect(detectSrcDir(root)).toBe('');
  });

  it('returns src when a source file sits beside declaration files', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'index.d.ts'), 'export {};\n');
    await writeFile(path.join(root, 'src', 'index.ts'), 'export {};\n');

    expect(detectSrcDir(root)).toBe('src');
  });

  it.each([
    { dir: 'node_modules/pkg', behavior: 'returns empty when the only TypeScript file is under node_modules' },
    {
      dir: 'alpha/node_modules/pkg',
      behavior: 'returns empty when the only TypeScript file is under a nested node_modules',
    },
    { dir: 'dist', behavior: 'returns empty when the only TypeScript file is under dist' },
    { dir: 'build', behavior: 'returns empty when the only TypeScript file is under build' },
    { dir: '.next/types', behavior: 'returns empty when the only TypeScript file is under .next' },
    { dir: 'coverage', behavior: 'returns empty when the only TypeScript file is under coverage' },
    { dir: '.hidden', behavior: 'returns empty when the only TypeScript file is under a dot-folder' },
  ] as const)('$behavior', async ({ dir }) => {
    const root = await tempDir();
    await mkdir(path.join(root, 'src', dir), { recursive: true });
    await writeFile(path.join(root, 'src', dir, 'index.ts'), 'export {};\n');

    expect(detectSrcDir(root)).toBe('');
  });

  it('returns src when application code exists outside ignored directories', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'src', 'lib'), { recursive: true });
    await mkdir(path.join(root, 'src', 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(root, 'src', 'node_modules', 'pkg', 'index.ts'), 'export {};\n');
    await writeFile(path.join(root, 'src', 'lib', 'client.ts'), 'export {};\n');

    expect(detectSrcDir(root)).toBe('src');
  });
});

describe('detectNextRouters', () => {
  it.each([
    {
      fixture: 'routers-app',
      srcDir: 'src',
      routers: { app: true, pages: false },
      behavior: 'detects the App router under src',
    },
    {
      fixture: 'routers-pages',
      srcDir: 'src',
      routers: { app: false, pages: true },
      behavior: 'detects the Pages router under src',
    },
    {
      fixture: 'routers-both',
      srcDir: 'src',
      routers: { app: true, pages: true },
      behavior: 'detects App and Pages routers together',
    },
    {
      fixture: 'routers-root-app',
      srcDir: 'src',
      routers: { app: true, pages: false },
      behavior: 'detects a root-level app directory when src exists',
    },
    {
      fixture: 'routers-root-pages',
      srcDir: 'src',
      routers: { app: false, pages: true },
      behavior: 'detects a root-level pages directory when src exists',
    },
    {
      fixture: 'routers-root-only',
      srcDir: '',
      routers: { app: true, pages: false },
      behavior: 'detects the App router at the project root when there is no src directory',
    },
  ] as const)('$behavior', async ({ fixture, srcDir, routers }) => {
    const root = await copyFixture(fixture);
    expect(detectSrcDir(root)).toBe(srcDir);
    expect(detectNextRouters(root, srcDir)).toEqual(routers);
  });

  it('does not treat app/pages as the Pages router', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'src', 'app', 'pages'), { recursive: true });
    await writeFile(path.join(root, 'src', 'index.ts'), 'export {};\n');

    expect(detectSrcDir(root)).toBe('src');
    expect(detectNextRouters(root, 'src')).toEqual({ app: true, pages: false });
  });

  it('ignores app and pages when they are files', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'app'), 'not a directory\n');
    await writeFile(path.join(root, 'pages'), 'not a directory\n');

    expect(detectNextRouters(root, '')).toEqual({ app: false, pages: false });
  });
});

describe('listFolders', () => {
  it('returns sorted project folders and drops ignored, dot, and depth-3 directories', async () => {
    const root = await copyFixture('folder-list');
    // `dist/` and `coverage/` match the repo gitignore, so the fixture cannot store them.
    await mkdir(path.join(root, 'src', 'dist'), { recursive: true });
    await mkdir(path.join(root, 'src', 'coverage'), { recursive: true });
    await writeFile(path.join(root, 'src', 'dist', 'index.js'), '');
    await writeFile(path.join(root, 'src', 'coverage', 'lcov.info'), '');

    expect(detectSrcDir(root)).toBe('src');
    expect(listFolders(root, 'src')).toEqual(['alpha', 'alpha/beta', 'mid', 'zebra']);
  });

  it('lists root directories when the source root is the project root', async () => {
    const root = await copyFixture('root-folders');
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await writeFile(path.join(root, 'dist', 'cli.js'), '');

    expect(detectSrcDir(root)).toBe('');
    expect(listFolders(root, '')).toEqual(['components', 'components/ui', 'lib']);
  });

  it('returns no folders when src is missing', async () => {
    const root = await copyFixture('src-missing');
    expect(listFolders(root, 'src')).toEqual([]);
  });
});

describe('inferArchitecture', () => {
  it.each([
    {
      behavior: 'scores a feature-based tree at or above 0.7',
      fixture: 'feature-based',
      folders: ['features', 'features/auth', 'features/billing'],
      id: 'feature-based',
      confidence: 'high',
    },
    {
      behavior: 'scores a layered tree at or above 0.7',
      fixture: 'layered',
      folders: ['application', 'domain', 'infrastructure', 'presentation'],
      id: 'layered',
      confidence: 'high',
    },
    {
      behavior: 'scores an atomic-design tree at or above 0.7',
      fixture: 'atomic',
      folders: [
        'components',
        'components/atoms',
        'components/molecules',
        'components/organisms',
        'components/templates',
      ],
      id: 'atomic-design',
      confidence: 'high',
    },
    {
      behavior: 'scores a mixed feature, layer, and atomic tree below 0.7',
      fixture: 'mixed',
      folders: ['atoms', 'domain', 'features', 'features/auth', 'features/billing'],
      id: 'feature-based',
      confidence: 'low',
    },
  ] as const)('$behavior', async ({ fixture, folders, id, confidence }) => {
    const root = await copyFixture(fixture);
    const found = listFolders(root, 'src');

    expect(detectSrcDir(root)).toBe('src');
    expect(found).toEqual([...folders]);
    expectBand(inferArchitecture(found), id, confidence);
  });

  it.each([
    {
      behavior: 'scores modules with two children as feature-based',
      folders: ['modules', 'modules/api', 'modules/ui'],
      id: 'feature-based',
      confidence: 'high',
    },
    {
      behavior: 'keeps features and modules as one feature-based signal',
      folders: [
        'features',
        'features/auth',
        'features/billing',
        'modules',
        'modules/api',
        'modules/ui',
      ],
      id: 'feature-based',
      confidence: 'high',
    },
    {
      behavior: 'keeps a high score when a feature tree also has shared',
      folders: ['features', 'features/auth', 'features/billing', 'shared'],
      id: 'feature-based',
      confidence: 'high',
    },
    {
      behavior: 'scores three layer names as layered',
      folders: ['domain', 'application', 'infrastructure'],
      id: 'layered',
      confidence: 'high',
    },
    {
      behavior: 'scores two top-level atomic folders as atomic-design',
      folders: ['atoms', 'molecules'],
      id: 'atomic-design',
      confidence: 'high',
    },
    {
      behavior: 'scores components/atoms and components/molecules as atomic-design',
      folders: ['components', 'components/atoms', 'components/molecules'],
      id: 'atomic-design',
      confidence: 'high',
    },
    {
      behavior: 'does not call two layer names a layered architecture',
      folders: ['domain', 'application'],
      id: 'flat',
      confidence: 'low',
    },
    {
      behavior: 'does not call one feature child feature-based',
      folders: ['features', 'features/auth'],
      id: 'flat',
      confidence: 'low',
    },
    {
      behavior: 'scores features, domain, and atoms below 0.7',
      folders: ['features', 'domain', 'atoms'],
      id: 'flat',
      confidence: 'low',
    },
    {
      behavior: 'scores layered and atomic evidence below 0.7',
      folders: ['domain', 'application', 'infrastructure', 'presentation', 'atoms', 'molecules'],
      id: 'layered',
      confidence: 'low',
    },
    {
      behavior: 'keeps feature-based when its weight ties with layered',
      folders: [
        'features',
        'features/auth',
        'features/billing',
        'domain',
        'application',
        'infrastructure',
      ],
      id: 'feature-based',
      confidence: 'low',
    },
    {
      behavior: 'keeps layered when its weight ties with atomic-design',
      folders: ['domain', 'application', 'infrastructure', 'atoms', 'molecules'],
      id: 'layered',
      confidence: 'low',
    },
    {
      behavior: 'scores a small tree with flat Map folders at or above 0.7',
      folders: ['components', 'lib', 'hooks'],
      id: 'flat',
      confidence: 'high',
    },
    {
      behavior: 'scores an empty folder list as flat below 0.7',
      folders: [],
      id: 'flat',
      confidence: 'low',
    },
    {
      behavior: 'scores only app as flat below 0.7',
      folders: ['app'],
      id: 'flat',
      confidence: 'low',
    },
    {
      behavior: 'scores eight top-level folders without Map evidence below 0.7',
      folders: namedFolders(8),
      id: 'flat',
      confidence: 'low',
    },
    {
      behavior: 'scores nine top-level folders as flat below 0.7',
      folders: namedFolders(9),
      id: 'flat',
      confidence: 'low',
    },
  ] as const)('$behavior', ({ folders, id, confidence }) => {
    expectBand(inferArchitecture(folders), id, confidence);
  });
});
