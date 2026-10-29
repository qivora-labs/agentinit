import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertTypeScriptProject,
  readTsConfig,
  suggestLanguage,
  type TsConfigSettings,
} from '../../src/detect/typescript.js';
import { readPackageJson, type PackageJson } from '../../src/detect/packages.js';
import { AgentInitError, UnsupportedProjectError } from '../../src/errors.js';
import { ERROR } from '../../src/exit-codes.js';

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

describe('assertTypeScriptProject', () => {
  it('throws UnsupportedProjectError for a JavaScript-only project', async () => {
    const root = await copyFixture('js-only');

    expect(() => {
      assertTypeScriptProject(root, loadPackage(root));
    }).toThrow(UnsupportedProjectError);
    expect(() => {
      assertTypeScriptProject(root, loadPackage(root));
    }).toThrow(
      expect.objectContaining({
        message: "JavaScript projects aren't supported yet",
        exitCode: ERROR,
      }),
    );
  });

  it.each([
    {
      fixture: 'typescript-dev',
      behavior: 'passes when typescript is a devDependency and tsconfig.json is missing',
    },
    {
      fixture: 'typescript-dep',
      behavior: 'passes when typescript is a dependency and tsconfig.json is missing',
    },
    {
      fixture: 'jsonc',
      behavior: 'passes when tsconfig.json exists without a typescript dependency',
    },
  ] as const)('$behavior', async ({ fixture }) => {
    const root = await copyFixture(fixture);
    expect(() => {
      assertTypeScriptProject(root, loadPackage(root));
    }).not.toThrow();
  });
});

describe('readTsConfig', () => {
  it('returns null when typescript is installed and tsconfig.json is missing', async () => {
    const root = await copyFixture('typescript-dev');

    expect(readTsConfig(root)).toBeNull();
    expect(suggestLanguage(null)).toBe('typescript');
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
      paths: {
        '@app/*': ['./src/*'],
        '@lib': ['./lib/index.ts'],
      },
      warnings: [],
    });
    expect(suggestLanguage(readTsConfig(root))).toBe('typescript');
  });

  it('detects strict inherited through a relative extends', async () => {
    const root = await copyFixture('extends-relative');
    const tsconfig = readTsConfig(root);

    expect(tsconfig).toEqual({
      strict: true,
      paths: {
        '@base/*': ['packages/*'],
      },
      warnings: [],
    });
    expect(suggestLanguage(tsconfig)).toBe('typescript-strict');
  });

  it('returns local options and a warning when extends names a missing package', async () => {
    const root = await copyFixture('extends-missing');

    expect(readTsConfig(root)).toEqual({
      strict: false,
      paths: {
        '@app/*': ['./src/*'],
      },
      warnings: [
        'Could not resolve tsconfig extends "@tsconfig/strictest". Using options from tsconfig.json.',
      ],
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
      paths: { '@app/*': ['./src/*'] },
      warnings: [
        'Could not resolve tsconfig extends "./tsconfig.missing.json". Using options from tsconfig.json.',
      ],
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
    expect(() => readTsConfig(root)).not.toThrow(UnsupportedProjectError);
  });
});

describe('suggestLanguage', () => {
  it('suggests typescript when strict is not enabled', () => {
    const tsconfig: TsConfigSettings = { strict: false, paths: {}, warnings: [] };
    expect(suggestLanguage(tsconfig)).toBe('typescript');
  });
});
