import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { compareText } from '../../src/compare-text.js';
import { removeBlock } from '../../src/io/managed-block.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';
import { runCli } from '../helpers/run.js';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
const directories: string[] = [];

const FIX = 'npx @agentinit/cli init';

const doctorIssueSchema = z
  .object({
    kind: z.enum([
      'not-initialized',
      'missing',
      'edited',
      'outdated',
      'unmanaged',
      'stale',
      'unselected',
      'package-removed',
      'unsupported-version',
      'always-on-tokens',
      'legacy-file',
    ]),
    path: z.string().optional(),
    message: z.string().min(1),
    fix: z.string().min(1),
  })
  .strict();

const doctorReportSchema = z
  .object({
    ok: z.boolean(),
    issues: z.array(doctorIssueSchema),
  })
  .strict()
  .superRefine((report, ctx) => {
    if (report.ok !== (report.issues.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'ok must be true only when issues is empty' });
    }
  });

const VITE_ANSWERS: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'multiselect', value: [] },
  { type: 'select', value: 'feature-based' },
  { type: 'multiselect', value: ['cursor'] },
  { type: 'select', value: 'write' },
];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function emptyDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-doctor-'));
  directories.push(dir);
  return dir;
}

async function copyFixture(name: string): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), 'agentinit-doctor-'));
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

async function initYes(name: string): Promise<string> {
  const dir = await copyFixture(name);
  const result = await runCli(['init', '--yes', '--cwd', dir]);
  expect(result.code).toBe(0);
  return dir;
}

async function readPackage(dir: string): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

async function writePackage(dir: string, manifest: unknown): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function parseReport(stdout: string): z.infer<typeof doctorReportSchema> {
  const parsed: unknown = JSON.parse(stdout);
  return doctorReportSchema.parse(parsed);
}

