import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { computeChanges, sharedFilesWithOutsideH1 } from '../../src/io/changes.js';
import { contentHash } from '../../src/io/hash.js';
import { createWithBlock } from '../../src/io/managed-block.js';
import type { Manifest } from '../../src/io/manifest.js';
import type { FileOp } from '../../src/types.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

function file(relPath: string, content: string): FileOp {
  return { path: relPath, kind: 'file', content, target: 'cursor' };
}

function block(relPath: string, blockId: string, content: string): FileOp {
  return { path: relPath, kind: 'managed-block', blockId, content, target: 'shared' };
}

function manifest(files: Record<string, string>): Manifest {
  return {
    cliVersion: '0.1.0',
    mode: 'existing',
    selections: {
      language: 'typescript',
      frameworks: [],
      libraries: [],
      architecture: 'flat',
      agents: [],
      excluded: [],
      workflows: true,
    },
    fragments: {},
    files: Object.fromEntries(Object.entries(files).map(([key, sha256]) => [key, { sha256 }])),
  };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-changes-'));
  directories.push(dir);
  return dir;
}

async function kinds(root: string, ops: readonly FileOp[], files: Manifest | null): Promise<string[]> {
  const changes = await computeChanges(root, { ops }, files);
  return changes.map((change) => change.kind);
}

