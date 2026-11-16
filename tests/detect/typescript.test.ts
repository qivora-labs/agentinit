import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectLanguage,
  readJsConfig,
  readTsConfig,
  suggestLanguage,
} from '../../src/detect/typescript.js';
import { readPackageJson, type PackageJson } from '../../src/detect/packages.js';
import { AgentInitError } from '../../src/errors.js';

const fixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/detect-typescript',
);

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-detect-'));
  directories.push(dir);
  return dir;
}

async function copyFixture(name: string): Promise<string> {
  const dir = await tempDir();
  await cp(path.join(fixturesRoot, name), dir, { recursive: true });
  return dir;
}

function loadPackage(root: string): PackageJson {
  const pkg = readPackageJson(root);
  if (pkg === null) throw new Error(`missing package.json in ${root}`);
  return pkg;
}

describe('detectLanguage', () => {
  it('selects javascript for a project with only package.json and no TypeScript', async () => {
    const root = await copyFixture('js-only');

    expect(detectLanguage(root, loadPackage(root))).toEqual({
      language: 'javascript',
      allowJs: false,
      checkJs: false,
      moduleSystem: null,
      paths: {},
      warnings: [],
    });
  });

  it('selects javascript-jsdoc when jsconfig enables checkJs', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'app' }));
    await writeFile(
      path.join(root, 'jsconfig.json'),
      JSON.stringify({ compilerOptions: { checkJs: true, paths: { '@app/*': ['./src/*'] } } }),
    );

    expect(detectLanguage(root, loadPackage(root))).toEqual({
      language: 'javascript-jsdoc',
      // jsconfig implies allowJs under TypeScript's defaults (get-tsconfig).
      allowJs: true,
      checkJs: true,
      moduleSystem: null,
      paths: { '@app/*': ['./src/*'] },
      warnings: [],
    });
  });

  it('reads module system from package.json type', async () => {
    const root = await tempDir();
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'app', type: 'module' }),
    );

    expect(detectLanguage(root, loadPackage(root)).moduleSystem).toBe('esm');
  });

  it('keeps TypeScript when tsconfig only enables checkJs', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'app' }));
    await writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { checkJs: true, allowJs: true } }),
    );

    expect(detectLanguage(root, loadPackage(root))).toEqual({
      language: 'typescript',
      allowJs: true,
      checkJs: true,
      moduleSystem: null,
      paths: {},
      warnings: [],
    });
  });

  it.each([
    {
      fixture: 'typescript-dev',
      language: 'typescript',
      behavior: 'treats a typescript devDependency as TypeScript without tsconfig',
    },
    {
      fixture: 'typescript-dep',
      language: 'typescript',
      behavior: 'treats a typescript dependency as TypeScript without tsconfig',
    },
    {
      fixture: 'jsonc',
      language: 'typescript',
      behavior: 'treats tsconfig.json alone as TypeScript',
    },
  ] as const)('$behavior', async ({ fixture, language }) => {
    const root = await copyFixture(fixture);
    expect(detectLanguage(root, loadPackage(root)).language).toBe(language);
  });

  it('prefers tsconfig over jsconfig when both exist', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'app' }));
    await writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, allowJs: true } }),
    );
    await writeFile(
      path.join(root, 'jsconfig.json'),
      JSON.stringify({ compilerOptions: { checkJs: true } }),
    );

    expect(detectLanguage(root, loadPackage(root))).toEqual({
      language: 'typescript-strict',
      allowJs: true,
      checkJs: false,
      moduleSystem: null,
      paths: {},
      warnings: [],
    });
  });
});

