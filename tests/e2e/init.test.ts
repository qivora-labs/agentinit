import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { compareText } from '../../src/compare-text.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';
import { runCli } from '../helpers/run.js';
import { recordingPrompter } from '../ui/recording-prompter.js';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function emptyDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-init-'));
  directories.push(dir);
  return dir;
}

async function copyFixture(name: string): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), 'agentinit-init-'));
  directories.push(parent);
  const dir = path.join(parent, 'project');
  await cp(path.join(fixtures, name), dir, { recursive: true });
  return dir;
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
  await walk(root, '');
  files.sort(compareText);
  return files;
}

async function treeText(root: string): Promise<string> {
  const parts: string[] = [];
  for (const file of await listFiles(root)) {
    parts.push(`===== ${file}\n${await readFile(path.join(root, file), 'utf8')}`);
  }
  return `${parts.join('\n')}\n`;
}

async function treeDigest(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const file of await listFiles(root)) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const VITE_ANSWERS: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'multiselect', value: [] },
  { type: 'select', value: 'feature-based' },
  { type: 'multiselect', value: ['cursor'] },
];

const LAYERED_ANSWERS: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'multiselect', value: [] },
  { type: 'select', value: 'layered' },
  { type: 'multiselect', value: ['cursor'] },
];

/** A saved manifest skips the agent prompt, so the re-run has no fifth answer. */
const VITE_RERUN: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'multiselect', value: [] },
  { type: 'select', value: 'feature-based' },
];

function interactive(answers: readonly FakeAnswer[]) {
  return {
    stdinTTY: true,
    stdoutTTY: true,
    prompter: createFakePrompter(answers),
  };
}

