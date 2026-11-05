import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { ERROR } from '../../src/exit-codes.js';
import { MANIFEST_PATH, readManifest, serializeManifest, type Manifest } from '../../src/io/manifest.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function sampleManifest(): Manifest {
  return {
    cliVersion: '0.1.0',
    mode: 'existing',
    selections: {
      language: 'typescript-strict',
      frameworks: ['nextjs-app-router'],
      libraries: ['tailwind', 'zustand'],
      architecture: 'feature-based',
      agents: ['cursor', 'claude', 'windsurf', 'copilot'],
    },
    fragments: {
      zustand: '1.0.0',
      'nextjs-app-router': '1.0.0',
    },
    files: {
      'AGENTS.md#core': { sha256: HASH_C },
      '.cursor/rules/agentinit-zustand.mdc': { sha256: HASH_A },
      '.claude/skills/new-feature/SKILL.md': { sha256: HASH_B },
    },
  };
}

const SERIALIZED = `{
  "cliVersion": "0.1.0",
  "mode": "existing",
  "selections": {
    "language": "typescript-strict",
    "frameworks": [
      "nextjs-app-router"
    ],
    "libraries": [
      "tailwind",
      "zustand"
    ],
    "architecture": "feature-based",
    "agents": [
      "cursor",
      "claude",
      "windsurf",
      "copilot"
    ]
  },
  "fragments": {
    "nextjs-app-router": "1.0.0",
    "zustand": "1.0.0"
  },
  "files": {
    ".claude/skills/new-feature/SKILL.md": {
      "sha256": "${HASH_B}"
    },
    ".cursor/rules/agentinit-zustand.mdc": {
      "sha256": "${HASH_A}"
    },
    "AGENTS.md#core": {
      "sha256": "${HASH_C}"
    }
  }
}
`;

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-manifest-'));
  directories.push(dir);
  return dir;
}

async function writeManifest(root: string, contents: string): Promise<void> {
  await mkdir(path.join(root, '.agentinit'), { recursive: true });
  await writeFile(path.join(root, MANIFEST_PATH), contents);
}

describe('serializeManifest', () => {
  it('uses stable key order, 2-space indent, and one trailing newline', () => {
    const first = serializeManifest(sampleManifest());
    const second = serializeManifest(sampleManifest());
    expect(first).toBe(SERIALIZED);
    expect(second).toBe(first);
    expect(first.endsWith('\n')).toBe(true);
    expect(first.endsWith('\n\n')).toBe(false);
  });

  it('keeps selection array order', () => {
    const manifest = sampleManifest();
    manifest.selections.agents = ['copilot', 'cursor'];
    manifest.selections.frameworks = ['express', 'fastify'];
    const serialized = serializeManifest(manifest);
    expect(serialized.indexOf('copilot')).toBeLessThan(serialized.indexOf('cursor'));
    expect(serialized.indexOf('express')).toBeLessThan(serialized.indexOf('fastify'));
  });
});

describe('readManifest', () => {
  it('round-trips serialize then read', async () => {
    const root = await tempDir();
    const manifest = sampleManifest();
    const serialized = serializeManifest(manifest);
    await writeManifest(root, serialized);

    const read = await readManifest(root);
    expect(read).toEqual(manifest);
    if (read === null) return;
    expect(serializeManifest(read)).toBe(serialized);
  });

  it('returns null when the manifest is missing', async () => {
    const root = await tempDir();
    expect(await readManifest(root)).toBeNull();
  });

  it('throws a recoverable error for invalid JSON', async () => {
    const root = await tempDir();
    await writeManifest(root, '{');
    await expect(readManifest(root)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.exitCode).toBe(ERROR);
      expect(error.message).toContain('invalid JSON');
      expect(error.hint).toContain('agentinit init');
      return true;
    });
  });

  it('throws a recoverable error for a schema mismatch', async () => {
    const root = await tempDir();
    await writeManifest(root, `${JSON.stringify({ cliVersion: '0.1.0', extra: true })}\n`);
    await expect(readManifest(root)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain('unknown key');
      expect(error.hint).toContain('agentinit init');
      return true;
    });
  });

  it('rejects a file key that is not a path or path#blockId', async () => {
    const root = await tempDir();
    const manifest = sampleManifest();
    const serialized = serializeManifest(manifest).replace('AGENTS.md#core', 'AGENTS.md#core#again');
    await writeManifest(root, serialized);
    await expect(readManifest(root)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain('at most one #');
      return true;
    });
  });

  it('rejects a block id that contains >', async () => {
    const root = await tempDir();
    const serialized = serializeManifest(sampleManifest()).replace('AGENTS.md#core', 'AGENTS.md#core>');
    await writeManifest(root, serialized);
    await expect(readManifest(root)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain('block id after # is not valid');
      return true;
    });
  });

  it.each([
    'secret-notes.txt',
    'package.json',
    '.git/config',
    '.cursor/rules/../../x.mdc',
    '.cursor/rules/custom.mdc',
    'AGENTS.md',
  ])('rejects non-owned or bare shared key %s', async (key) => {
    const root = await tempDir();
    const manifest = sampleManifest();
    const serialized = serializeManifest(manifest).replace(
      '"AGENTS.md#core"',
      JSON.stringify(key),
    );
    await writeManifest(root, serialized);
    await expect(readManifest(root)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain(key);
      expect(error.message).toMatch(/not a file agentinit writes|empty, "\.", or "\.\."/);
      expect(error.hint).toContain('agentinit init');
      return true;
    });
  });

  it('accepts AGENTS.md#core as an owned block key', async () => {
    const root = await tempDir();
    await writeManifest(root, serializeManifest(sampleManifest()));
    await expect(readManifest(root)).resolves.toEqual(sampleManifest());
  });
});
