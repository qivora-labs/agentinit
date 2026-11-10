import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentHash } from '../../src/io/hash.js';
import { MANIFEST_PATH, readManifest } from '../../src/io/manifest.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';
import pkg from '../../package.json' with { type: 'json' };
import { runCli } from '../helpers/run.js';
import { createTempProject, listFiles } from './project.js';

const temp = createTempProject('agentinit-remove-');
const STAMP = '20261106T093700000Z';

afterEach(() => temp.cleanup());

describe('remove --all', () => {
  it('restores CLAUDE.md, deletes generated files, and removes the manifest', async () => {
    const dir = await temp.copyFixture('existing-claude-md');
    const beforeInit = await listFiles(dir);
    const original = await readFile(path.join(dir, 'CLAUDE.md'));
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    expect(await listFiles(dir)).toContain(MANIFEST_PATH);

    const removed = await runCli(['remove', '--all', '--yes', '--cwd', dir]);
    expect(removed.code).toBe(0);
    expect(await readFile(path.join(dir, 'CLAUDE.md'))).toEqual(original);
    expect(await listFiles(dir)).toEqual(beforeInit);
    expect(removed.stdout + removed.stderr).toMatch(/CLAUDE\.md \(updated\)/u);
  });

  it('keeps a hand-edited rule with --yes and deletes it after backup with --force', async () => {
    const kept = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', kept])).code).toBe(0);
    const rule = (await listFiles(kept)).find((file) => file.startsWith('.cursor/rules/'));
    expect(rule).toBeDefined();
    if (rule === undefined) return;
    const edited = '# hand edited\n';
    await writeFile(path.join(kept, rule), edited);
    const keep = await runCli(['remove', '--all', '--yes', '--cwd', kept]);
    expect(keep.code).toBe(0);
    expect(keep.stdout + keep.stderr).toMatch(/Kept/u);
    expect(await readFile(path.join(kept, rule), 'utf8')).toBe(edited);

    const forced = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', forced])).code).toBe(0);
    const forcedRule = (await listFiles(forced)).find((file) => file.startsWith('.cursor/rules/'));
    expect(forcedRule).toBeDefined();
    if (forcedRule === undefined) return;
    await writeFile(path.join(forced, forcedRule), edited);
    const force = await runCli(['remove', '--all', '--yes', '--force', '--cwd', forced], {
      now: new Date('2026-11-06T09:37:00.000Z'),
    });
    expect(force.code).toBe(0);
    expect(await listFiles(forced)).not.toContain(forcedRule);
    expect(await readFile(path.join(forced, '.agentinit/backups', STAMP, forcedRule), 'utf8')).toBe(
      edited,
    );
    expect(force.stdout + force.stderr).toContain('.agentinit/backups');
  });

  it('asks Keep or Delete after backup for a hand-edited rule', async () => {
    const edited = '# hand edited\n';
    const kept = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', kept])).code).toBe(0);
    const keepRule = (await listFiles(kept)).find((file) => file.startsWith('.cursor/rules/'));
    expect(keepRule).toBeDefined();
    if (keepRule === undefined) return;
    await writeFile(path.join(kept, keepRule), edited);
    const keep = await runCli(['remove', '--all', '--cwd', kept], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: createFakePrompter([{ type: 'select', value: 'skip' }]),
    });
    expect(keep.code).toBe(0);
    expect(await readFile(path.join(kept, keepRule), 'utf8')).toBe(edited);

    const removed = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', removed])).code).toBe(0);
    const deleteRule = (await listFiles(removed)).find((file) => file.startsWith('.cursor/rules/'));
    expect(deleteRule).toBeDefined();
    if (deleteRule === undefined) return;
    await writeFile(path.join(removed, deleteRule), edited);
    const del = await runCli(['remove', '--all', '--cwd', removed], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: createFakePrompter([{ type: 'select', value: 'backup-replace' }]),
      now: new Date('2026-11-06T09:37:00.000Z'),
    });
    expect(del.code).toBe(0);
    expect(await listFiles(removed)).not.toContain(deleteRule);
    expect(await readFile(path.join(removed, '.agentinit/backups', STAMP, deleteRule), 'utf8')).toBe(
      edited,
    );
  });

  it('prints json with files and backupsPath', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const result = await runCli(['remove', '--all', '--yes', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      dryRun: boolean;
      backupsPath: string | null;
      notices: readonly string[];
      files: readonly { path: string; action: string; blockId?: string }[];
    };
    expect(payload.dryRun).toBe(false);
    expect(payload.backupsPath).toBeNull();
    expect(payload.notices).toEqual([]);
    expect(payload.files.some((file) => file.action === 'deleted')).toBe(true);
    expect(payload.files.some((file) => file.path === 'CLAUDE.md' && file.blockId === 'claude')).toBe(
      true,
    );
  });

  it('exits 1 when the manifest is from a newer minor unless --force', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const manifestPath = path.join(dir, MANIFEST_PATH);
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as { cliVersion: string };
    saved.cliVersion = '0.2.0';
    await writeFile(manifestPath, `${JSON.stringify(saved, null, 2)}\n`);

    const blocked = await runCli(['remove', '--all', '--yes', '--cwd', dir]);
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain(`Set up with agentinit 0.2.0 · running ${pkg.version}`);
    expect(blocked.stderr).toContain('This project was set up with agentinit 0.2.0');

    const forced = await runCli(['remove', '--all', '--yes', '--force', '--json', '--cwd', dir]);
    expect(forced.code).toBe(0);
    const payload = JSON.parse(forced.stdout) as { notices: string[] };
    expect(payload.notices.some((notice) => notice.includes('0.2.0'))).toBe(true);
  });

  it('warns and continues when cliVersion is invalid', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const manifestPath = path.join(dir, MANIFEST_PATH);
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as { cliVersion: string };
    saved.cliVersion = 'not-a-version';
    await writeFile(manifestPath, `${JSON.stringify(saved, null, 2)}\n`);

    const result = await runCli(['remove', '--all', '--yes', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as { notices: string[] };
    expect(payload.notices).toContain(`Set up with agentinit not-a-version · running ${pkg.version}`);
  });

  it('keeps prior backups and prints their path', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const backupFile = path.join(dir, '.agentinit/backups', 'prior', 'note.txt');
    await mkdir(path.dirname(backupFile), { recursive: true });
    await writeFile(backupFile, 'saved\n');

    const result = await runCli(['remove', '--all', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).toContain('.agentinit/backups');
    expect(await readFile(backupFile, 'utf8')).toBe('saved\n');
    expect(await listFiles(dir)).not.toContain(MANIFEST_PATH);
  });

  it('writes nothing on --dry-run', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const before = await listFiles(dir);
    const digest = await Promise.all(
      before.map(async (file) => [file, contentHash(await readFile(path.join(dir, file), 'utf8'))] as const),
    );

    const result = await runCli(['remove', '--all', '--yes', '--dry-run', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(await listFiles(dir)).toEqual(before);
    for (const [file, hash] of digest) {
      expect(contentHash(await readFile(path.join(dir, file), 'utf8'))).toBe(hash);
    }
  });

  it('leaves no partial files when interrupted', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const before = await listFiles(dir);
    const result = await runCli(['remove', '--all', '--yes', '--cwd', dir], {
      shouldStop: () => true,
    });
    expect(result.code).toBe(130);
    expect(result.stderr).toContain('Interrupted.');
    expect(await listFiles(dir)).toEqual(before);
  });

  it('exits 1 without a manifest and rejects remove with ids', async () => {
    const dir = await temp.copyFixture('next15-src');
    const missing = await runCli(['remove', '--all', '--yes', '--cwd', dir]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('Not initialized');
    expect(missing.stderr).toContain('init');

    const withIds = await runCli(['remove', 'zustand', '--yes', '--cwd', dir]);
    expect(withIds.code).toBe(1);
    expect(withIds.stderr).toContain('Only `remove --all` is available in this version.');
  });
});

