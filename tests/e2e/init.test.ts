import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { compareText } from '../../src/compare-text.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';
import { runCli } from '../helpers/run.js';
import { choicePrompt, recordingPrompter } from '../ui/recording-prompter.js';

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

const WRITE: FakeAnswer = { type: 'select', value: 'write' };

const VITE_ANSWERS: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'groupMultiselect', value: [] },
  { type: 'select', value: 'feature-based' },
  { type: 'multiselect', value: ['cursor'] },
  WRITE,
];

const LAYERED_ANSWERS: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'groupMultiselect', value: [] },
  { type: 'select', value: 'layered' },
  { type: 'multiselect', value: ['cursor'] },
  WRITE,
];

/** An up-to-date greenfield re-run only asks Done or Change setup. */
const VITE_RERUN: readonly FakeAnswer[] = [{ type: 'select', value: 'done' }];

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

  it('prints the up-to-date line before any prompt on an interactive re-run', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const digest = await treeDigest(dir);
    const recorded = recordingPrompter([{ type: 'select', value: 'done' }]);
    const again = await runCli(['init', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(again.code).toBe(0);
    expect(again.stdout).toMatch(/Already up to date · \d+ files? for \d+ agents?/);
    const upToDateAt = again.stdout.search(/Already up to date ·/);
    const firstSelect = recorded.calls.find((call) => call.method === 'select');
    expect(firstSelect).toBeDefined();
    if (firstSelect?.method === 'select') {
      expect(choicePrompt(firstSelect).message).toBe('What next?');
      expect(choicePrompt(firstSelect).options.map((option) => option.value)).toEqual(['done', 'change']);
    }
    expect(recorded.calls.some((call) => call.method === 'note')).toBe(false);
    expect(upToDateAt).toBeGreaterThanOrEqual(0);
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('emits JSON after Done on an interactive up-to-date re-run with --json', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const again = await runCli(['init', '--json', '--cwd', dir], interactive([{ type: 'select', value: 'done' }]));
    expect(again.code).toBe(0);
    const parsed: unknown = JSON.parse(again.stdout);
    expect(parsed).toMatchObject({ dryRun: false, upToDate: true });
  });

  it('reaches the review card after Change setup from an up-to-date prompt', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', dir])).code).toBe(0);
    const recorded = recordingPrompter([
      { type: 'select', value: 'change' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'groupMultiselect', value: ['nextjs-app-router'] },
      { type: 'groupMultiselect', value: [] },
      { type: 'select', value: 'feature-based' },
      { type: 'select', value: 'write' },
    ]);
    const again = await runCli(['init', '--agents', 'cursor', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(again.code).toBe(0);
    expect(again.stdout).toMatch(/Already up to date ·/);
    const ready = recorded.calls.filter(
      (call) => call.method === 'note' && typeof call.title === 'string' && call.title.startsWith('Ready to write'),
    );
    expect(ready.length).toBeGreaterThanOrEqual(1);
    expect(recorded.calls.some((call) => {
      if (call.method !== 'select') return false;
      return choicePrompt(call).message.includes('Use this configuration');
    })).toBe(false);
  });

  it('skips the up-to-date shortcut when a managed file was edited by hand', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', dir])).code).toBe(0);
    const managed = path.join(dir, '.cursor/rules/agentinit-nextjs-app-router.mdc');
    await writeFile(managed, `${await readFile(managed, 'utf8')}user edit\n`);
    const recorded = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'select', value: 'write' },
      { type: 'select', value: 'skip' },
    ]);
    const again = await runCli(['init', '--agents', 'cursor', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(again.code).toBe(0);
    expect(again.stdout).not.toMatch(/Already up to date ·/);
    expect(recorded.calls.some((call) => {
      if (call.method !== 'select') return false;
      return choicePrompt(call).message.includes('Use this configuration');
    })).toBe(true);
  });

  it('prints a legacy-agent-file warning once on an interactive re-run', async () => {
    const dir = await copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    await writeFile(path.join(dir, '.cursorrules'), 'legacy\n');
    const warning = '.cursorrules still loads alongside the new rules and will not be modified.';
    const recorded = recordingPrompter([{ type: 'select', value: 'done' }]);
    const again = await runCli(['init', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(again.code).toBe(0);
    const combined = `${again.stdout}\n${again.stderr}`;
    expect(combined.split(warning)).toHaveLength(2);
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
    expect(again.stdout).toMatch(/Already up to date · \d+ files? for \d+ agents?/);
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

    const recorded = recordingPrompter([{ type: 'select', value: 'use' }, WRITE]);
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
    expect(note.message).toContain('Added');
    expect(note.message).toContain('Removed');
    expect(note.message).toContain('Layout');
    expect(note.message).toContain('src/');
    expect(note.message).not.toContain('Package manager');
    expect(note.message).not.toContain('Versions:');

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

  it('shows the review card before writing and writes after Write files', async () => {
    const dir = await copyFixture('next15-src');
    const { readdirSync, statSync } = await import('node:fs');
    const listSync = (root: string, prefix = ''): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(root)) {
        const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
        const absolute = path.join(root, name);
        if (statSync(absolute).isDirectory()) out.push(...listSync(absolute, relative));
        else out.push(relative);
      }
      return out;
    };
    const inner = recordingPrompter([{ type: 'select', value: 'use' }, WRITE]);
    let filesAtCard: string[] | undefined;
    const prompter = {
      select: inner.prompter.select.bind(inner.prompter),
      multiselect: inner.prompter.multiselect.bind(inner.prompter),
      groupMultiselect: inner.prompter.groupMultiselect.bind(inner.prompter),
      confirm: inner.prompter.confirm.bind(inner.prompter),
      info: inner.prompter.info.bind(inner.prompter),
      spinner: inner.prompter.spinner.bind(inner.prompter),
      note(message?: string, title?: string) {
        if (typeof title === 'string' && title.startsWith('Ready to write')) {
          filesAtCard = listSync(dir);
        }
        inner.prompter.note(message, title);
      },
    };

    const result = await runCli(['init', '--agents', 'cursor', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter,
    });
    expect(result.code).toBe(0);
    expect(filesAtCard).toBeDefined();
    expect(filesAtCard).not.toContain('AGENTS.md');
    expect(filesAtCard).not.toContain('.agentinit/manifest.json');
    expect(await listFiles(dir)).toContain('AGENTS.md');
    expect(await listFiles(dir)).toContain('.agentinit/manifest.json');
  });

  it('previews changes without writing, then returns to the card and can write', async () => {
    const dir = await copyFixture('existing-claude-md');
    const before = await treeDigest(dir);
    const recorded = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'select', value: 'preview' },
      WRITE,
      { type: 'select', value: 'adopt' },
    ]);
    const result = await runCli(['init', '--agents', 'claude', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('CLAUDE.md');
    expect(result.stdout).toContain('you decide next');
    expect(result.stdout).toContain('├──');
    expect(await treeDigest(dir)).not.toBe(before);
    expect(await listFiles(dir)).toContain('.agentinit/manifest.json');
    const previewConflicts = recorded.calls.filter(
      (call) => call.method === 'select' && choicePrompt(call).message.includes('already exists'),
    );
    // Conflict prompt only after Write files, not during preview.
    expect(previewConflicts).toHaveLength(1);
    const ready = recorded.calls.filter(
      (call) => call.method === 'note' && typeof call.title === 'string' && call.title.startsWith('Ready to write'),
    );
    expect(ready.length).toBeGreaterThanOrEqual(2);
  });

  it('writes the same files after Write files as --yes', async () => {
    const interactiveDir = await copyFixture('next15-src');
    const yesDir = await copyFixture('next15-src');
    expect(
      (
        await runCli(['init', '--agents', 'cursor', '--cwd', interactiveDir], interactive([
          { type: 'select', value: 'use' },
          WRITE,
        ]))
      ).code,
    ).toBe(0);
    expect((await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', yesDir])).code).toBe(0);
    expect(await treeText(interactiveDir)).toBe(await treeText(yesDir));
  });

  it('change setup can drop a library and the next card shows fewer files', async () => {
    const dir = await copyFixture('shadcn-components-json');
    const recorded = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'select', value: 'change' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'groupMultiselect', value: ['nextjs-app-router'] },
      { type: 'groupMultiselect', value: ['tailwind'] },
      { type: 'select', value: 'feature-based' },
      WRITE,
    ]);
    const result = await runCli(['init', '--agents', 'cursor', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(result.code).toBe(0);
    const ready = recorded.calls.filter(
      (call) => call.method === 'note' && typeof call.title === 'string' && call.title.startsWith('Ready to write'),
    );
    expect(ready).toHaveLength(2);
    const first = ready[0];
    const second = ready[1];
    if (first?.method !== 'note' || second?.method !== 'note') throw new Error('expected review notes');
    const countOf = (title: string | undefined): number => {
      const match = /^Ready to write (\d+) files?$/.exec(title ?? '');
      if (match?.[1] === undefined) throw new Error(`bad review title: ${title ?? ''}`);
      return Number(match[1]);
    };
    expect(countOf(second.title)).toBeLessThan(countOf(first.title));
    expect(await listFiles(dir).then((files) => files.some((file) => file.includes('shadcn')))).toBe(false);
  });

  it('preselects greenfield answers on change setup', async () => {
    const dir = await emptyDir();
    const recorded = recordingPrompter([
      { type: 'select', value: 'react-vite' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'groupMultiselect', value: [] },
      { type: 'select', value: 'feature-based' },
      { type: 'multiselect', value: ['cursor'] },
      { type: 'select', value: 'change' },
      { type: 'select', value: 'react-vite' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'groupMultiselect', value: [] },
      { type: 'select', value: 'layered' },
      { type: 'multiselect', value: ['cursor'] },
      WRITE,
    ]);
    const result = await runCli(['init', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(result.code).toBe(0);
    const selects = recorded.calls.filter((call) => call.method === 'select');
    // Pass 2: framework (4), language (5), architecture (6) keep the first-pass initials.
    expect(choicePrompt(selects[4]).initialValue).toBe('react-vite');
    expect(choicePrompt(selects[5]).initialValue).toBe('typescript-strict');
    expect(choicePrompt(selects[6]).initialValue).toBe('feature-based');
    expect(await readFile(path.join(dir, 'ARCHITECTURE.md'), 'utf8')).toContain('src/domain/');
  });

  it('skips the review card with --yes and --dry-run', async () => {
    const yesDir = await copyFixture('next15-src');
    const yes = await runCli(['init', '--yes', '--agents', 'cursor', '--cwd', yesDir], {
      stdinTTY: true,
      stdoutTTY: true,
    });
    expect(yes.code).toBe(0);
    expect(yes.stdout).not.toContain('Ready to write');
    expect(yes.stdout).not.toContain('What next?');

    const dryDir = await copyFixture('next15-src');
    const dry = await runCli(['init', '--dry-run', '--agents', 'cursor', '--cwd', dryDir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: createFakePrompter([{ type: 'select', value: 'use' }]),
    });
    expect(dry.code).toBe(0);
    expect(dry.stdout).not.toContain('Ready to write');
    expect(await listFiles(dryDir)).not.toContain('.agentinit/manifest.json');
  });

  it('conflict count on the card matches later conflict prompts', async () => {
    const dir = await copyFixture('existing-claude-md');
    const recorded = recordingPrompter([
      { type: 'select', value: 'use' },
      WRITE,
      { type: 'select', value: 'adopt' },
    ]);
    const result = await runCli(['init', '--agents', 'claude', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: recorded.prompter,
    });
    expect(result.code).toBe(0);
    const ready = recorded.calls.find(
      (call) => call.method === 'note' && typeof call.title === 'string' && call.title.startsWith('Ready to write'),
    );
    if (ready?.method !== 'note') throw new Error('expected a review note');
    expect(ready.message).toMatch(/1 existing file needs your decision/);
    const conflictAsks = recorded.calls.filter(
      (call) => call.method === 'select' && choicePrompt(call).message.includes('CLAUDE.md'),
    );
    expect(conflictAsks).toHaveLength(1);
  });

  it('cancel at the review card exits 130 with nothing written', async () => {
    const dir = await copyFixture('next15-src');
    const digest = await treeDigest(dir);
    const result = await runCli(['init', '--agents', 'cursor', '--cwd', dir], interactive([
      { type: 'select', value: 'use' },
      { type: 'cancel' },
    ]));
    expect(result.code).toBe(130);
    expect(await treeDigest(dir)).toBe(digest);
    expect(await listFiles(dir)).not.toContain('.agentinit/manifest.json');
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
