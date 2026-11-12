import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { olderCliMessage } from '../../src/cli-compat.js';
import { AgentInitError, NewerUnreadableManifestError } from '../../src/errors.js';
import { ERROR } from '../../src/exit-codes.js';
import { MANIFEST_PATH, readManifest, serializeManifest, type Manifest } from '../../src/io/manifest.js';

const directories: string[] = [];
/** Same as sample manifests; not newer, so schema failures stay recover-hint path. */
const RUNNING = '0.1.0';

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
      excluded: [],
      workflows: true,
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
    ],
    "excluded": [],
    "workflows": true
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

interface ManifestBody {
  cliVersion: string;
  mode: string;
  selections: {
    language: string;
    agents: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
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
    const base = sampleManifest();
    const manifest: Manifest = {
      ...base,
      selections: {
        ...base.selections,
        agents: ['copilot', 'cursor'],
        frameworks: ['express', 'fastify'],
      },
    };
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

    const read = await readManifest(root, RUNNING);
    expect(read).toEqual(manifest);
    if (read === null) return;
    expect(serializeManifest(read)).toBe(serialized);
  });

  it('returns null when the manifest is missing', async () => {
    const root = await tempDir();
    expect(await readManifest(root, RUNNING)).toBeNull();
  });

  it('throws a recoverable error for invalid JSON', async () => {
    const root = await tempDir();
    await writeManifest(root, '{');
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
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
    await writeManifest(root, `${JSON.stringify({ cliVersion: '0.1.0' })}\n`);
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error).not.toBeInstanceOf(NewerUnreadableManifestError);
      expect(error.message).toMatch(/mode|selections|fragments|files/u);
      expect(error.hint).toContain('agentinit init');
      return true;
    });
  });

  it.each([
    {
      name: 'unknown language',
      mutate: (body: ManifestBody): void => {
        body.selections.language = 'javascript';
      },
    },
    {
      name: 'unknown agent',
      mutate: (body: ManifestBody): void => {
        body.selections.agents = ['cursor', 'codex'];
      },
    },
    {
      name: 'unknown mode',
      mutate: (body: ManifestBody): void => {
        body.mode = 'workspace';
      },
    },
  ])('throws NewerUnreadableManifestError for $name from a newer cliVersion', async ({ mutate }) => {
    const root = await tempDir();
    const body = JSON.parse(serializeManifest(sampleManifest())) as ManifestBody;
    body.cliVersion = '0.2.0';
    mutate(body);
    await writeManifest(root, `${JSON.stringify(body)}\n`);
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(NewerUnreadableManifestError);
      if (!(error instanceof NewerUnreadableManifestError)) return false;
      expect(error.manifestVersion).toBe('0.2.0');
      expect(error.message).toBe(olderCliMessage('0.2.0'));
      expect(error.hint).toBeUndefined();
      return true;
    });
  });

  it.each([
    { name: 'same cliVersion', cliVersion: '0.1.0' },
    { name: 'older cliVersion', cliVersion: '0.0.9' },
    { name: 'invalid cliVersion', cliVersion: 'not-a-version' },
  ])('keeps recover hint for unknown language with $name', async ({ cliVersion }) => {
    const root = await tempDir();
    const body = JSON.parse(serializeManifest(sampleManifest())) as ManifestBody;
    body.cliVersion = cliVersion;
    body.selections.language = 'javascript';
    await writeManifest(root, `${JSON.stringify(body)}\n`);
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error).not.toBeInstanceOf(NewerUnreadableManifestError);
      expect(error.message).toMatch(/language/u);
      expect(error.hint).toContain('agentinit init');
      return true;
    });
  });

  it('parses unknown top-level, selections, and file-entry keys', async () => {
    const root = await tempDir();
    const withExtras = `{
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
    ],
    "excluded": [],
    "workflows": true,
    "futureFlag": true
  },
  "fragments": {
    "nextjs-app-router": "1.0.0",
    "zustand": "1.0.0"
  },
  "files": {
    ".claude/skills/new-feature/SKILL.md": {
      "sha256": "${HASH_B}",
      "etag": "abc"
    },
    ".cursor/rules/agentinit-zustand.mdc": {
      "sha256": "${HASH_A}"
    },
    "AGENTS.md#core": {
      "sha256": "${HASH_C}"
    }
  },
  "schemaHint": 2
}
`;
    await writeManifest(root, withExtras);
    const read = await readManifest(root, RUNNING);
    expect(read).not.toBeNull();
    if (read === null) return;
    expect(read.extras).toEqual({ schemaHint: 2 });
    expect(read.selections.extras).toEqual({ futureFlag: true });
    expect(read.files['.claude/skills/new-feature/SKILL.md']?.extras).toEqual({ etag: 'abc' });
    expect(serializeManifest(read)).toBe(withExtras);
  });

  it('rejects a file key that is not a path or path#blockId', async () => {
    const root = await tempDir();
    const manifest = sampleManifest();
    const serialized = serializeManifest(manifest).replace('AGENTS.md#core', 'AGENTS.md#core#again');
    await writeManifest(root, serialized);
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
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
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
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
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain(key);
      expect(error.message).toContain('not a file agentinit writes');
      expect(error.hint).toContain('agentinit init');
      return true;
    });
  });

  it('accepts AGENTS.md#core as an owned block key', async () => {
    const root = await tempDir();
    await writeManifest(root, serializeManifest(sampleManifest()));
    await expect(readManifest(root, RUNNING)).resolves.toEqual(sampleManifest());
  });

  it('parses a manifest without excluded and defaults to an empty list', async () => {
    const root = await tempDir();
    const withoutExcluded = SERIALIZED.replace(/,\n {4}"excluded": \[\]/u, '');
    expect(withoutExcluded).not.toContain('"excluded"');
    await writeManifest(root, withoutExcluded);
    const read = await readManifest(root, RUNNING);
    expect(read?.selections.excluded).toEqual([]);
    if (read === null) return;
    expect(serializeManifest(read)).toContain('"excluded": []');
  });

  it('parses a manifest without workflows and defaults to true', async () => {
    const root = await tempDir();
    const withoutWorkflows = SERIALIZED.replace(/,\n {4}"workflows": true/u, '');
    expect(withoutWorkflows).not.toContain('"workflows"');
    await writeManifest(root, withoutWorkflows);
    const read = await readManifest(root, RUNNING);
    expect(read?.selections.workflows).toBe(true);
    if (read === null) return;
    expect(serializeManifest(read)).toContain('"workflows": true');
  });

  it('rejects a duplicate excluded id', async () => {
    const root = await tempDir();
    await writeManifest(
      root,
      SERIALIZED.replace('"excluded": []', '"excluded": ["zustand", "zustand"]'),
    );
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain('must be unique');
      return true;
    });
  });

  it('rejects a non-kebab excluded id', async () => {
    const root = await tempDir();
    await writeManifest(root, SERIALIZED.replace('"excluded": []', '"excluded": ["Zustand"]'));
    await expect(readManifest(root, RUNNING)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain('must be kebab-case');
      return true;
    });
  });
});
