import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError, NotInteractiveError } from '../../src/errors.js';
import { applyChanges, type ApplyOptions, type ApplyResult } from '../../src/io/apply.js';
import { canonicalBlockInner, computeChanges, type Change } from '../../src/io/changes.js';
import { contentHash } from '../../src/io/hash.js';
import { createWithBlock } from '../../src/io/managed-block.js';
import { MANIFEST_PATH, serializeManifest, type Manifest } from '../../src/io/manifest.js';
import type { FileOp } from '../../src/types.js';
import { choicePrompt, recordingPrompter } from '../ui/recording-prompter.js';

const directories: string[] = [];
const NOW = new Date('2026-11-02T01:10:00.000Z');
const STAMP = '20261102T011000000Z';
/** Owned whole-file path used by apply unit tests (PRD §5.2). */
const RULE = '.cursor/rules/agentinit-demo.mdc';

const META: Omit<Manifest, 'files'> = {
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
};

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
    ...META,
    files: Object.fromEntries(Object.entries(files).map(([key, sha256]) => [key, { sha256 }])),
  };
}

function applyOptions(overrides: Partial<ApplyOptions> = {}): ApplyOptions {
  return { now: NOW, manifest: META, yes: true, ...overrides };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-apply-'));
  directories.push(dir);
  return dir;
}

async function treeDigest(root: string): Promise<string> {
  const lines: string[] = [];
  await walk(root, '');
  return lines.join('\n');

  async function walk(dir: string, prefix: string): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true });
    items.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const item of items) {
      const rel = prefix.length === 0 ? item.name : `${prefix}/${item.name}`;
      const abs = path.join(dir, item.name);
      if (item.isDirectory()) {
        lines.push(`d ${rel}`);
        await walk(abs, rel);
        continue;
      }
      if (!item.isFile()) continue;
      const body = await readFile(abs);
      lines.push(`f ${rel} ${createHash('sha256').update(body).digest('hex')}`);
    }
  }
}


async function writeProject(root: string, relPath: string, body: string): Promise<void> {
  const absolute = path.join(root, relPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, body);
}

async function planChanges(root: string, ops: readonly FileOp[], files: Manifest | null): Promise<Change[]> {
  return computeChanges(root, { ops }, files);
}

function reportAction(result: ApplyResult, relPath: string): string | undefined {
  return result.report.find((entry) => entry.path === relPath)?.action;
}

