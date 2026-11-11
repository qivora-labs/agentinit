import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/run.js';
import { createTempProject, listFiles } from './project.js';

/**
 * One agent loads shared files plus its own tree. The same scoped rule is
 * written once per agent (PRD §5.2), so the check is per agent. Pointers,
 * import lines, and headings are not rule text. A paragraph shorter than 40
 * characters is a label, not a rule.
 */
const MIN_PARAGRAPH = 40;

const FIXTURES = [
  'next15-src',
  'next-app-no-src',
  'next-app-and-pages',
  'vite-react',
  'express-ts',
  'fastify-ts',
  'node-cli-ts',
  'js-only',
  'empty',
  'pnpm-monorepo',
  'existing-claude-md',
  'existing-agents-md',
  'existing-workflow-file',
  'edited-managed-block',
  'jsonc-tsconfig-extends',
  'tailwind-v3',
  'shadcn-components-json',
  'crlf-line-endings',
] as const;

const AGENTS = ['cursor', 'claude', 'windsurf', 'copilot'] as const;

type Agent = (typeof AGENTS)[number];

const temp = createTempProject('agentinit-dup-');

afterEach(() => temp.cleanup());

describe('output', () => {
  it('No rule text appears in more than one generated file (excluding pointers and imports)', async () => {
    const failures: string[] = [];
    for (const name of FIXTURES) {
      const found = await duplicatesFor(name);
      failures.push(...found);
    }
    expect(failures).toEqual([]);
  });
});

async function duplicatesFor(name: string): Promise<string[]> {
  const dir = await temp.copyFixture(name);
  const before = await listFiles(dir);
  const result = await runCli(['init', '--yes', '--cwd', dir]);
  if (result.code !== 0) {
    expect(await listFiles(dir), name).toEqual(before);
    return [];
  }

  const texts = new Map<string, string>();
  for (const file of await listFiles(dir)) {
    if (ownerOf(file) === null) continue;
    texts.set(file, await readFile(path.join(dir, file), 'utf8'));
  }

  const failures: string[] = [];
  for (const agent of AGENTS) {
    const seen = new Map<string, string>();
    for (const [file, text] of texts) {
      const owner = ownerOf(file);
      if (owner !== 'shared' && owner !== agent) continue;
      for (const paragraph of paragraphs(text)) {
        const previous = seen.get(paragraph);
        if (previous === undefined) {
          seen.set(paragraph, file);
          continue;
        }
        if (previous === file) continue;
        failures.push(`${name} (${agent}): "${snippet(paragraph)}" is in ${previous} and ${file}`);
      }
    }
  }
  return failures;
}

function ownerOf(file: string): Agent | 'shared' | null {
  if (file === 'AGENTS.md' || file === 'ARCHITECTURE.md') return 'shared';
  if (file === 'CLAUDE.md' || file.startsWith('.claude/')) return 'claude';
  if (file.startsWith('.cursor/')) return 'cursor';
  if (file.startsWith('.windsurf/')) return 'windsurf';
  if (file.startsWith('.github/')) return 'copilot';
  return null;
}

function paragraphs(text: string): string[] {
  let body = text.replaceAll('\r\n', '\n');
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4);
    if (end !== -1) body = body.slice(end + '\n---\n'.length);
  }
  const lines = body.split('\n').filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    if (/^#{1,6}\s/u.test(trimmed)) return false;
    if (/^<!-- agentinit:(?:begin|end)\b/u.test(trimmed)) return false;
    if (/^@\S/u.test(trimmed)) return false;
    if (/^import\s/u.test(trimmed)) return false;
    return true;
  });
  return lines
    .join('\n')
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= MIN_PARAGRAPH);
}

function snippet(paragraph: string): string {
  const oneLine = paragraph.replaceAll(/\s+/gu, ' ');
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}
