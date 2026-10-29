import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findExistingAgentFiles,
  findLegacyFiles,
  preselectAgents,
} from '../../src/detect/existing-agents.js';
import type { AgentTarget } from '../../src/types.js';

const directories: string[] = [];

const ALL_AGENT_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude',
  '.cursor',
  '.cursorrules',
  '.windsurfrules',
  '.windsurf',
  '.devin',
  '.github/copilot-instructions.md',
  '.github/instructions',
] as const;

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-detect-'));
  directories.push(dir);
  return dir;
}

async function place(root: string, relativePath: string, kind: 'file' | 'directory'): Promise<void> {
  const target = path.join(root, relativePath);
  if (kind === 'directory') {
    await mkdir(target, { recursive: true });
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, '');
}

describe('findExistingAgentFiles', () => {
  it('returns existing agent paths in scan order', async () => {
    const root = await tempDir();
    await place(root, 'AGENTS.md', 'file');
    await place(root, 'CLAUDE.md', 'file');
    await place(root, '.claude', 'directory');
    await place(root, '.cursor', 'directory');
    await place(root, '.cursorrules', 'file');
    await place(root, '.windsurfrules', 'file');
    await place(root, '.windsurf', 'directory');
    await place(root, '.devin', 'directory');
    await place(root, '.github/copilot-instructions.md', 'file');
    await place(root, '.github/instructions', 'directory');

    expect(findExistingAgentFiles(root)).toEqual([...ALL_AGENT_PATHS]);
  });

  it('omits paths that are missing or the wrong kind', async () => {
    const root = await tempDir();
    await place(root, 'CLAUDE.md', 'file');
    await place(root, '.cursor', 'file');
    await place(root, '.claude', 'directory');

    expect(findExistingAgentFiles(root)).toEqual(['CLAUDE.md', '.claude']);
  });

  it('returns an empty list when no agent files exist', async () => {
    const root = await tempDir();
    await place(root, 'README.md', 'file');

    expect(findExistingAgentFiles(root)).toEqual([]);
  });
});

describe('preselectAgents', () => {
  it.each([
    { behavior: 'preselects cursor from .cursor', files: ['.cursor'], agents: ['cursor'] },
    { behavior: 'preselects cursor from .cursorrules', files: ['.cursorrules'], agents: ['cursor'] },
    { behavior: 'preselects claude from CLAUDE.md', files: ['CLAUDE.md'], agents: ['claude'] },
    { behavior: 'preselects claude from .claude', files: ['.claude'], agents: ['claude'] },
    { behavior: 'preselects windsurf from .windsurf', files: ['.windsurf'], agents: ['windsurf'] },
    {
      behavior: 'preselects windsurf from .windsurfrules',
      files: ['.windsurfrules'],
      agents: ['windsurf'],
    },
    { behavior: 'preselects windsurf from .devin', files: ['.devin'], agents: ['windsurf'] },
    {
      behavior: 'preselects copilot from copilot-instructions.md',
      files: ['.github/copilot-instructions.md'],
      agents: ['copilot'],
    },
    {
      behavior: 'preselects copilot from .github/instructions',
      files: ['.github/instructions'],
      agents: ['copilot'],
    },
    { behavior: 'returns an empty list when no agent file exists', files: [], agents: [] },
    { behavior: 'does not preselect an agent from AGENTS.md alone', files: ['AGENTS.md'], agents: [] },
  ] as const)('$behavior', ({ files, agents }: { files: readonly string[]; agents: readonly AgentTarget[] }) => {
    expect(preselectAgents(files)).toEqual([...agents]);
  });

  it('preselects each matching agent once, in cursor, claude, windsurf, copilot order', () => {
    expect(
      preselectAgents([
        'AGENTS.md',
        '.github/instructions',
        '.cursorrules',
        '.cursor/',
        'CLAUDE.md',
        '.devin',
        '.windsurfrules',
      ]),
    ).toEqual(['cursor', 'claude', 'windsurf', 'copilot']);
  });

  it('accepts a trailing slash on directory markers', () => {
    expect(preselectAgents(['.claude/', '.windsurf/'])).toEqual(['claude', 'windsurf']);
  });
});

describe('findLegacyFiles', () => {
  it('returns .cursorrules and .windsurfrules when they are files', async () => {
    const root = await tempDir();
    await place(root, '.windsurfrules', 'file');
    await place(root, '.cursorrules', 'file');

    expect(findLegacyFiles(root)).toEqual(['.cursorrules', '.windsurfrules']);
  });

  it('returns only the legacy file that exists', async () => {
    const root = await tempDir();
    await place(root, '.windsurfrules', 'file');

    expect(findLegacyFiles(root)).toEqual(['.windsurfrules']);
  });

  it('ignores a directory named .cursorrules', async () => {
    const root = await tempDir();
    await place(root, '.cursorrules', 'directory');

    expect(findLegacyFiles(root)).toEqual([]);
  });
});