describe('applyChanges defaults', () => {
  it('adopts an unmanaged shared file and keeps the user bytes', async () => {
    const root = await tempDir();
    const user = '# Mine\n\nKeep this.\n';
    const inner = 'Generated rules.\n';
    await writeFile(path.join(root, 'AGENTS.md'), user);
    const changes = await planChanges(root, [block('AGENTS.md', 'core', inner)], null);

    const result = await applyChanges(root, changes, applyOptions());

    expect(reportAction(result, 'AGENTS.md')).toBe('adopted');
    const next = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    expect(next.startsWith(user)).toBe(true);
    expect(next).toContain('<!-- agentinit:begin id=core -->');
    expect(next).toContain(inner.trim());
    expect(next).not.toContain('Backup');
    expect(result.manifestFiles['AGENTS.md#core']?.sha256).toBe(contentHash(canonicalBlockInner(inner)));
  });

  it('skips an unmanaged non-shared file', async () => {
    const root = await tempDir();
    const user = 'user rule\n';
    await mkdir(path.join(root, 'rules'), { recursive: true });
    await writeProject(root, RULE, user);
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    const result = await applyChanges(root, changes, applyOptions());

    expect(reportAction(result, RULE)).toBe('skipped');
    expect(await readFile(path.join(root, RULE), 'utf8')).toBe(user);
    expect(result.manifestFiles[RULE]).toBeUndefined();
  });

  it('skips a hand-edited owned file and keeps the previous hash', async () => {
    const root = await tempDir();
    const owned = 'owned\n';
    const edited = 'edited by hand\n';
    await writeProject(root, RULE, edited);
    const previous = contentHash(owned);
    const changes = await planChanges(root, [file(RULE, 'next\n')], manifest({ [RULE]: previous }));

    const result = await applyChanges(root, changes, applyOptions());

    expect(changes[0]?.kind).toBe('conflict-edited');
    expect(reportAction(result, RULE)).toBe('skipped');
    expect(await readFile(path.join(root, RULE), 'utf8')).toBe(edited);
    expect(result.manifestFiles[RULE]?.sha256).toBe(previous);
  });

  it('backs up before replacing when --force is set', async () => {
    const root = await tempDir();
    const user = 'user rule\n';
    await writeProject(root, RULE, user);
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    const result = await applyChanges(root, changes, applyOptions({ force: true }));

    expect(reportAction(result, RULE)).toBe('backed-up');
    expect(await readFile(path.join(root, RULE), 'utf8')).toBe('generated\n');
    const backup = `.agentinit/backups/${STAMP}/${RULE}`;
    expect(result.report[0]?.backupPath).toBe(backup);
    expect(await readFile(path.join(root, backup), 'utf8')).toBe(user);
    expect(await readFile(path.join(root, '.agentinit/.gitignore'), 'utf8')).toContain('backups/');
  });

  it('backs up an edited file before --force replaces it', async () => {
    const root = await tempDir();
    const edited = 'edited\n';
    await writeProject(root, RULE, edited);
    const changes = await planChanges(
      root,
      [file(RULE, 'generated\n')],
      manifest({ [RULE]: contentHash('owned\n') }),
    );

    const result = await applyChanges(root, changes, applyOptions({ force: true }));

    expect(reportAction(result, RULE)).toBe('backed-up');
    expect(await readFile(path.join(root, RULE), 'utf8')).toBe('generated\n');
    expect(await readFile(path.join(root, `.agentinit/backups/${STAMP}/${RULE}`), 'utf8')).toBe(edited);
    expect(result.manifestFiles[RULE]?.sha256).toBe(contentHash('generated\n'));
  });

  it('backs up a shared file before --force replaces it with the managed block', async () => {
    const root = await tempDir();
    const user = '# Mine\n\nKeep this.\n';
    await writeFile(path.join(root, 'AGENTS.md'), user);
    const changes = await planChanges(root, [block('AGENTS.md', 'core', 'rules\n')], null);

    const result = await applyChanges(root, changes, applyOptions({ force: true }));

    expect(reportAction(result, 'AGENTS.md')).toBe('backed-up');
    expect(await readFile(path.join(root, `.agentinit/backups/${STAMP}/AGENTS.md`), 'utf8')).toBe(user);
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(createWithBlock('core', 'rules\n'));
  });
});

