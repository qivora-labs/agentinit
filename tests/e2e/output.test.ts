import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runCli } from '../helpers/run.js';
import { createTempProject, listFiles, treeText } from './project.js';

const temp = createTempProject('agentinit-output-');

afterEach(() => temp.cleanup());

const SNAPSHOT_FIXTURES = ['next15-src', 'vite-react', 'express-ts'] as const;

describe('output', () => {
  it('Every generated Cursor, Claude, Windsurf, and Copilot file matches its format in §5.4 and the scope mapping in §5.3', async () => {
    for (const name of SNAPSHOT_FIXTURES) {
      const dir = await temp.copyFixture(name);
      const result = await runCli(['init', '--yes', '--cwd', dir]);
      expect(result.code, name).toBe(0);
      expect(result.stderr, name).not.toContain('This is a bug');
      await assertAgentFormats(dir);
      const tree = await treeText(dir);
      await expect(tree).toMatchFileSnapshot(`../__snapshots__/e2e/${name}.txt`);
    }
  });

  it('Globs resolve correctly for src/ and root layouts and always use forward slashes', async () => {
    const src = await initFixture('next15-src');
    const srcRule = await readFile(path.join(src, '.cursor/rules/agentinit-nextjs-app-router.mdc'), 'utf8');
    expect(srcRule).toContain('globs: src/app/**/*.ts,src/app/**/*.tsx');
    await assertNoBackslashes(src);

    const root = await initFixture('next-app-no-src');
    const rootRule = await readFile(path.join(root, '.cursor/rules/agentinit-nextjs-app-router.mdc'), 'utf8');
    expect(rootRule).toContain('globs: app/**/*.ts,app/**/*.tsx');
    expect(rootRule).not.toContain('src/app/');
    await assertNoBackslashes(root);
  });

  it('AGENTS.md lists only scripts that exist, using the detected package manager', async () => {
    const next = await readFile(path.join(await initFixture('next15-src'), 'AGENTS.md'), 'utf8');
    expect(next).toContain('- `pnpm build`');
    expect(next).toContain('- `pnpm dev`');
    expect(next).toContain('- `pnpm lint`');
    expect(next).not.toContain('pnpm start');
    expect(next).not.toContain('pnpm test');
    expect(next).not.toContain('pnpm typecheck');
    expect(next).not.toContain('npm run');

    const express = await readFile(path.join(await initFixture('express-ts'), 'AGENTS.md'), 'utf8');
    expect(express).toContain('- `npm run build`');
    expect(express).toContain('- `npm run dev`');
    expect(express).toContain('- `npm run lint`');
    expect(express).not.toContain('npm run start');
    expect(express).not.toContain('npm run test');
    expect(express).not.toContain('pnpm ');
  });
});

async function initFixture(name: string): Promise<string> {
  const dir = await temp.copyFixture(name);
  const result = await runCli(['init', '--yes', '--cwd', dir]);
  expect(result.code, name).toBe(0);
  return dir;
}

async function assertNoBackslashes(root: string): Promise<void> {
  for (const file of await generatedFiles(root)) {
    const text = await readFile(path.join(root, file), 'utf8');
    expect(text, file).not.toContain('\\');
  }
}

async function assertAgentFormats(root: string): Promise<void> {
  const files = await generatedFiles(root);
  expect(files).toContain('CLAUDE.md');
  expect(files).toContain('.github/copilot-instructions.md');
  const claude = await readFile(path.join(root, 'CLAUDE.md'), 'utf8');
  expect(claude).toContain('@AGENTS.md');
  const copilot = await readFile(path.join(root, '.github/copilot-instructions.md'), 'utf8');
  expect(copilot).toContain('AGENTS.md');

  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8');
    expect(text, file).not.toContain('\\');
    if (file.startsWith('.cursor/rules/') && file.endsWith('.mdc')) assertCursorRule(file, text);
    else if (file.startsWith('.claude/rules/')) assertClaudeRule(file, text);
    else if (file.startsWith('.claude/skills/') && file.endsWith('/SKILL.md')) assertSkill(file, text);
    else if (file.startsWith('.windsurf/rules/')) assertWindsurfRule(file, text);
    else if (file.startsWith('.windsurf/workflows/')) assertDescriptionFrontmatter(file, text);
    else if (file.startsWith('.github/instructions/') && file.endsWith('.instructions.md')) {
      assertCopilotInstruction(file, text);
    } else if (file.startsWith('.github/prompts/') && file.endsWith('.prompt.md')) {
      assertDescriptionFrontmatter(file, text);
    }
  }
}