describe('readTsConfig', () => {
  it('returns null when typescript is installed and tsconfig.json is missing', async () => {
    const root = await copyFixture('typescript-dev');

    expect(readTsConfig(root)).toBeNull();
    expect(suggestLanguage({ isTypeScript: true, strict: false, checkJs: false })).toBe('typescript');
  });

  it('ignores a tsconfig.json above the project root', async () => {
    const parent = await tempDir();
    const root = path.join(parent, 'pkg');
    await mkdir(root);
    await writeFile(
      path.join(parent, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );

    expect(readTsConfig(root)).toBeNull();
  });

  it('parses comments and trailing commas', async () => {
    const root = await copyFixture('jsonc');

    expect(readTsConfig(root)).toEqual({
      strict: false,
      allowJs: false,
      checkJs: false,
      paths: {
        '@app/*': ['./src/*'],
        '@lib': ['./lib/index.ts'],
      },
      warnings: [],
      source: 'tsconfig',
    });
  });

  it('detects strict inherited through a relative extends', async () => {
    const root = await copyFixture('extends-relative');
    const tsconfig = readTsConfig(root);

    expect(tsconfig).toEqual({
      strict: true,
      allowJs: false,
      checkJs: false,
      paths: {
        '@base/*': ['packages/*'],
      },
      warnings: [],
      source: 'tsconfig',
    });
    expect(
      suggestLanguage({
        isTypeScript: true,
        strict: tsconfig?.strict === true,
        checkJs: false,
      }),
    ).toBe('typescript-strict');
  });

  it('returns local options and a warning when extends names a missing package', async () => {
    const root = await copyFixture('extends-missing');

    expect(readTsConfig(root)).toEqual({
      strict: false,
      allowJs: false,
      checkJs: false,
      paths: {
        '@app/*': ['./src/*'],
      },
      warnings: [
        'Could not resolve tsconfig extends "@tsconfig/strictest". Using options from tsconfig.json.',
      ],
      source: 'tsconfig',
    });
  });

  it('returns local options and a warning when a relative extends target is missing', async () => {
    const root = await tempDir();
    await writeFile(
      path.join(root, 'tsconfig.json'),
      `{
        "extends": "./tsconfig.missing.json",
        "compilerOptions": {
          "strict": true,
          "paths": { "@app/*": ["./src/*"] }
        }
      }`,
    );

    expect(readTsConfig(root)).toEqual({
      strict: true,
      allowJs: false,
      checkJs: false,
      paths: { '@app/*': ['./src/*'] },
      warnings: [
        'Could not resolve tsconfig extends "./tsconfig.missing.json". Using options from tsconfig.json.',
      ],
      source: 'tsconfig',
    });
  });

  it('throws AgentInitError when extends is circular', async () => {
    const root = await tempDir();
    const filePath = path.join(root, 'tsconfig.json');
    await writeFile(
      filePath,
      JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: { strict: true } }),
    );
    await writeFile(
      path.join(root, 'tsconfig.base.json'),
      JSON.stringify({ extends: './tsconfig.json' }),
    );

    expect(() => readTsConfig(root)).toThrow(AgentInitError);
    expect(() => readTsConfig(root)).toThrow(filePath);
  });
});

describe('readJsConfig', () => {
  it('reads checkJs and paths from jsconfig.json', async () => {
    const root = await tempDir();
    await writeFile(
      path.join(root, 'jsconfig.json'),
      JSON.stringify({ compilerOptions: { checkJs: true, paths: { '@lib/*': ['./lib/*'] } } }),
    );

    expect(readJsConfig(root)).toEqual({
      strict: false,
      allowJs: true,
      checkJs: true,
      paths: { '@lib/*': ['./lib/*'] },
      warnings: [],
      source: 'jsconfig',
    });
  });
});

describe('suggestLanguage', () => {
  it.each([
    {
      input: { isTypeScript: true, strict: false, checkJs: false },
      language: 'typescript',
      behavior: 'suggests typescript when strict is not enabled',
    },
    {
      input: { isTypeScript: true, strict: true, checkJs: true },
      language: 'typescript-strict',
      behavior: 'keeps TypeScript when checkJs is on with a TypeScript project',
    },
    {
      input: { isTypeScript: false, strict: false, checkJs: false },
      language: 'javascript',
      behavior: 'suggests javascript without checkJs',
    },
    {
      input: { isTypeScript: false, strict: false, checkJs: true },
      language: 'javascript-jsdoc',
      behavior: 'suggests javascript-jsdoc when checkJs is on',
    },
  ] as const)('$behavior', ({ input, language }) => {
    expect(suggestLanguage(input)).toBe(language);
  });
});
