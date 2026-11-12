import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NO_FRAMEWORK_NOTICE } from '../../src/ui/format.js';
import { runCli } from '../helpers/run.js';
import { createTempProject, listFiles } from './project.js';

const temp = createTempProject('agentinit-detect-');

afterEach(() => temp.cleanup());

describe('detection', () => {
  it('A JavaScript-only project exits 1 and writes nothing, with or without --yes', async () => {
    const yesDir = await temp.copyFixture('js-only');
    const beforeYes = await listFiles(yesDir);
    const yes = await runCli(['init', '--yes', '--cwd', yesDir]);
    expect(yes.code).toBe(1);
    expect(yes.stderr).toContain("JavaScript projects aren't supported yet");
    expect(await listFiles(yesDir)).toEqual(beforeYes);

    const dir = await temp.copyFixture('js-only');
    const before = await listFiles(dir);
    const result = await runCli(['init', '--cwd', dir], { stdinTTY: true, stdoutTTY: true });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("JavaScript projects aren't supported yet");
    expect(result.stderr.split("JavaScript projects aren't supported yet")).toHaveLength(2);
    expect(result.stdout).toContain('rules for the agents in this repo');
    expect(result.stdout).not.toContain("JavaScript projects aren't supported yet");
    expect(await listFiles(dir)).toEqual(before);
  });

  it('A monorepo root exits 1 with instructions; running inside a workspace package works', async () => {
    const root = await temp.copyFixture('pnpm-monorepo');
    const before = await listFiles(root);
    const rejected = await runCli(['init', '--yes', '--cwd', root]);
    expect(rejected.code).toBe(1);
    expect(rejected.stderr).toContain('This directory is a monorepo root (pnpm). Run inside a single package.');
    expect(await listFiles(root)).toEqual(before);

    const interactive = await runCli(['init', '--cwd', root], { stdinTTY: true, stdoutTTY: true });
    expect(interactive.code).toBe(1);
    expect(interactive.stderr).toContain('Run inside a single package.');
    expect(await listFiles(root)).toEqual(before);

    const pkg = path.join(root, 'packages/web');
    const result = await runCli(['init', '--yes', '--cwd', pkg]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('This is a bug');
    expect(await listFiles(pkg)).toContain('AGENTS.md');
  });

  it('Versions are resolved from node_modules first; a workspace:* or catalog: specifier never crashes detection', async () => {
    const root = await temp.copyFixture('pnpm-monorepo');
    const pkg = path.join(root, 'packages/api');
    const result = await runCli(['init', '--yes', '--cwd', pkg]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('This is a bug');
    expect(result.stderr).not.toContain('next version is unknown');
    const manifest = JSON.parse(await readFile(path.join(pkg, '.agentinit/manifest.json'), 'utf8')) as {
      selections: { frameworks: string[] };
    };
    expect(manifest.selections.frameworks).toContain('nextjs-app-router');
  });

  it('Inside a workspace package, init selects the installed Next version and doctor stays clean', async () => {
    const root = await temp.copyFixture('pnpm-monorepo');
    await mkdir(path.join(root, '.git'));
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'pnpm-monorepo',
        private: true,
        packageManager: 'pnpm@10.14.0',
      }),
    );
    await writeFile(
      path.join(root, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        'importers:',
        '  packages/web:',
        '    dependencies:',
        '      next:',
        '        specifier: ^16.0.0',
        '        version: 16.4.0(react@19.0.0)',
        '    devDependencies:',
        '      typescript:',
        '        specifier: 5.9.0',
        '        version: 5.9.0',
        '',
      ].join('\n'),
    );
    const pkg = path.join(root, 'packages/web');
    await writeFile(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: 'web',
        scripts: { test: 'vitest run' },
        dependencies: { next: '^16.0.0' },
        devDependencies: { typescript: '5.9.0' },
      }),
    );
    await mkdir(path.join(pkg, 'src', 'app'), { recursive: true });
    await writeFile(path.join(pkg, 'src', 'app', 'page.ts'), 'export default function Page() {}\n');
    const store = path.join(root, 'node_modules', '.pnpm', 'next@16.4.0', 'node_modules', 'next');
    await mkdir(store, { recursive: true });
    await writeFile(path.join(store, 'package.json'), JSON.stringify({ name: 'next', version: '16.4.0' }));
    await mkdir(path.join(pkg, 'node_modules'), { recursive: true });
    await symlink(store, path.join(pkg, 'node_modules', 'next'), 'dir');

    const init = await runCli(['init', '--yes', '--cwd', pkg]);
    expect(init.code).toBe(0);
    const manifest = JSON.parse(await readFile(path.join(pkg, '.agentinit/manifest.json'), 'utf8')) as {
      selections: { frameworks: string[] };
    };
    expect(manifest.selections.frameworks).toContain('nextjs-app-router');
    expect(manifest.selections.frameworks).not.toContain('nextjs-app-router-15');

    const agents = await readFile(path.join(pkg, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('pnpm test');
    expect(agents).not.toContain('npm run test');

    // Default agents include Claude, so Cursor defers to `.claude/skills/` (PRD §5.2).
    const workflow = await readFile(path.join(pkg, '.claude/skills/new-feature/SKILL.md'), 'utf8');
    expect(workflow).toContain('pnpm test');
    expect(workflow).not.toContain('npm run test');

    const doctor = await runCli(['doctor', '--cwd', pkg]);
    expect(doctor.code).toBe(0);
    expect(doctor.stdout).toContain('No issues found.');
  });

  it('A tsconfig.json with comments, trailing commas, and extends is parsed correctly', async () => {
    const dir = await temp.copyFixture('jsonc-tsconfig-extends');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('Invalid tsconfig.json');
    const agents = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('## TypeScript Strict');
  });

  it('A project with both app/ and pages/ gets both Next.js fragments', async () => {
    const dir = await temp.copyFixture('next-app-and-pages');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    const manifest = JSON.parse(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')) as {
      selections: { frameworks: string[] };
    };
    expect(manifest.selections.frameworks).toEqual(['nextjs-app-router', 'nextjs-pages-router']);
    const files = await listFiles(dir);
    expect(files).toContain('.cursor/rules/agentinit-nextjs-app-router.mdc');
    expect(files).toContain('.cursor/rules/agentinit-nextjs-pages-router.mdc');
  });

  it('A TypeScript project with no supported framework (e.g., a CLI) gets base rules and a notice, and exits 0 with --yes', async () => {
    const dir = await temp.copyFixture('node-cli-ts');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(NO_FRAMEWORK_NOTICE);
    const manifest = JSON.parse(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')) as {
      selections: { frameworks: string[]; language: string };
    };
    expect(manifest.selections.frameworks).toEqual([]);
    expect(manifest.selections.language).toBe('typescript-strict');
    expect(await listFiles(dir)).toContain('AGENTS.md');
  });

  it('An unsupported version (e.g., Tailwind v3) is skipped with a notice', async () => {
    const dir = await temp.copyFixture('tailwind-v3');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('tailwindcss@3.4.17 detected — no matching rules yet.');
    const files = await listFiles(dir);
    expect(files.some((file) => file.includes('tailwind'))).toBe(false);
  });

  it('Next.js 15 App Router gets framework and Tailwind rules; manifest selections match fragments', async () => {
    const dir = await temp.copyFixture('next15-app');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('targets a different framework');
    const files = await listFiles(dir);
    expect(files).toContain('.cursor/rules/agentinit-nextjs-app-router-15.mdc');
    expect(files).toContain('.cursor/rules/agentinit-tailwind.mdc');
    const manifest = JSON.parse(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')) as {
      selections: { frameworks: string[]; libraries: string[] };
      fragments: Record<string, string>;
    };
    expect(manifest.selections.frameworks).toEqual(['nextjs-app-router-15']);
    expect(manifest.selections.libraries).toEqual(['tailwind']);
    expect(Object.keys(manifest.fragments)).toEqual(
      expect.arrayContaining(['nextjs-app-router-15', 'tailwind']),
    );
    expect(manifest.selections.libraries.every((id) => id in manifest.fragments)).toBe(true);
    expect(manifest.selections.frameworks.every((id) => id in manifest.fragments)).toBe(true);

    const again = await runCli(['init', '--yes', '--cwd', dir]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Already up to date.');
  });

  it('Express 4 gets Express 4 rules', async () => {
    const dir = await temp.copyFixture('express4-ts');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    const files = await listFiles(dir);
    expect(files).toContain('.cursor/rules/agentinit-express-4.mdc');
    const manifest = JSON.parse(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')) as {
      selections: { frameworks: string[] };
    };
    expect(manifest.selections.frameworks).toEqual(['express-4']);
  });

  it('An unsupported Next.js version gets one clear notice and no different-framework library skip', async () => {
    const dir = await temp.copyFixture('next15-app');
    const pkgPath = path.join(dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    pkg.dependencies.next = '12.3.4';
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    const lockPath = path.join(dir, 'package-lock.json');
    const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
      packages: Record<string, { version: string }>;
    };
    const nextPkg = lock.packages['node_modules/next'];
    if (nextPkg !== undefined) nextPkg.version = '12.3.4';
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stderr.match(/next@12\.3\.4 detected — no matching rules yet\./g)).toEqual([
      'next@12.3.4 detected — no matching rules yet.',
    ]);
    expect(result.stderr).toContain(
      'Tailwind CSS needs a supported framework (Next.js, React + Vite); none was selected.',
    );
    expect(result.stderr).not.toContain('targets a different framework');
    const files = await listFiles(dir);
    expect(files.some((file) => file.includes('nextjs'))).toBe(false);
    expect(files.some((file) => file.includes('tailwind'))).toBe(false);
  });
});