describe('applyChanges stale files', () => {
  it('deletes an unedited owned file that left the plan', async () => {
    const root = await tempDir();
    const owned = 'owned\n';
    await writeProject(root, RULE, owned);
    const changes = await planChanges(root, [], manifest({ [RULE]: contentHash(owned) }));

    const result = await applyChanges(root, changes, applyOptions());

    expect(changes[0]?.kind).toBe('delete-stale');
    expect(reportAction(result, RULE)).toBe('deleted');
    await expect(readFile(path.join(root, RULE))).rejects.toThrow();
    expect(result.manifestFiles[RULE]).toBeUndefined();
  });

  it('keeps a stale file that was edited', async () => {
    const root = await tempDir();
    const edited = 'edited\n';
    const previous = contentHash('owned\n');
    await writeProject(root, RULE, edited);
    const changes = await planChanges(root, [], manifest({ [RULE]: previous }));

    const result = await applyChanges(root, changes, applyOptions());

    expect(reportAction(result, RULE)).toBe('skipped');
    expect(await readFile(path.join(root, RULE), 'utf8')).toBe(edited);
    expect(result.manifestFiles[RULE]?.sha256).toBe(previous);
  });

  it('backs up a stale edited file before --force deletes it', async () => {
    const root = await tempDir();
    const edited = 'edited\n';
    await writeProject(root, RULE, edited);
    const changes = await planChanges(root, [], manifest({ [RULE]: contentHash('owned\n') }));

    const result = await applyChanges(root, changes, applyOptions({ force: true }));

    expect(reportAction(result, RULE)).toBe('deleted');
    expect(await readFile(path.join(root, `.agentinit/backups/${STAMP}/${RULE}`), 'utf8')).toBe(edited);
    await expect(readFile(path.join(root, RULE))).rejects.toThrow();
    expect(result.manifestFiles[RULE]).toBeUndefined();
  });

  it('keeps a stale edited block', async () => {
    const root = await tempDir();
    const previous = contentHash('rules\n');
    const text = `# Notes\n\n${createWithBlock('core', 'edited rules\n')}`;
    await writeFile(path.join(root, 'AGENTS.md'), text);
    const changes = await planChanges(root, [], manifest({ 'AGENTS.md#core': previous }));

    const result = await applyChanges(root, changes, applyOptions());

    expect(changes[0]?.kind).toBe('conflict-edited');
    expect(reportAction(result, 'AGENTS.md')).toBe('skipped');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(text);
    expect(result.manifestFiles['AGENTS.md#core']?.sha256).toBe(previous);
  });

  it('removes an unedited stale block and leaves the surrounding text', async () => {
    const root = await tempDir();
    const inner = 'rules\n';
    const text = `# Notes\n\n${createWithBlock('core', inner)}`;
    await writeFile(path.join(root, 'AGENTS.md'), text);
    const changes = await planChanges(root, [], manifest({ 'AGENTS.md#core': contentHash(inner) }));

    const result = await applyChanges(root, changes, applyOptions());

    expect(reportAction(result, 'AGENTS.md')).toBe('deleted');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('# Notes\n');
    expect(result.manifestFiles['AGENTS.md#core']).toBeUndefined();
  });
});

describe('applyChanges writes', () => {
  it('updates an owned block without rewriting the bytes outside it', async () => {
    const root = await tempDir();
    const outside = '# Keep\n\n';
    const text = `${outside}${createWithBlock('core', 'old rules\n')}`;
    await writeFile(path.join(root, 'AGENTS.md'), text);
    const changes = await planChanges(
      root,
      [block('AGENTS.md', 'core', 'new rules\n')],
      manifest({ 'AGENTS.md#core': contentHash('old rules\n') }),
    );

    const result = await applyChanges(root, changes, applyOptions());

    expect(reportAction(result, 'AGENTS.md')).toBe('updated');
    const next = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    expect(next.startsWith(outside)).toBe(true);
    expect(next).toContain('new rules\n');
    expect(next).not.toContain('old rules');
  });

  it('preserves CRLF when updating a whole file', async () => {
    const root = await tempDir();
    await writeProject(root, RULE, 'line one\r\n');
    const changes = await planChanges(
      root,
      [file(RULE, 'line two\n')],
      manifest({ [RULE]: contentHash('line one\n') }),
    );

    await applyChanges(root, changes, applyOptions());

    const next = await readFile(path.join(root, RULE), 'utf8');
    expect(next).toBe('line two\r\n');
  });

  it('writes a new managed file, then sees it as unchanged', async () => {
    const root = await tempDir();
    const inner = 'rules\n';
    const created = await planChanges(root, [block('AGENTS.md', 'core', inner)], null);
    const first = await applyChanges(root, created, applyOptions());

    expect(reportAction(first, 'AGENTS.md')).toBe('created');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(createWithBlock('core', inner));
    const again = await planChanges(root, [block('AGENTS.md', 'core', inner)], manifest(hashes(first)));
    expect(again[0]?.kind).toBe('unchanged');
    const second = await applyChanges(root, again, applyOptions());
    expect(reportAction(second, 'AGENTS.md')).toBe('unchanged');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(createWithBlock('core', inner));
  });

  it('writes the manifest last and matches the returned file map', async () => {
    const root = await tempDir();
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);
    const result = await applyChanges(root, changes, applyOptions());
    const raw = await readFile(path.join(root, MANIFEST_PATH), 'utf8');
    expect(raw).toBe(serializeManifest({ ...META, files: result.manifestFiles }));
    expect(result.manifestFiles[RULE]?.sha256).toBe(contentHash('generated\n'));
  });

  it('appends backups/ to an existing .agentinit/.gitignore', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, '.agentinit'));
    await writeFile(path.join(root, '.agentinit/.gitignore'), 'secrets/\n');
    await writeProject(root, RULE, 'user\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    await applyChanges(root, changes, applyOptions({ force: true }));

    expect(await readFile(path.join(root, '.agentinit/.gitignore'), 'utf8')).toBe('secrets/\nbackups/\n');
  });

  it('appends backups/ when an existing line only ignores a subdirectory', async () => {
    const root = await tempDir();
    await mkdir(path.join(root, '.agentinit'));
    await writeFile(path.join(root, '.agentinit/.gitignore'), 'backups/old/\n');
    await writeProject(root, RULE, 'user\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    await applyChanges(root, changes, applyOptions({ force: true }));

    expect(await readFile(path.join(root, '.agentinit/.gitignore'), 'utf8')).toBe('backups/old/\nbackups/\n');
  });

  it('leaves a gitignore that already ignores backups untouched', async () => {
    const root = await tempDir();
    const existing = 'backups/\n# keep\n';
    await mkdir(path.join(root, '.agentinit'));
    await writeFile(path.join(root, '.agentinit/.gitignore'), existing);
    await writeProject(root, RULE, 'user\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    await applyChanges(root, changes, applyOptions({ force: true }));

    expect(await readFile(path.join(root, '.agentinit/.gitignore'), 'utf8')).toBe(existing);
  });
});