describe('doctor', () => {
  it('reports no issues for a freshly initialized project', async () => {
    const dir = await initYes('next15-src');
    const digest = await treeDigest(dir);
    const result = await runCli(['doctor', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('No issues found.\n');
    expect(result.stderr).toBe('');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('prints a one-line header and six passing checks on a terminal', async () => {
    const dir = await initYes('next15-src');
    const result = await runCli(['doctor', '--cwd', dir], { stdoutTTY: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('agentinit doctor');
    expect(result.stdout).not.toContain('rules for the agents in this repo');
    expect(result.stdout).toContain('manifest');
    expect(result.stdout).toContain('managed files');
    expect(result.stdout).toContain('detected packages');
    expect(result.stdout).toContain('package versions');
    expect(result.stdout).toContain('token budget');
    expect(result.stdout).toContain('legacy files');
    expect(result.stdout.split('No issues found.')).toHaveLength(2);
  });

  it('shows a failing check with its issue and fix on a terminal', async () => {
    const dir = await copyFixture('next15-src');
    const result = await runCli(['doctor', '--cwd', dir], { stdoutTTY: true });
    expect(result.code).toBe(2);
    expect(result.stdout).toContain('agentinit doctor');
    expect(result.stdout).toContain('manifest');
    expect(result.stdout).toContain('Not initialized');
    expect(result.stdout).toContain(`Fix: ${FIX}`);
    expect(result.stdout).toContain('1 issue found.');
    // Later checks never ran without a manifest — do not paint them as passes.
    expect(result.stdout).not.toContain('managed files');
    expect(result.stdout).not.toContain('detected packages');
    expect(result.stdout).not.toContain('rules for the agents in this repo');
  });

  it('ignores --agents and keeps the manifest selection', async () => {
    const dir = await initYes('next15-src');
    const result = await runCli(['doctor', '--agents', 'cursor', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('No issues found.\n');
  });

  it('reports no issues for a freshly initialized greenfield project', async () => {
    const dir = await emptyDir();
    const init = await runCli(['init', '--cwd', dir], {
      stdinTTY: true,
      stdoutTTY: true,
      prompter: createFakePrompter(VITE_ANSWERS),
    });
    expect(init.code).toBe(0);
    const result = await runCli(['doctor', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('No issues found.\n');
  });

  it('does not treat a project with no supported framework as an issue', async () => {
    const dir = await initYes('node-cli-ts');
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const report = parseReport(result.stdout);
    expect(report).toEqual({ ok: true, issues: [] });
  });

  it('leaves an uninitialized project byte-for-byte unchanged', async () => {
    const dir = await copyFixture('next15-src');
    const digest = await treeDigest(dir);
    const result = await runCli(['doctor', '--cwd', dir]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe(`Not initialized\n  Fix: ${FIX}\n`);
    expect(await listFiles(dir)).not.toContain('.agentinit/manifest.json');
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('exits 2 when a supported package is added and writes nothing', async () => {
    const dir = await initYes('next15-src');
    const manifest = await readPackage(dir);
    manifest.dependencies = { ...manifest.dependencies, zustand: '5.0.0' };
    await writePackage(dir, manifest);
    const digest = await treeDigest(dir);

    const result = await runCli(['doctor', '--cwd', dir]);
    expect(result.code).toBe(2);
    expect(result.stdout).toContain('Not selected');
    expect(result.stdout).toContain('Zustand (zustand) matches this project and is not selected.');
    expect(result.stdout).toContain(`Fix: ${FIX}`);
    expect(await treeDigest(dir)).toBe(digest);
  });

  it('reports a missing managed file', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    await unlink(path.join(dir, file));
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'missing',
      path: file,
      message: `${file} is missing.`,
      fix: FIX,
    });
  });

  it('reports a managed file edited by hand', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    const absolute = path.join(dir, file);
    await writeFile(absolute, `${await readFile(absolute, 'utf8')}user edit\n`);
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'edited',
      path: file,
      message: `${file} was edited by hand.`,
      fix: FIX,
    });
  });

  it('reports a missing managed block', async () => {
    const dir = await initYes('next15-src');
    const absolute = path.join(dir, 'AGENTS.md');
    const current = await readFile(absolute, 'utf8');
    await writeFile(absolute, removeBlock(current, 'core', 'AGENTS.md'));
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'missing',
      path: 'AGENTS.md#core',
      message: 'AGENTS.md is missing managed block "core".',
      fix: FIX,
    });
  });

  it('reports a required fragment whose package was removed', async () => {
    const dir = await copyFixture('next15-src');
    const before = await readPackage(dir);
    before.devDependencies = { ...before.devDependencies, tailwindcss: '4.1.0' };
    await writePackage(dir, before);
    await writeFile(path.join(dir, 'components.json'), '{}\n');
    const init = await runCli(['init', '--yes', '--cwd', dir]);
    expect(init.code).toBe(0);

    const manifestPath = path.join(dir, '.agentinit/manifest.json');
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      selections: { libraries: string[] };
    };
    expect(saved.selections.libraries).toContain('shadcn');
    expect(saved.selections.libraries).toContain('tailwind');
    saved.selections.libraries = saved.selections.libraries.filter((id) => id !== 'tailwind');
    await writeFile(manifestPath, `${JSON.stringify(saved, null, 2)}\n`);

    const after = await readPackage(dir);
    delete after.devDependencies?.tailwindcss;
    await writePackage(dir, after);

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'package-removed',
      message: 'Tailwind CSS (tailwind) is selected, but tailwindcss is not in the project.',
      fix: FIX,
    });
  });

  it('reports a selected fragment whose package was removed', async () => {
    const dir = await initYes('next15-src');
    const manifest = await readPackage(dir);
    delete manifest.dependencies?.next;
    await writePackage(dir, manifest);
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'package-removed',
      message: 'Next.js App Router (nextjs-app-router) is selected, but next is not in the project.',
      fix: FIX,
    });
  });

  it('reports a selected fragment whose version left appliesTo', async () => {
    const dir = await initYes('next15-src');
    const manifest = await readPackage(dir);
    if (manifest.dependencies === undefined) throw new Error('fixture has no dependencies');
    manifest.dependencies.next = '15.0.0';
    await writePackage(dir, manifest);
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'unsupported-version',
      message: 'Next.js App Router (nextjs-app-router) is selected, but next@15.0.0 is outside >=16.3.0.',
      fix: FIX,
    });
  });

  it('reports legacy rule files', async () => {
    const dir = await initYes('next15-src');
    await writeFile(path.join(dir, '.cursorrules'), 'legacy\n');
    await writeFile(path.join(dir, '.windsurfrules'), 'legacy\n');
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toEqual([
      {
        kind: 'legacy-file',
        path: '.cursorrules',
        message: '.cursorrules still loads alongside the new rules.',
        fix: 'Remove .cursorrules if you no longer need it.',
      },
      {
        kind: 'legacy-file',
        path: '.windsurfrules',
        message: '.windsurfrules still loads alongside the new rules.',
        fix: 'Remove .windsurfrules if you no longer need it.',
      },
    ]);
  });

  it('validates --json against the doctor report schema', async () => {
    const cleanDir = await initYes('next15-src');
    const clean = await runCli(['doctor', '--json', '--cwd', cleanDir]);
    expect(clean.code).toBe(0);
    expect(clean.stderr).toBe('');
    expect(parseReport(clean.stdout)).toEqual({ ok: true, issues: [] });

    const dirtyDir = await copyFixture('next15-src');
    const dirty = await runCli(['doctor', '--json', '--cwd', dirtyDir]);
    expect(dirty.code).toBe(2);
    const report = parseReport(dirty.stdout);
    expect(report.ok).toBe(false);
    expect(report.issues[0]).toMatchObject({
      kind: 'not-initialized',
      message: 'Not initialized',
      fix: FIX,
    });
  });

  it('Exits 0 on a freshly initialized project and 2 after adding a supported package to package.json', async () => {
    const dir = await initYes('next15-src');
    const fresh = await runCli(['doctor', '--cwd', dir]);
    expect(fresh.code).toBe(0);
    expect(fresh.stdout).toBe('No issues found.\n');

    const manifest = await readPackage(dir);
    manifest.dependencies = { ...manifest.dependencies, zustand: '5.0.0' };
    await writePackage(dir, manifest);
    const dirty = await runCli(['doctor', '--cwd', dir]);
    expect(dirty.code).toBe(2);
    expect(dirty.stdout).toContain('zustand');
  });

  it('Never modifies any file', async () => {
    const freshDir = await initYes('next15-src');
    const freshDigest = await treeDigest(freshDir);
    expect((await runCli(['doctor', '--cwd', freshDir])).code).toBe(0);
    expect(await treeDigest(freshDir)).toBe(freshDigest);

    const dirtyDir = await initYes('next15-src');
    const manifest = await readPackage(dirtyDir);
    manifest.dependencies = { ...manifest.dependencies, zustand: '5.0.0' };
    await writePackage(dirtyDir, manifest);
    const dirtyDigest = await treeDigest(dirtyDir);
    expect((await runCli(['doctor', '--cwd', dirtyDir])).code).toBe(2);
    expect(await treeDigest(dirtyDir)).toBe(dirtyDigest);

    const plain = await copyFixture('next15-src');
    const plainDigest = await treeDigest(plain);
    expect((await runCli(['doctor', '--cwd', plain])).code).toBe(2);
    expect(await treeDigest(plain)).toBe(plainDigest);
  });

  it('exits 1 for an unsupported project and writes nothing', async () => {
    const dir = await copyFixture('js-only');
    const digest = await treeDigest(dir);
    const result = await runCli(['doctor', '--cwd', dir]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("JavaScript projects aren't supported yet");
    expect(result.stdout).toBe('');
    expect(await treeDigest(dir)).toBe(digest);
  });
});
