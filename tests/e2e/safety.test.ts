import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentHash } from '../../src/io/hash.js';
import { removeBlock } from '../../src/io/managed-block.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';
import { runCli } from '../helpers/run.js';
import { createTempProject, listFiles, treeDigest } from './project.js';

const temp = createTempProject('agentinit-safety-');
const WORKFLOW = '.cursor/skills/new-feature/SKILL.md';
const USER_WORKFLOW = '# My command\n\nThis workflow belongs to the project.\n';
const SUFFIX = 'a1b2';
const STAMP = `20261102T011000000Z-${SUFFIX}`;

afterEach(() => temp.cleanup());

describe('safety', () => {
  it('Content outside managed blocks is byte-for-byte unchanged after init', async () => {
    for (const name of ['existing-claude-md', 'crlf-line-endings'] as const) {
      const dir = await temp.copyFixture(name);
      const before = await listFiles(dir);
      const original = new Map<string, Buffer>();
      for (const file of before) original.set(file, await readFile(path.join(dir, file)));
      expect(original.get('CLAUDE.md')?.includes(Buffer.from('\r\n')), name).toBe(name === 'crlf-line-endings');

      const result = await runCli(['init', '--yes', '--cwd', dir]);
      expect(result.code, name).toBe(0);

      for (const [file, bytes] of original) {
        const next = await readFile(path.join(dir, file));
        if (file === 'CLAUDE.md') {
          expect(removeBlock(next.toString('utf8'), 'claude', file), name).toBe(bytes.toString('utf8'));
          if (name === 'crlf-line-endings') expect(next.includes(Buffer.from('\r\n'))).toBe(true);
          continue;
        }
        expect(next, `${name}:${file}`).toEqual(bytes);
      }
    }
  });

  it('Re-running init with no project changes writes nothing and prints "Already up to date."', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const digest = await treeDigest(dir);
    const again = await runCli(['init', '--yes', '--cwd', dir]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Already up to date.');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('A hand-edited managed block is never overwritten with --yes', async () => {
    const dir = await temp.copyFixture('edited-managed-block');
    const agents = path.join(dir, 'AGENTS.md');
    const before = await readFile(agents, 'utf8');
    expect(before).toContain('HAND-EDITED BLOCK');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('skipped');
    expect(await readFile(agents, 'utf8')).toBe(before);
  });

  it('removes unedited and hand-edited .cursor/commands leftovers from 0.1.0', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);

    const unedited = '.cursor/commands/new-feature.md';
    const edited = '.cursor/commands/refactor.md';
    const uneditedBody = '## Purpose\n\nUnedited leftover command.\n';
    const editedBody = '## Purpose\n\nHand-edited leftover command.\n';
    await mkdir(path.join(dir, '.cursor/commands'), { recursive: true });
    await writeFile(path.join(dir, unedited), uneditedBody);
    await writeFile(path.join(dir, edited), editedBody);

    const manifestPath = path.join(dir, '.agentinit/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      files: Record<string, { sha256: string }>;
    };
    manifest.files[unedited] = { sha256: contentHash(uneditedBody) };
    manifest.files[edited] = { sha256: contentHash('original command body\n') };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const again = await runCli(['init', '--yes', '--cwd', dir], {
      now: new Date('2026-11-02T01:10:00.000Z'),
      backupSuffix: SUFFIX,
    });
    expect(again.code).toBe(0);
    expect(await listFiles(dir)).not.toContain(unedited);
    expect(await listFiles(dir)).not.toContain(edited);
    expect(await readFile(path.join(dir, '.agentinit/backups', STAMP, edited), 'utf8')).toBe(editedBody);
    expect(again.stdout).toContain('deleted');
  });

  it('An existing same-named workflow file is never overwritten without confirmation or --force', async () => {
    const skipped = await temp.copyFixture('existing-workflow-file');
    const skip = await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', skipped]);
    expect(skip.code).toBe(0);
    expect(skip.stdout).toContain('skipped');
    expect(await readFile(path.join(skipped, WORKFLOW), 'utf8')).toBe(USER_WORKFLOW);

    const forced = await temp.copyFixture('existing-workflow-file');
    const force = await runCli(['init', '--yes', '--force', '--agents', 'cursor', '--cwd', forced], {
      now: new Date('2026-11-02T01:10:00.000Z'),
      backupSuffix: SUFFIX,
    });
    expect(force.code).toBe(0);
    expect(await readFile(path.join(forced, WORKFLOW), 'utf8')).not.toBe(USER_WORKFLOW);
    expect(await readFile(path.join(forced, '.agentinit/backups', STAMP, WORKFLOW), 'utf8')).toBe(USER_WORKFLOW);

    const confirmed = await temp.copyFixture('existing-workflow-file');
    const answers: readonly FakeAnswer[] = [
      { type: 'select', value: 'use' },
      { type: 'select', value: 'flat' },
      { type: 'select', value: 'write' },
      { type: 'select', value: 'backup-replace' },
    ];
    const confirm = await runCli(['init', '--agents', 'cursor', '--cwd', confirmed], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: createFakePrompter(answers),
      now: new Date('2026-11-02T01:10:00.000Z'),
      backupSuffix: SUFFIX,
    });
    expect(confirm.code).toBe(0);
    expect(await readFile(path.join(confirmed, WORKFLOW), 'utf8')).not.toBe(USER_WORKFLOW);
    expect(await readFile(path.join(confirmed, '.agentinit/backups', STAMP, WORKFLOW), 'utf8')).toBe(USER_WORKFLOW);
  });

  it('Interrupting init (SIGINT) leaves no partial files', async () => {
    const dir = await temp.copyFixture('next15-src');
    const digest = await treeDigest(dir);
    const result = await runCli(['init', '--yes', '--cwd', dir], { shouldStop: () => true });
    expect(result.code).toBe(130);
    expect(result.stderr).toContain('Interrupted.');
    expect(result.stderr).not.toContain('This is a bug');
    expect(await treeDigest(dir)).toBe(digest);
    expect((await listFiles(dir)).some((file) => file.endsWith('.tmp'))).toBe(false);
  });

  it('--dry-run writes nothing, including the manifest', async () => {
    const dir = await temp.copyFixture('next15-src');
    const digest = await treeDigest(dir);
    const result = await runCli(['init', '--yes', '--dry-run', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('AGENTS.md');
    expect(await listFiles(dir)).not.toContain('.agentinit/manifest.json');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('rejects a forged manifest path and deletes nothing', async () => {
    const dir = await temp.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);

    const secret = 'secret-notes.txt';
    const body = 'top secret\n';
    await writeFile(path.join(dir, secret), body);
    const manifestPath = path.join(dir, '.agentinit/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      files: Record<string, { sha256: string }>;
    };
    manifest.files[secret] = { sha256: contentHash(body) };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const digest = await treeDigest(dir);
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(secret);
    expect(result.stderr).toContain('not a file agentinit writes');
    expect(await readFile(path.join(dir, secret), 'utf8')).toBe(body);
    expect(await treeDigest(dir)).toBe(digest);
  });
});
