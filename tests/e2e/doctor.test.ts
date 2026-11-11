import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { compareText } from '../../src/compare-text.js';
import { contentHash } from '../../src/io/hash.js';
import { removeBlock } from '../../src/io/managed-block.js';
import { stripAnsi } from '../../src/ui/align.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';
import pkg from '../../package.json' with { type: 'json' };
import { runCli } from '../helpers/run.js';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
const directories: string[] = [];

const FIX = 'npx @agentinit/cli init';

const EDITED_RULE_FIX =
  'Run `npx @agentinit/cli init` and choose Backup & replace, or exclude nextjs-app-router under Customize.';

const doctorIssueSchema = z
  .object({
    kind: z.enum([
      'not-initialized',
      'manifest-invalid',
      'missing',
      'edited',
      'outdated',
      'rules-update',
      'unmanaged',
      'stale',
      'unselected',
      'package-removed',
      'unsupported-version',
      'always-on-tokens',
      'legacy-file',
    ]),
    severity: z.enum(['error', 'warning']),
    path: z.string().optional(),
    message: z.string().min(1),
    fix: z.string().min(1),
  })
  .strict();

const doctorReportSchema = z
  .object({
    ok: z.boolean(),
    issues: z.array(doctorIssueSchema),
    notices: z.array(z.string()),
  })
  .strict()
  .superRefine((report, ctx) => {
    const hasError = report.issues.some((issue) => issue.severity === 'error');
    if (report.ok !== !hasError) {
      ctx.addIssue({ code: 'custom', message: 'ok must be true only when there are no errors' });
    }
  });

