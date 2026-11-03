import { readFile } from 'node:fs/promises';
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
});