describe('computeChanges', () => {
  it('classifies a missing path as create, including when the manifest still lists it', async () => {
    const root = await tempDir();
    const owned = contentHash('gone\n');
    await expect(kinds(root, [file('rules/a.md', 'fresh\n')], manifest({ 'rules/a.md': owned }))).resolves.toEqual([
      'create',
    ]);
    await expect(kinds(root, [file('rules/a.md', 'fresh\n')], null)).resolves.toEqual(['create']);
  });

  it('classifies an owned file by hash', async () => {
    const root = await tempDir();
    const current = 'owned\n';
    await writeFile(path.join(root, 'rule.md'), current);
    const owned = contentHash(current);
    const recorded = manifest({ 'rule.md': owned });

    await expect(kinds(root, [file('rule.md', current)], recorded)).resolves.toEqual(['unchanged']);
    await expect(kinds(root, [file('rule.md', 'next\n')], recorded)).resolves.toEqual(['update']);
    await writeFile(path.join(root, 'rule.md'), 'edited\n');
    await expect(kinds(root, [file('rule.md', 'next\n')], recorded)).resolves.toEqual(['conflict-edited']);
  });

  it('treats a CRLF file with the same text as unchanged', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'rule.md'), 'owned\r\n');
    const recorded = manifest({ 'rule.md': contentHash('owned\n') });
    await expect(kinds(root, [file('rule.md', 'owned\n')], recorded)).resolves.toEqual(['unchanged']);
  });

  it('classifies an existing unowned file as conflict-unmanaged', async () => {
    const root = await tempDir();
    const current = 'user\n';
    await writeFile(path.join(root, 'rule.md'), current);
    await expect(kinds(root, [file('rule.md', current)], null)).resolves.toEqual(['conflict-unmanaged']);
    await expect(kinds(root, [file('rule.md', 'other\n')], null)).resolves.toEqual(['conflict-unmanaged']);
  });

  it('classifies a shared file with no block as conflict-unmanaged', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), '# Mine\n');
    await expect(kinds(root, [block('AGENTS.md', 'core', 'rules\n')], null)).resolves.toEqual(['conflict-unmanaged']);
  });

  it('classifies an owned managed block by the inner hash', async () => {
    const root = await tempDir();
    const inner = 'rules\n';
    await writeFile(path.join(root, 'AGENTS.md'), `# Mine\n\n${createWithBlock('core', inner)}`);
    const recorded = manifest({ 'AGENTS.md#core': contentHash(inner) });

    await expect(kinds(root, [block('AGENTS.md', 'core', inner)], recorded)).resolves.toEqual(['unchanged']);
    await expect(kinds(root, [block('AGENTS.md', 'core', 'next\n')], recorded)).resolves.toEqual(['update']);
    await writeFile(path.join(root, 'AGENTS.md'), `# Mine\n\n${createWithBlock('core', 'edited\n')}`);
    await expect(kinds(root, [block('AGENTS.md', 'core', 'next\n')], recorded)).resolves.toEqual(['conflict-edited']);
  });

  it('classifies a removed owned block as conflict-edited', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), '# Mine\n');
    const recorded = manifest({ 'AGENTS.md#core': contentHash('rules\n') });
    await expect(kinds(root, [block('AGENTS.md', 'core', 'rules\n')], recorded)).resolves.toEqual(['conflict-edited']);
  });

  it('does not treat an unowned marker with different text as unmanaged', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), createWithBlock('core', 'user wrote this\n'));
    await expect(kinds(root, [block('AGENTS.md', 'core', 'rules\n')], null)).resolves.toEqual(['conflict-edited']);
    await writeFile(path.join(root, 'AGENTS.md'), createWithBlock('core', 'rules\n'));
    await expect(kinds(root, [block('AGENTS.md', 'core', 'rules\n')], null)).resolves.toEqual(['unchanged']);
  });

  it('classifies stale owned files and blocks', async () => {
    const root = await tempDir();
    const inner = 'rules\n';
    await writeFile(path.join(root, 'rule.md'), 'owned\n');
    await writeFile(path.join(root, 'AGENTS.md'), `# Mine\n\n${createWithBlock('core', inner)}`);
    const recorded = manifest({
      'rule.md': contentHash('owned\n'),
      'AGENTS.md#core': contentHash(inner),
    });

    const changes = await computeChanges(root, { ops: [] }, recorded);
    expect(changes.map((change) => [change.path, change.kind, change.blockId])).toEqual([
      ['AGENTS.md', 'delete-stale', 'core'],
      ['rule.md', 'delete-stale', undefined],
    ]);
  });

  it('classifies a stale edited block as conflict-edited', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), `# Notes\n\n${createWithBlock('core', 'edited rules\n')}`);
    const recorded = manifest({ 'AGENTS.md#core': contentHash('rules\n') });
    const changes = await computeChanges(root, { ops: [] }, recorded);
    expect(changes).toEqual([
      {
        kind: 'conflict-edited',
        path: 'AGENTS.md',
        opKind: 'managed-block',
        blockId: 'core',
        ownedHash: contentHash('rules\n'),
      },
    ]);
  });

  it('classifies a stale edited file as conflict-edited and ignores a file that is already gone', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'rule.md'), 'edited\n');
    const recorded = manifest({
      'rule.md': contentHash('owned\n'),
      'missing.md': contentHash('gone\n'),
    });
    const changes = await computeChanges(root, { ops: [] }, recorded);
    expect(changes).toEqual([
      {
        kind: 'conflict-edited',
        path: 'rule.md',
        opKind: 'file',
        ownedHash: contentHash('owned\n'),
      },
    ]);
  });

  it('names the file when markers are malformed', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), '<!-- agentinit:begin id=core -->\nno end\n');
    await expect(computeChanges(root, { ops: [block('AGENTS.md', 'core', 'rules\n')] }, null)).rejects.toThrow(
      AgentInitError,
    );
    await expect(computeChanges(root, { ops: [block('AGENTS.md', 'core', 'rules\n')] }, null)).rejects.toThrow(
      /AGENTS\.md/,
    );
  });

  it('rejects a plan that writes one path twice or escapes the project', async () => {
    const root = await tempDir();
    await expect(computeChanges(root, { ops: [file('a.md', 'a\n'), file('a.md', 'b\n')] }, null)).rejects.toThrow(
      /more than once/,
    );
    await expect(computeChanges(root, { ops: [file('../a.md', 'a\n')] }, null)).rejects.toThrow(/relative project path/);
  });

  it('refuses a symlink that points outside the project', async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await writeFile(path.join(outside, 'secret.txt'), 'secret\n');
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'rule.md'));
    await expect(computeChanges(root, { ops: [file('rule.md', 'next\n')] }, null)).rejects.toThrow(
      /outside the project: rule\.md/,
    );
    expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret\n');
  });

  it('refuses a broken symlink instead of treating it as a missing file', async () => {
    const root = await tempDir();
    await symlink(path.join(root, 'missing-target'), path.join(root, 'rule.md'));
    await expect(computeChanges(root, { ops: [file('rule.md', 'next\n')] }, null)).rejects.toThrow(
      /rule\.md: it is a broken symlink/,
    );
  });

  it('reads an in-project symlink as the target file', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'target.md'), 'user\n');
    await symlink('target.md', path.join(root, 'rule.md'));
    await expect(kinds(root, [file('rule.md', 'next\n')], null)).resolves.toEqual(['conflict-unmanaged']);
  });

  it('rejects a directory where a file is expected', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, 'AGENTS.md'));
    await expect(computeChanges(root, { ops: [block('AGENTS.md', 'core', 'rules\n')] }, null)).rejects.toThrow(
      /AGENTS\.md is a directory/,
    );
  });
});

describe('sharedFilesWithOutsideH1', () => {
  it('returns only existing shared files that already have an outside H1', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), '# AGENTS.md — app\n\nNotes.\n');
    await writeFile(path.join(root, 'ARCHITECTURE.md'), 'No heading here.\n');
    await expect(sharedFilesWithOutsideH1(root)).resolves.toEqual(new Set(['AGENTS.md']));
  });

  it('ignores an H1 that lives only inside the managed block', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'AGENTS.md'), createWithBlock('core', '# AGENTS.md\n\n## Contents\n'));
    await expect(sharedFilesWithOutsideH1(root)).resolves.toEqual(new Set());
  });
});