describe('init', () => {
  it('writes the next15-src tree for every agent', async () => {
    const dir = await copyFixture('next15-src');
    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('This is a bug');
    expect(result.stdout).toContain('Always-on tokens:');
    expect(result.stdout).not.toContain('Context cost');
    expect(result.stdout).not.toContain('Next steps');
    expect(result.stdout).not.toContain('Review the changes');
    expect(result.stdout).not.toContain('rules for the agents in this repo');
    const tree = await treeText(dir);
    await expect(tree).toMatchFileSnapshot('../__snapshots__/e2e/next15-src.txt');
  });

  it('prints Already up to date and writes nothing on the second run', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const digest = await treeDigest(dir);
    const again = await runCli(['init', '--yes', '--cwd', dir]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Already up to date.');
    expect(again.stdout).not.toContain('┌');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('prints the wordmark once on a terminal and keeps json plain', async () => {
    const dir = await copyFixture('next15-src');
    const tty = await runCli(['init', '--yes', '--cwd', dir], { stdoutTTY: true });
    expect(tty.code).toBe(0);
    const tagline = tty.stdout.indexOf('rules for the agents in this repo');
    const tokens = tty.stdout.indexOf('Context cost');
    expect(tagline).toBeGreaterThanOrEqual(0);
    expect(tagline).toBeLessThan(tokens);
    expect(tty.stdout.split('rules for the agents in this repo')).toHaveLength(2);
    expect(tty.stdout.split('Done.')).toHaveLength(2);
    expect(tty.stdout).toContain('Wrote ');
    expect(tty.stdout).toContain('Next steps');
    expect(tty.stdout).not.toContain('├──');

    const again = await runCli(['init', '--yes', '--cwd', dir], { stdoutTTY: true });
    expect(again.stdout.split('Already up to date.')).toHaveLength(2);
    expect(again.stdout).not.toContain('Done.');

    const jsonDir = await copyFixture('next15-src');
    const json = await runCli(['init', '--yes', '--json', '--cwd', jsonDir], { stdoutTTY: true });
    expect(json.code).toBe(0);
    expect(json.stdout.trimStart().startsWith('{')).toBe(true);
    expect(json.stdout).not.toContain('rules for the agents in this repo');
    expect(json.stderr).not.toContain('rules for the agents in this repo');
  });

  it('adds only the new fragment files when a supported package appears', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);

    const packagePath = path.join(dir, 'package.json');
    const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    manifest.dependencies.zustand = '5.0.0';
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);

    const before = await listFiles(dir);
    const bytes = new Map<string, Buffer>();
    for (const file of before) {
      if (file === '.agentinit/manifest.json') continue;
      bytes.set(file, await readFile(path.join(dir, file)));
    }

    const result = await runCli(['init', '--yes', '--cwd', dir]);
    expect(result.code).toBe(0);
    const after = await listFiles(dir);
    const added = after.filter((file) => !before.includes(file));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((file) => file.includes('zustand'))).toBe(true);

    for (const [file, content] of bytes) {
      expect(after).toContain(file);
      expect(await readFile(path.join(dir, file))).toEqual(content);
    }
    expect(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')).toContain('zustand');
  });

  it('prints diffs and writes nothing on --dry-run, including with --json', async () => {
    const dir = await copyFixture('next15-src');
    const digest = await treeDigest(dir);
    const preview = await runCli(['init', '--yes', '--dry-run', '--cwd', dir]);
    expect(preview.code).toBe(0);
    expect(preview.stdout).toContain('AGENTS.md');
    expect(preview.stdout).toContain('---');
    expect(await listFiles(dir)).not.toContain('.agentinit/manifest.json');
    expect(await treeDigest(dir)).toBe(digest);

    const json = await runCli(['init', '--yes', '--dry-run', '--json', '--cwd', dir]);
    expect(json.code).toBe(0);
    const parsed: unknown = JSON.parse(json.stdout);
    expect(parsed).toMatchObject({ dryRun: true, upToDate: false });
    expect(json.stdout).toContain('"diff"');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('prints the init report as json on a real run', async () => {
    const dir = await copyFixture('next15-src');
    const result = await runCli(['init', '--yes', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const parsed: unknown = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({ dryRun: false, upToDate: false });
    expect(result.stdout).toContain('"path": "AGENTS.md"');
    expect(result.stderr).toBe('');
    expect(await listFiles(dir)).toContain('.agentinit/manifest.json');
  });

  it('prints detection notices when a re-run is already up to date', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const before = await listFiles(dir);
    const bytes = new Map<string, Buffer>();
    for (const file of before) {
      if (file === 'package.json') continue;
      bytes.set(file, await readFile(path.join(dir, file)));
    }

    const packagePath = path.join(dir, 'package.json');
    const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    manifest.dependencies.tailwindcss = '3.4.0';
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(dir, '.cursorrules'), 'legacy\n');

    const again = await runCli(['init', '--yes', '--cwd', dir]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Already up to date.');
    expect(again.stderr).toContain('tailwindcss@3.4.0 detected — no matching rules yet.');
    expect(again.stderr).toContain('.cursorrules still loads alongside the new rules and will not be modified.');

    const json = await runCli(['init', '--yes', '--json', '--cwd', dir]);
    expect(json.code).toBe(0);
    const parsed: unknown = JSON.parse(json.stdout);
    expect(parsed).toMatchObject({
      dryRun: false,
      upToDate: true,
      notices: [
        'tailwindcss@3.4.0 detected — no matching rules yet.',
        '.cursorrules still loads alongside the new rules and will not be modified.',
      ],
    });

    const after = await listFiles(dir);
    expect(after.filter((file) => !before.includes(file))).toEqual(['.cursorrules']);
    expect(after.some((file) => file.includes('tailwind'))).toBe(false);
    for (const [file, content] of bytes) {
      expect(await readFile(path.join(dir, file))).toEqual(content);
    }
    expect(await readFile(path.join(dir, '.cursorrules'), 'utf8')).toBe('legacy\n');
  });

  it('rejects greenfield --yes and writes a greenfield project interactively', async () => {
    const rejected = await emptyDir();
    const refusal = await runCli(['init', '--yes', '--cwd', rejected]);
    expect(refusal.code).toBe(1);
    expect(refusal.stderr).toContain('An empty project needs interactive choices.');
    expect(refusal.stderr).toContain('Run again without --yes.');
    expect(await listFiles(rejected)).toEqual([]);

    const dir = await emptyDir();
    const result = await runCli(['init', '--cwd', dir], interactive(VITE_ANSWERS));
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('This is a bug');
    const architecture = await readFile(path.join(dir, 'ARCHITECTURE.md'), 'utf8');
    expect(architecture).toContain('Planned layout');
    const agentsMd = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('# AGENTS.md');
    expect(agentsMd).not.toContain('## Project commands');
    expect(await listFiles(dir)).toContain('.cursor/rules/agentinit-react-vite.mdc');
    expect(result.stdout).toContain('pnpm create vite@latest');
    expect(result.stdout).toContain('npx @agentinit/cli');

    const digest = await treeDigest(dir);
    const again = await runCli(['init', '--cwd', dir], interactive(VITE_RERUN));
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Already up to date.');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('keeps greenfield architecture and agents after a package.json appears', async () => {
    const dir = await emptyDir();
    expect((await runCli(['init', '--cwd', dir], interactive(LAYERED_ANSWERS))).code).toBe(0);

    await writeFile(
      path.join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'scaffold',
          packageManager: 'pnpm@10.14.0',
          scripts: { dev: 'next dev', build: 'next build', lint: 'eslint .' },
          dependencies: { next: '16.3.0', react: '19.0.0' },
          devDependencies: { typescript: '5.9.0' },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(path.join(dir, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }\n');
    await mkdir(path.join(dir, 'src/app'), { recursive: true });
    await writeFile(path.join(dir, 'src/app/page.ts'), 'export {}\n');

    const recorded = recordingPrompter([{ type: 'select', value: 'use' }]);
    const result = await runCli(['init', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('This is a bug');
    const note = recorded.calls.find((call) => call.method === 'note');
    expect(note).toMatchObject({ method: 'note', title: 'What changed' });
    if (note?.method !== 'note') throw new Error('expected a summary note');
    expect(note.message).toContain('Keeping the saved architecture and agents.');
    expect(note.message).toContain('Added:');
    expect(note.message).toContain('Removed:');
    expect(note.message).toContain('Layout: src/');
    expect(note.message).not.toContain('Package manager:');

    const manifest = JSON.parse(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')) as {
      mode: string;
      selections: { architecture: string; agents: string[] };
    };
    expect(manifest.mode).toBe('existing');
    expect(manifest.selections.architecture).toBe('layered');
    expect(manifest.selections.agents).toEqual(['cursor']);
    expect(await readFile(path.join(dir, 'AGENTS.md'), 'utf8')).toContain('## Project commands');
    expect(await listFiles(dir)).not.toContain('CLAUDE.md');
  });

  it('replaces unedited Cursor files when the agent switches to Claude', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', dir])).code).toBe(0);
    const first = await listFiles(dir);
    expect(first.some((file) => file.startsWith('.cursor/'))).toBe(true);
    expect(first.some((file) => file.startsWith('.claude/') || file === 'CLAUDE.md')).toBe(false);
    expect(first.some((file) => file.startsWith('.windsurf/'))).toBe(false);
    expect(first.some((file) => file.startsWith('.github/'))).toBe(false);
    expect(first).toContain('AGENTS.md');
    expect(first).toContain('ARCHITECTURE.md');

    const result = await runCli(['init', '--yes', '--agents', 'claude', '--cwd', dir]);
    expect(result.code).toBe(0);
    const after = await listFiles(dir);
    expect(after.filter((file) => file.startsWith('.cursor/'))).toEqual([]);
    expect(after.some((file) => file === 'CLAUDE.md' || file.startsWith('.claude/'))).toBe(true);
    expect(after).toContain('AGENTS.md');
    expect(after).toContain('ARCHITECTURE.md');
  });
});
