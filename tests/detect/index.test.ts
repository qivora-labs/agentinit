import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProject, type DetectionResult } from '../../src/detect/index.js';
import { AgentInitError, UnsupportedProjectError } from '../../src/errors.js';
import { ERROR } from '../../src/exit-codes.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';

const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

const TSCONFIG = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';

const directories: string[] = [];
let registry: Registry | undefined;

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function detectionRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

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

async function writeProject(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await tempDir();
  for (const [relativePath, contents] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return root;
}

function packageJson(fields: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(fields, null, 2)}\n`;
}

function typescriptProject(extra: Readonly<Record<string, unknown>> = {}): string {
  return packageJson({
    name: 'app',
    devDependencies: { typescript: '5.9.0' },
    ...extra,
  });
}

function thrown(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected detectProject to throw');
}

function asExisting(result: DetectionResult): Extract<DetectionResult, { mode: 'existing' }> {
  expect(result.mode).toBe('existing');
  if (result.mode !== 'existing') throw new Error('expected existing');
  return result;
}

describe('detectProject', () => {
  it('treats README.md and .git as greenfield', async () => {
    const root = await copyFixture('empty');
    await mkdir(path.join(root, '.git'));
    await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');

    const result = detectProject(root, await detectionRegistry());

    expect(result).toEqual({
      mode: 'greenfield',
      gitRoot: root,
      existingAgentFiles: [],
    });
  });

  it('treats a directory with no entries as greenfield', async () => {
    const root = await tempDir();

    expect(detectProject(root, await detectionRegistry())).toEqual({
      mode: 'greenfield',
      gitRoot: null,
      existingAgentFiles: [],
    });
  });

  it('treats the other ignorable names, including .agentinit/, as greenfield', async () => {
    const root = await writeProject({
      'README.md': '# readme\n',
      LICENSE: 'MIT\n',
      '.gitignore': 'node_modules\n',
      '.editorconfig': 'root = true\n',
      '.agentinit/manifest.json': '{}\n',
    });
    await mkdir(path.join(root, '.git'));

    expect(detectProject(root, await detectionRegistry()).mode).toBe('greenfield');
  });

  it('rejects a folder of other files when package.json is missing', async () => {
    const root = await writeProject({ 'notes.txt': 'hello\n' });
    const loaded = await detectionRegistry();
    const error = thrown(() => {
      detectProject(root, loaded);
    });

    expect(error).toBeInstanceOf(AgentInitError);
    expect(error).not.toBeInstanceOf(UnsupportedProjectError);
    if (!(error instanceof AgentInitError)) return;
    expect(error.message).toBe(
      'No package.json found. Run inside a TypeScript project or an empty folder.',
    );
    expect(error.exitCode).toBe(ERROR);
  });

  it('rejects a file named .agentinit', async () => {
    const root = await writeProject({ '.agentinit': 'not a directory\n' });
    const loaded = await detectionRegistry();

    expect(() => {
      detectProject(root, loaded);
    }).toThrow(AgentInitError);
  });

  it('rejects a pnpm monorepo root and accepts its package', async () => {
    const root = await copyFixture('pnpm-monorepo');
    await mkdir(path.join(root, '.git'));
    const loaded = await detectionRegistry();
    const error = thrown(() => {
      detectProject(root, loaded);
    });

    expect(error).toBeInstanceOf(AgentInitError);
    expect(error).not.toBeInstanceOf(UnsupportedProjectError);
    if (!(error instanceof AgentInitError)) return;
    expect(error.message).toBe(
      'This directory is a monorepo root (pnpm). Run inside a single package.',
    );
    expect(error.exitCode).toBe(ERROR);

    const packageRoot = path.join(root, 'packages', 'web');
    const result = asExisting(detectProject(packageRoot, loaded));
    expect(result.draft.isMonorepo).toBe(false);
    expect(result.draft.frameworks).toEqual([]);
    expect(result.draft.packageManager).toBe('npm');
    expect(result.belowGitRoot).toBe(true);
    expect(result.gitRoot).toBe(root);
  });

  it('rejects a JavaScript-only project', async () => {
    const root = await copyFixture('js-only');
    const loaded = await detectionRegistry();
    const error = thrown(() => {
      detectProject(root, loaded);
    });

    expect(error).toBeInstanceOf(UnsupportedProjectError);
    if (!(error instanceof UnsupportedProjectError)) return;
    expect(error.message).toBe("JavaScript projects aren't supported yet");
    expect(error.exitCode).toBe(ERROR);
  });

  it('detects a Next.js App Router project under src/', async () => {
    const root = await copyFixture('next15-src');
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.name).toBe('next15-src');
    expect(result.draft.frameworks).toEqual(['nextjs-app-router']);
    expect(result.draft.libraries).toEqual([]);
    expect(result.draft.srcDir).toBe('src');
    expect(result.draft.folders).toEqual(['app']);
    expect(result.draft.language).toBe('typescript-strict');
    expect(result.draft.packageManager).toBe('pnpm');
    expect(result.draft.scripts).toEqual({
      build: 'next build',
      dev: 'next dev',
      lint: 'eslint .',
    });
    expect(result.draft.packages).toEqual({
      next: '16.3.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
      typescript: '5.9.0',
    });
    expect(result.draft.architecture).toEqual({ id: 'flat', confidence: 0.875 });
    expect(result.draft.root).toBe(root);
    expect(result.draft.mode).toBe('existing');
    expect(result.draft.isMonorepo).toBe(false);
    expect(result.draft.suggestedAgents).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.belowGitRoot).toBe(false);
    expect(result.gitRoot).toBeNull();
  });

  it('selects both Next.js fragments when app and pages exist', async () => {
    const root = await copyFixture('next-app-and-pages');
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual(['nextjs-app-router', 'nextjs-pages-router']);
    expect(result.draft.srcDir).toBe('');
  });

  it('skips Tailwind v3 with an unsupported-version notice', async () => {
    const root = await copyFixture('tailwind-v3');
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.libraries).not.toContain('tailwind');
    expect(result.draft.frameworks).toEqual([]);
    expect(result.notices).toEqual([
      {
        kind: 'unsupported-version',
        package: 'tailwindcss',
        version: '3.4.17',
        fragmentId: 'tailwind',
      },
    ]);
  });

  it('accepts a TypeScript CLI with no framework', async () => {
    const root = await copyFixture('node-cli-ts');
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual([]);
    expect(result.draft.libraries).toEqual([]);
    expect(result.draft.mode).toBe('existing');
    expect(result.notices).toEqual([]);
  });

  it('keeps only the Pages Router fragment when app/ is absent', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: '16.3.0' },
        devDependencies: { typescript: '5.9.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'pages/index.ts': 'export {};\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual(['nextjs-pages-router']);
  });

  it('drops both Next.js fragments when neither router directory exists', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: '16.3.0' },
        devDependencies: { typescript: '5.9.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'src/index.ts': 'export {};\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual([]);
    expect(result.notices).toEqual([]);
  });

  it('selects the Next.js 15 App Router fragment for next 15.x', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: '15.0.0' },
        devDependencies: { typescript: '5.9.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'src/app/page.ts': 'export {};\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual(['nextjs-app-router-15']);
    expect(result.notices).toEqual([]);
  });

  it('emits one unsupported-version notice when next is below every framework range', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: '12.3.4' },
        devDependencies: { typescript: '5.9.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'src/app/page.ts': 'export {};\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual([]);
    expect(result.notices).toEqual([
      {
        kind: 'unsupported-version',
        package: 'next',
        version: '12.3.4',
        fragmentId: 'nextjs-app-router',
      },
    ]);
  });

  it('drops a compatibleWith library when no framework was selected', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: '12.3.4' },
        devDependencies: { typescript: '5.9.0', tailwindcss: '4.1.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'src/app/page.ts': 'export {};\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual([]);
    expect(result.draft.libraries).not.toContain('tailwind');
    expect(result.notices).toContainEqual({
      kind: 'incompatible',
      fragmentId: 'tailwind',
      cause: 'no-framework',
    });
    expect(
      result.notices.filter(
        (notice) => notice.kind === 'incompatible' && notice.cause === 'different-framework',
      ),
    ).toEqual([]);
  });

  it('selects Express 4 for express 4.x', async () => {
    const root = await copyFixture('express4-ts');
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual(['express-4']);
    expect(result.notices).toEqual([]);
  });

  it('selects Next 15 App Router and Tailwind on the next15-app fixture', async () => {
    const root = await copyFixture('next15-app');
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual(['nextjs-app-router-15']);
    expect(result.draft.libraries).toEqual(['tailwind']);
    expect(result.notices).toEqual(
      expect.arrayContaining([
        {
          kind: 'unsupported-version',
          package: 'zustand',
          version: '4.5.5',
          fragmentId: 'zustand',
        },
        {
          kind: 'unsupported-version',
          package: 'vitest',
          version: '2.1.9',
          fragmentId: 'vitest',
        },
      ]),
    );
  });

  it('suggests a fragment from a registry marker file when a compatible framework is present', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: '16.3.0' },
        devDependencies: { typescript: '5.9.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'src/app/page.ts': 'export {};\n',
      'components.json': '{}\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.frameworks).toEqual(['nextjs-app-router']);
    expect(result.draft.libraries).toContain('shadcn');
  });

  it('drops a marker-file library when no compatible framework is selected', async () => {
    const root = await writeProject({
      'package.json': typescriptProject(),
      'tsconfig.json': TSCONFIG,
      'components.json': '{}\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.libraries).not.toContain('shadcn');
    expect(result.notices).toContainEqual({
      kind: 'incompatible',
      fragmentId: 'shadcn',
      cause: 'no-framework',
    });
  });

  it('passes an unknown version to suggestion and omits it from the draft', async () => {
    const root = await writeProject({
      'package.json': packageJson({
        dependencies: { next: 'workspace:*' },
        devDependencies: { typescript: '5.9.0' },
      }),
      'tsconfig.json': TSCONFIG,
      'app/page.ts': 'export {};\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.packages).toEqual({ typescript: '5.9.0' });
    // App Router siblings are omitted when next's version is unknown; Pages is
    // filtered out by the app/ layout, so no framework is preselected.
    expect(result.draft.frameworks).toEqual([]);
    expect(result.notices).toEqual([
      {
        kind: 'unknown-version',
        package: 'next',
        fragmentId: 'nextjs-app-router',
        included: false,
      },
      {
        kind: 'unknown-version',
        package: 'next',
        fragmentId: 'nextjs-pages-router',
        included: true,
      },
    ]);
  });

  it('reports legacy agent files and preselects those agents', async () => {
    const root = await writeProject({
      'package.json': typescriptProject(),
      'tsconfig.json': TSCONFIG,
      '.cursorrules': '# cursor\n',
      '.windsurfrules': '# windsurf\n',
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.existingAgentFiles).toEqual(['.cursorrules', '.windsurfrules']);
    expect(result.draft.suggestedAgents).toEqual(['cursor', 'windsurf']);
    expect(result.warnings).toEqual([
      { kind: 'legacy-agent-file', path: '.cursorrules' },
      { kind: 'legacy-agent-file', path: '.windsurfrules' },
    ]);
  });

  it('warns when a tsconfig extends target cannot be resolved', async () => {
    const root = await writeProject({
      'package.json': typescriptProject(),
      'tsconfig.json': `{
        "extends": "./tsconfig.missing.json",
        "compilerOptions": { "strict": true }
      }`,
    });
    const result = asExisting(detectProject(root, await detectionRegistry()));

    expect(result.draft.language).toBe('typescript-strict');
    expect(result.warnings).toEqual([
      {
        kind: 'unresolved-tsconfig-extends',
        message:
          'Could not resolve tsconfig extends "./tsconfig.missing.json". Using options from tsconfig.json.',
      },
    ]);
  });

  it('flags a project that sits below the git root and stays quiet at the root', async () => {
    const repo = await tempDir();
    await mkdir(path.join(repo, '.git'));
    const nested = path.join(repo, 'pkg');
    await mkdir(nested);
    await writeFile(path.join(nested, 'package.json'), typescriptProject());
    await writeFile(path.join(nested, 'tsconfig.json'), TSCONFIG);
    const loaded = await detectionRegistry();

    const below = asExisting(detectProject(nested, loaded));
    expect(below.belowGitRoot).toBe(true);
    expect(below.gitRoot).toBe(repo);

    await writeFile(path.join(repo, 'package.json'), typescriptProject());
    await writeFile(path.join(repo, 'tsconfig.json'), TSCONFIG);
    const atRoot = asExisting(detectProject(repo, loaded));
    expect(atRoot.belowGitRoot).toBe(false);
    expect(atRoot.gitRoot).toBe(repo);
  });
});