function assertCursorRule(file: string, text: string): void {
  const frontmatter = requireFrontmatter(file, text);
  expect(frontmatter.alwaysApply, file).toBe(false);
  if ('globs' in frontmatter) {
    expect(typeof frontmatter.globs, file).toBe('string');
    expect(frontmatter.globs, file).not.toContain('\\');
    expect(typeof frontmatter.description, file).toBe('string');
    return;
  }
  if ('description' in frontmatter) {
    expect(typeof frontmatter.description, file).toBe('string');
  }
}

function assertClaudeRule(file: string, text: string): void {
  const frontmatter = requireFrontmatter(file, text);
  expect(Array.isArray(frontmatter.paths), file).toBe(true);
  const paths = frontmatter.paths as unknown[];
  expect(paths.length, file).toBeGreaterThan(0);
  for (const pattern of paths) {
    expect(typeof pattern, file).toBe('string');
    expect(pattern, file).not.toContain('\\');
  }
}

function assertSkill(file: string, text: string): void {
  const frontmatter = requireFrontmatter(file, text);
  expect(typeof frontmatter.name, file).toBe('string');
  expect(typeof frontmatter.description, file).toBe('string');
  expect(frontmatter['disable-model-invocation'], file).toBe(true);
}

function assertWindsurfRule(file: string, text: string): void {
  const frontmatter = requireFrontmatter(file, text);
  expect(['glob', 'model_decision', 'manual'], file).toContain(frontmatter.trigger);
  if (frontmatter.trigger === 'glob') {
    expect(typeof frontmatter.globs, file).toBe('string');
    expect(frontmatter.globs, file).not.toContain('\\');
  }
  if (frontmatter.trigger === 'model_decision') {
    expect(typeof frontmatter.description, file).toBe('string');
  }
}

function assertCopilotInstruction(file: string, text: string): void {
  const frontmatter = requireFrontmatter(file, text);
  expect(typeof frontmatter.description, file).toBe('string');
  if ('applyTo' in frontmatter) {
    expect(typeof frontmatter.applyTo, file).toBe('string');
    expect(frontmatter.applyTo, file).not.toContain('\\');
  }
}

function assertDescriptionFrontmatter(file: string, text: string): void {
  const frontmatter = requireFrontmatter(file, text);
  expect(typeof frontmatter.description, file).toBe('string');
}

function requireFrontmatter(file: string, text: string): Record<string, unknown> {
  expect(text.startsWith('---\n'), file).toBe(true);
  const end = text.indexOf('\n---\n', 4);
  expect(end, file).toBeGreaterThan(3);
  const parsed: unknown = parse(text.slice(4, end));
  expect(parsed, file).toBeTypeOf('object');
  if (parsed === null || typeof parsed !== 'object') throw new Error(`${file}: frontmatter is not a record`);
  return parsed as Record<string, unknown>;
}

async function generatedFiles(root: string): Promise<string[]> {
  const files = await listFiles(root);
  return files.filter((file) => {
    if (file === 'AGENTS.md' || file === 'ARCHITECTURE.md' || file === 'CLAUDE.md') return true;
    return (
      file.startsWith('.cursor/') ||
      file.startsWith('.claude/') ||
      file.startsWith('.windsurf/') ||
      file.startsWith('.github/')
    );
  });
}