const VITE_ANSWERS: readonly FakeAnswer[] = [
  { type: 'select', value: 'react-vite' },
  { type: 'select', value: 'typescript-strict' },
  { type: 'groupMultiselect', value: [] },
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

interface AgentInitManifest {
  cliVersion: string;
  files: Record<string, { sha256: string }>;
}

async function readAgentInitManifest(dir: string): Promise<AgentInitManifest> {
  return JSON.parse(await readFile(path.join(dir, '.agentinit/manifest.json'), 'utf8')) as AgentInitManifest;
}

async function writeAgentInitManifest(dir: string, manifest: AgentInitManifest): Promise<void> {
  await writeFile(path.join(dir, '.agentinit/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function setManifestCliVersion(dir: string, cliVersion: string): Promise<void> {
  const manifest = await readAgentInitManifest(dir);
  manifest.cliVersion = cliVersion;
  await writeAgentInitManifest(dir, manifest);
}

/**
 * Change an owned file and refresh its manifest hash so doctor sees `update`
 * (content differs from the plan) rather than `edited` (hash mismatch).
 */
async function simulateOwnedContentDrift(dir: string, relativePath: string, cliVersion: string): Promise<void> {
  const absolute = path.join(dir, relativePath);
  const next = `${await readFile(absolute, 'utf8')}\n<!-- agentinit: simulated drift -->\n`;
  await writeFile(absolute, next);
  const manifest = await readAgentInitManifest(dir);
  const entry = manifest.files[relativePath];
  if (entry === undefined) throw new Error(`manifest missing ${relativePath}`);
  entry.sha256 = contentHash(next);
  manifest.cliVersion = cliVersion;
  await writeAgentInitManifest(dir, manifest);
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
    const stdout = stripAnsi(result.stdout);
    expect(result.code).toBe(0);
    // Color paints the name and command separately; match the visible header.
    expect(stdout).toContain('agentinit doctor');
    expect(stdout).not.toContain('rules for the agents in this repo');
    expect(stdout).toContain('manifest');
    expect(stdout).toContain('managed files');
    expect(stdout).toContain('detected packages');
    expect(stdout).toContain('package versions');
    expect(stdout).toContain('token budget');
    expect(stdout).toContain('legacy files');
    expect(stdout.split('No issues found.')).toHaveLength(2);
  });

  it('shows a failing check with its issue and fix on a terminal', async () => {
    const dir = await copyFixture('next15-src');
    const result = await runCli(['doctor', '--cwd', dir], { stdoutTTY: true });
    const stdout = stripAnsi(result.stdout);
    expect(result.code).toBe(2);
    expect(stdout).toContain('agentinit doctor');
    expect(stdout).toContain('manifest');
    expect(stdout).toContain('Not initialized');
    expect(stdout).toContain(`Fix: ${FIX}`);
    expect(stdout).toContain('1 error found.');
    // Later checks never ran without a manifest — do not paint them as passes.
    expect(stdout).not.toContain('managed files');
    expect(stdout).not.toContain('detected packages');
    expect(stdout).not.toContain('rules for the agents in this repo');
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
    expect(report).toEqual({ ok: true, issues: [], notices: [] });
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
      severity: 'error',
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
      severity: 'error',
      path: file,
      message: `${file} was edited by hand.`,
      fix: EDITED_RULE_FIX,
    });
  });

  it('warns with rules-update when generated content drifted under an older cliVersion', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    await simulateOwnedContentDrift(dir, file, '0.0.9');

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.notices).toEqual([`Set up with agentinit 0.0.9 · running ${pkg.version}`]);
    expect(report.issues).toContainEqual({
      kind: 'rules-update',
      severity: 'warning',
      path: file,
      message: `${file} was generated by agentinit 0.0.9. agentinit ${pkg.version} generates different rules.`,
      fix: `npx @agentinit/cli@${pkg.version} init`,
    });

    const tty = await runCli(['doctor', '--cwd', dir], { stdoutTTY: true });
    const stdout = stripAnsi(tty.stdout);
    expect(tty.code).toBe(0);
    expect(stdout).toContain('was generated by agentinit');
    expect(stdout).toContain('0.0.9');
    // Warn glyph is ▲ (unicode) or ! (ASCII / TERM=dumb).
    expect(stdout).toMatch(/[!▲] {2}managed files/);
    expect(stdout).toContain('1 warning found.');
  });

  it('reports outdated when the same drift happens under the running cliVersion', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    await simulateOwnedContentDrift(dir, file, pkg.version);

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'outdated',
      severity: 'error',
      path: file,
      message: `${file} does not match the generated rules.`,
      fix: FIX,
    });
  });

  it('still reports edited when cliVersion differs from the running CLI', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    const absolute = path.join(dir, file);
    await writeFile(absolute, `${await readFile(absolute, 'utf8')}user edit\n`);
    await setManifestCliVersion(dir, '0.0.9');

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.issues).toContainEqual({
      kind: 'edited',
      severity: 'error',
      path: file,
      message: `${file} was edited by hand.`,
      fix: EDITED_RULE_FIX,
    });
  });

  it('tells the user to upgrade doctor when the manifest is from a newer CLI', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    await simulateOwnedContentDrift(dir, file, '0.2.0');

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const report = parseReport(result.stdout);
    expect(report.notices).toEqual([`Set up with agentinit 0.2.0 · running ${pkg.version}`]);
    expect(report.issues).toContainEqual({
      kind: 'rules-update',
      severity: 'warning',
      path: file,
      message: `${file} was generated by a newer agentinit (0.2.0).`,
      fix: 'Run doctor with `@agentinit/cli@0.2.0` or newer.',
    });
  });

  it('parses unknown manifest keys and treats them like an unchanged manifest', async () => {
    const dir = await initYes('next15-src');
    const manifestPath = path.join(dir, '.agentinit/manifest.json');
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      selections: Record<string, unknown>;
      files: Record<string, Record<string, unknown>>;
      [key: string]: unknown;
    };
    saved.schemaHint = 2;
    saved.selections.futureFlag = true;
    const firstFile = Object.keys(saved.files)[0];
    expect(firstFile).toBeDefined();
    if (firstFile === undefined) return;
    const entry = saved.files[firstFile];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    entry.etag = 'keep-me';
    await writeFile(manifestPath, `${JSON.stringify(saved, null, 2)}\n`);

    const withExtras = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(withExtras.code).toBe(0);
    expect(parseReport(withExtras.stdout)).toEqual({ ok: true, issues: [], notices: [] });
  });

  it('warns and continues when cliVersion is invalid', async () => {
    const dir = await initYes('next15-src');
    const manifestPath = path.join(dir, '.agentinit/manifest.json');
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as { cliVersion: string };
    saved.cliVersion = 'not-a-version';
    await writeFile(manifestPath, `${JSON.stringify(saved, null, 2)}\n`);

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.notices).toEqual([`Set up with agentinit not-a-version · running ${pkg.version}`]);
    expect(report.issues).toEqual([]);
  });

  it('clears rules-update after init --yes with the current CLI', async () => {
    const dir = await initYes('next15-src');
    const file = '.cursor/rules/agentinit-nextjs-app-router.mdc';
    await simulateOwnedContentDrift(dir, file, '0.0.9');
    expect((await runCli(['doctor', '--cwd', dir])).code).toBe(0);

    const init = await runCli(['init', '--yes', '--cwd', dir]);
    expect(init.code).toBe(0);
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    expect(parseReport(result.stdout)).toEqual({ ok: true, issues: [], notices: [] });
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
      severity: 'error',
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
      severity: 'error',
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
      severity: 'error',
      message: 'Next.js App Router 16 (nextjs-app-router) is selected, but next is not in the project.',
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
      severity: 'error',
      message: 'Next.js App Router 16 (nextjs-app-router) is selected, but next@15.0.0 is outside >=16.3.0.',
      fix: FIX,
    });
  });

  it('reports legacy rule files as warnings and exits 0', async () => {
    const dir = await initYes('next15-src');
    await writeFile(path.join(dir, '.cursorrules'), 'legacy\n');
    await writeFile(path.join(dir, '.windsurfrules'), 'legacy\n');
    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(0);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([
      {
        kind: 'legacy-file',
        severity: 'warning',
        path: '.cursorrules',
        message: '.cursorrules still loads alongside the new rules.',
        fix: 'Remove .cursorrules if you no longer need it.',
      },
      {
        kind: 'legacy-file',
        severity: 'warning',
        path: '.windsurfrules',
        message: '.windsurfrules still loads alongside the new rules.',
        fix: 'Remove .windsurfrules if you no longer need it.',
      },
    ]);
  });

  it('shows a warning icon for legacy files on a terminal', async () => {
    const dir = await initYes('next15-src');
    await writeFile(path.join(dir, '.cursorrules'), 'legacy\n');
    const result = await runCli(['doctor', '--cwd', dir], { stdoutTTY: true });
    const stdout = stripAnsi(result.stdout);
    expect(result.code).toBe(0);
    expect(stdout).toContain('.cursorrules still loads alongside the new rules.');
    expect(stdout).toContain('1 warning found.');
  });

  it('skips unselected for excluded fragments and keeps them out of init --yes', async () => {
    const dir = await initYes('next15-src');
    const manifestPath = path.join(dir, '.agentinit/manifest.json');
    const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      selections: { libraries: string[]; excluded: string[] };
    };
    const pkg = await readPackage(dir);
    pkg.dependencies = { ...pkg.dependencies, zustand: '5.0.0' };
    await writePackage(dir, pkg);
    saved.selections.excluded = ['zustand'];
    await writeFile(manifestPath, `${JSON.stringify(saved, null, 2)}\n`);

    const doctor = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(doctor.code).toBe(0);
    expect(parseReport(doctor.stdout)).toEqual({ ok: true, issues: [], notices: [] });

    const again = await runCli(['init', '--yes', '--cwd', dir]);
    expect(again.code).toBe(0);
    const after = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      selections: { libraries: string[]; excluded: string[] };
    };
    expect(after.selections.libraries).not.toContain('zustand');
    expect(after.selections.excluded).toEqual(['zustand']);
  });

  it('validates --json against the doctor report schema', async () => {
    const cleanDir = await initYes('next15-src');
    const clean = await runCli(['doctor', '--json', '--cwd', cleanDir]);
    expect(clean.code).toBe(0);
    expect(clean.stderr).toBe('');
    expect(parseReport(clean.stdout)).toEqual({ ok: true, issues: [], notices: [] });

    const dirtyDir = await copyFixture('next15-src');
    const dirty = await runCli(['doctor', '--json', '--cwd', dirtyDir]);
    expect(dirty.code).toBe(2);
    const report = parseReport(dirty.stdout);
    expect(report.ok).toBe(false);
    expect(report.issues[0]).toMatchObject({
      kind: 'not-initialized',
      severity: 'error',
      message: 'Not initialized',
      fix: FIX,
    });
  });

  it.each([
    {
      name: 'corrupt JSON',
      prepare: async (dir: string): Promise<void> => {
        await writeFile(path.join(dir, '.agentinit/manifest.json'), '{ not json\n');
      },
      message: '.agentinit/manifest.json: invalid JSON.',
    },
    {
      name: 'a schema mismatch',
      prepare: async (dir: string): Promise<void> => {
        await writeFile(path.join(dir, '.agentinit/manifest.json'), `${JSON.stringify({ cliVersion: '0.1.0' })}\n`);
      },
      message: /mode|selections|fragments|files/u,
    },
    {
      name: 'unreadable',
      prepare: async (dir: string): Promise<void> => {
        const manifestPath = path.join(dir, '.agentinit/manifest.json');
        await unlink(manifestPath);
        await mkdir(manifestPath);
      },
      message: '.agentinit/manifest.json is a directory.',
    },
  ])('exits 2 with manifest-invalid when the manifest is $name', async ({ prepare, message }) => {
    const dir = await initYes('next15-src');
    await prepare(dir);
    const digest = await treeDigest(dir);

    const result = await runCli(['doctor', '--json', '--cwd', dir]);
    expect(result.code).toBe(2);
    const report = parseReport(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.issues).toHaveLength(1);
    const issue = report.issues[0];
    expect(issue).toMatchObject({
      kind: 'manifest-invalid',
      severity: 'error',
      fix: 'Fix .agentinit/manifest.json, or delete it and run `agentinit init` again.',
    });
    if (typeof message === 'string') expect(issue?.message).toBe(message);
    else expect(issue?.message).toMatch(message);
    expect(await treeDigest(dir)).toBe(digest);
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