describe('applyChanges safety', () => {
  it('dryRun returns diffs and leaves the directory unchanged', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'keep.txt'), 'keep\n');
    const before = await treeDigest(root);
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    const result = await applyChanges(root, changes, applyOptions({ dryRun: true }));

    expect(await treeDigest(root)).toBe(before);
    expect(result.report[0]?.diff).toContain('+generated');
    await expect(readFile(path.join(root, MANIFEST_PATH))).rejects.toThrow();
    await expect(readFile(path.join(root, RULE))).rejects.toThrow();
  });

  it('leaves no partial target files when a write fails after the temp files exist', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, 'keep.txt'), 'keep\n');
    const before = await treeDigest(root);
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);

    await expect(
      applyChanges(
        root,
        changes,
        applyOptions({
          beforeRename() {
            throw new Error('disk full');
          },
        }),
      ),
    ).rejects.toThrow('disk full');

    expect(await treeDigest(root)).toBe(before);
    await expect(readFile(path.join(root, RULE))).rejects.toThrow();
  });

  it('shows a diff and follows the selected resolution', async () => {
    const root = await tempDir();
    const user = '# Mine\n';
    await writeFile(path.join(root, 'AGENTS.md'), user);
    const changes = await planChanges(root, [block('AGENTS.md', 'core', 'rules\n')], null);
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'adopt' }]);

    const result = await applyChanges(root, changes, applyOptions({ yes: false, prompter }));

    expect(calls[0]?.method).toBe('diff');
    expect(calls[0]?.method === 'diff' ? calls[0].unified : '').toContain('rules');
    expect(calls[0]?.method === 'diff' ? calls[0].unified : '').toContain('Index:');
    expect(choicePrompt(calls[1]).message).toBe(
      'AGENTS.md already exists and has no agentinit section yet. What should we do?',
    );
    expect(choicePrompt(calls[1]).initialValue).toBe('adopt');
    expect(reportAction(result, 'AGENTS.md')).toBe('adopted');
    expect((await readFile(path.join(root, 'AGENTS.md'), 'utf8')).startsWith(user)).toBe(true);
  });

  it('keeps file bytes identical when resolving a conflict via prompt or --yes', async () => {
    const user = '# Mine\n\nKeep this.\n';
    const inner = 'Generated rules.\n';

    const yesRoot = await tempDir();
    await writeFile(path.join(yesRoot, 'AGENTS.md'), user);
    const yesChanges = await planChanges(yesRoot, [block('AGENTS.md', 'core', inner)], null);
    await applyChanges(yesRoot, yesChanges, applyOptions({ yes: true }));

    const promptRoot = await tempDir();
    await writeFile(path.join(promptRoot, 'AGENTS.md'), user);
    const promptChanges = await planChanges(promptRoot, [block('AGENTS.md', 'core', inner)], null);
    const { prompter } = recordingPrompter([{ type: 'select', value: 'adopt' }]);
    await applyChanges(promptRoot, promptChanges, applyOptions({ yes: false, prompter }));

    expect(await treeDigest(promptRoot)).toBe(await treeDigest(yesRoot));
  });

  it('asks before replacing an unmanaged file and can skip it', async () => {
    const root = await tempDir();
    await writeProject(root, RULE, 'user\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'skip' }]);

    const result = await applyChanges(root, changes, applyOptions({ yes: false, prompter }));

    const ask = choicePrompt(calls.find((call) => call.method === 'select'));
    expect(ask.message).toBe(`${RULE} already exists and agentinit didn't create it. What should we do?`);
    expect(ask.initialValue).toBe('skip');
    expect(reportAction(result, RULE)).toBe('skipped');
    expect(await readFile(path.join(root, RULE), 'utf8')).toBe('user\n');
  });

  it('names the managed block when asking about an edited section', async () => {
    const root = await tempDir();
    const text = `# Notes\n\n${createWithBlock('core', 'edited by hand\n')}`;
    await writeFile(path.join(root, 'AGENTS.md'), text);
    const changes = await planChanges(
      root,
      [block('AGENTS.md', 'core', 'next rules\n')],
      manifest({ 'AGENTS.md#core': contentHash('rules\n') }),
    );
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'skip' }]);

    const result = await applyChanges(root, changes, applyOptions({ yes: false, prompter }));

    expect(changes[0]?.kind).toBe('conflict-edited');
    const ask = choicePrompt(calls.find((call) => call.method === 'select'));
    expect(ask.message).toBe(
      'the agentinit section of AGENTS.md was edited after agentinit wrote it. What should we do?',
    );
    expect(ask.initialValue).toBe('skip');
    expect(reportAction(result, 'AGENTS.md')).toBe('skipped');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe(text);
  });

  it('refuses a conflict when there is no prompter and --yes was not passed', async () => {
    const root = await tempDir();
    await writeProject(root, RULE, 'user\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);
    await expect(applyChanges(root, changes, applyOptions({ yes: false }))).rejects.toThrow(NotInteractiveError);
  });

  it('does not prompt when --yes is set', async () => {
    const root = await tempDir();
    await writeProject(root, RULE, 'user\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);
    const { prompter, calls } = recordingPrompter([]);
    const result = await applyChanges(root, changes, applyOptions({ prompter }));
    expect(calls).toEqual([]);
    expect(reportAction(result, RULE)).toBe('skipped');
  });

  it('keeps a skipped block when another block in the file is backup-replaced', async () => {
    const root = await tempDir();
    const original = `# Notes\n\n${createWithBlock('core', 'user core\n')}${createWithBlock('commands', 'user commands\n')}`;
    await writeFile(path.join(root, 'AGENTS.md'), original);
    const previousCommands = contentHash('old commands\n');
    const changes = await planChanges(
      root,
      [block('AGENTS.md', 'core', 'new core\n'), block('AGENTS.md', 'commands', 'new commands\n')],
      manifest({
        'AGENTS.md#core': contentHash('old core\n'),
        'AGENTS.md#commands': previousCommands,
      }),
    );
    const { prompter } = recordingPrompter([
      { type: 'select', value: 'backup-replace' },
      { type: 'select', value: 'skip' },
    ]);

    const result = await applyChanges(root, changes, applyOptions({ yes: false, prompter }));

    expect(result.report.map((entry) => [entry.blockId, entry.action])).toEqual([
      ['core', 'backed-up'],
      ['commands', 'skipped'],
    ]);
    const next = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    expect(next).toContain('new core\n');
    expect(next).toContain('user commands\n');
    expect(next).not.toContain('user core');
    expect(await readFile(path.join(root, `.agentinit/backups/${STAMP}/AGENTS.md`), 'utf8')).toBe(original);
    expect(result.manifestFiles['AGENTS.md#core']?.sha256).toBe(contentHash(canonicalBlockInner('new core\n')));
    expect(result.manifestFiles['AGENTS.md#commands']?.sha256).toBe(previousCommands);
  });

  it('does not create a directory through a symlink that leaves the project', async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await mkdir(path.join(root, '.cursor'));
    await symlink(outside, path.join(root, '.cursor/rules'));
    await expect(
      applyChanges(
        root,
        [
          {
            kind: 'create',
            path: RULE,
            opKind: 'file',
            content: 'generated\n',
            target: 'cursor',
          },
        ],
        applyOptions(),
      ),
    ).rejects.toThrow(/outside the project: \.cursor\/rules\/agentinit-demo\.mdc/);
    expect(await readdir(outside)).toEqual([]);
  });

  it('names the file when a write is not permitted', async () => {
    const root = await tempDir();
    const target = path.join(root, RULE);
    await writeProject(root, RULE, 'owned\n');
    // Pre-create .agentinit so the failure is the rule write, not the manifest dir.
    await mkdir(path.join(root, '.agentinit'), { recursive: true });
    const changes = await planChanges(root, [file(RULE, 'next\n')], manifest({ [RULE]: contentHash('owned\n') }));
    // Mode 0555 on the parent stops the temp file. Windows ignores that bit on
    // directories, so the destination is marked read-only instead; replacing it
    // fails with EPERM.
    const parent = path.dirname(target);
    const windows = process.platform === 'win32';
    if (windows) await chmod(target, 0o444);
    else await chmod(parent, 0o555);
    try {
      await expect(applyChanges(root, changes, applyOptions())).rejects.toThrow(
        /Cannot write \.cursor\/rules\/agentinit-demo\.mdc: permission denied/,
      );
    } finally {
      if (windows) await chmod(target, 0o644);
      else await chmod(parent, 0o755);
    }
    expect(await readFile(target, 'utf8')).toBe('owned\n');
  });

  it('reports a readable error when the parent path is a file', async () => {
    const root = await tempDir();
    await writeFile(path.join(root, '.agentinit'), 'not a directory\n');
    const changes = await planChanges(root, [file(RULE, 'generated\n')], null);
    await expect(applyChanges(root, changes, applyOptions())).rejects.toThrow(AgentInitError);
  });

  it('refuses delete-stale for a path agentinit does not own and leaves the file', async () => {
    const root = await tempDir();
    const secret = 'secret-notes.txt';
    await writeFile(path.join(root, secret), 'keep me\n');
    const changes: Change[] = [
      {
        kind: 'delete-stale',
        path: secret,
        opKind: 'file',
        ownedHash: contentHash('keep me\n'),
      },
    ];

    await expect(applyChanges(root, changes, applyOptions())).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return false;
      expect(error.message).toContain(secret);
      expect(error.message).toContain('not a file agentinit writes');
      return true;
    });
    expect(await readFile(path.join(root, secret), 'utf8')).toBe('keep me\n');
  });
});

function hashes(result: ApplyResult): Record<string, string> {
  return Object.fromEntries(
    Object.entries(result.manifestFiles).map(([key, entry]) => [key, entry.sha256]),
  );
}