describe('init --no-workflows', () => {
  it('writes 8 files on next15-src and keeps workflows off on re-run', async () => {
    const dir = await temp.copyFixture('next15-src');
    const first = await runCli(['init', '--yes', '--no-workflows', '--cwd', dir]);
    expect(first.code).toBe(0);
    const files = await listFiles(dir);
    const generated = files.filter(
      (file) =>
        file === 'AGENTS.md' ||
        file === 'ARCHITECTURE.md' ||
        file === 'CLAUDE.md' ||
        file === '.github/copilot-instructions.md' ||
        file.startsWith('.cursor/') ||
        file.startsWith('.claude/') ||
        file.startsWith('.windsurf/') ||
        file.startsWith('.github/'),
    );
    expect(generated).toHaveLength(8);
    expect(generated.some((file) => file.includes('commands') || file.includes('workflows') || file.includes('skills') || file.includes('prompts'))).toBe(
      false,
    );

    const manifest = await readManifest(dir);
    expect(manifest?.selections.workflows).toBe(false);

    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    expect((await readManifest(dir))?.selections.workflows).toBe(false);
    expect(await listFiles(dir)).toEqual(files);
  });

  it('deletes old workflow files when Customize turns workflows off', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', dir])).code).toBe(0);
    const workflow = '.cursor/commands/new-feature.md';
    expect(await listFiles(dir)).toContain(workflow);

    const answers: readonly FakeAnswer[] = [
      { type: 'select', value: 'customize' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'groupMultiselect', value: ['nextjs-app-router'] },
      { type: 'groupMultiselect', value: [] },
      { type: 'select', value: 'flat' },
      { type: 'select', value: false },
      { type: 'select', value: 'write' },
    ];
    const result = await runCli(['init', '--agents', 'cursor', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: createFakePrompter(answers),
    });
    expect(result.code).toBe(0);
    expect(await listFiles(dir)).not.toContain(workflow);
    expect((await readManifest(dir))?.selections.workflows).toBe(false);
  });
});
