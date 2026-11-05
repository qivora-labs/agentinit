import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTempProject } from './project.js';
import { runCli } from '../helpers/run.js';
import {
  KEY,
  assertFramedRail,
  assertLinesFit,
  runPtyScreen,
  type PtyKey,
} from '../helpers/pty.js';

const execFileAsync = promisify(execFile);
const skipWindows = process.platform === 'win32';

const enterWhen = (waitFor: RegExp | string): PtyKey => ({ key: KEY.enter, waitFor });

const WIDTHS = [72, 120] as const;

const existingKeys: readonly PtyKey[] = [
  enterWhen(/Use this configuration/),
  enterWhen(/Not sure about the architecture/),
  enterWhen(/Which agents/),
  enterWhen(/What next\?/),
];

const greenfieldKeys: readonly PtyKey[] = [
  enterWhen(/Which framework/),
  enterWhen(/How strict/),
  enterWhen(/Which libraries/),
  enterWhen(/Which architecture/),
  enterWhen(/Which agents/),
  enterWhen(/What next\?/),
];

const conflictKeys: readonly PtyKey[] = [
  enterWhen(/Use this configuration/),
  enterWhen(/Not sure about the architecture/),
  enterWhen(/What next\?/),
  enterWhen(/Adopt|already exists/),
];

describe.skipIf(skipWindows)('terminal screens', () => {
  const projects = createTempProject('agentinit-screens-');
  const emptyDirs: string[] = [];

  beforeAll(async () => {
    await execFileAsync('pnpm', ['build'], {
      cwd: path.resolve(import.meta.dirname, '../..'),
      env: process.env,
    });
  }, 120_000);

  afterEach(async () => {
    await projects.cleanup();
    await Promise.all(emptyDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  async function emptyProject(): Promise<string> {
    const parent = await mkdtemp(path.join(tmpdir(), 'agentinit-screens-empty-'));
    emptyDirs.push(parent);
    const dir = path.join(parent, 'project');
    await mkdir(dir);
    return dir;
  }

  function checkScreen(screen: string, cols: number): void {
    assertLinesFit(screen, cols);
    assertFramedRail(screen);
  }

  async function snapshot(label: string, cols: number, screen: string): Promise<void> {
    checkScreen(screen, cols);
    await expect(`${screen}\n`).toMatchFileSnapshot(`../__snapshots__/e2e/screens/${label}-${String(cols)}.txt`);
  }

  it.each(WIDTHS)('existing project next15-src at %i columns', async (cols) => {
    const dir = await projects.copyFixture('next15-src');
    const result = await runPtyScreen({
      args: ['init', '--cwd', dir],
      cwd: dir,
      cols,
      keys: existingKeys,
    });
    expect(result.exitCode).toBe(0);
    expect(result.screens.length).toBe(5);

    const [detection, architecture, agents, review, report] = result.screens;
    expect(detection).toMatch(/Detected next15-src/);
    expect(detection).toMatch(/Use this configuration/);
    expect(detection).toMatch(/unsure/);
    expect(detection).not.toMatch(/likely/);
    await snapshot('existing-detection', cols, detection ?? '');

    expect(architecture).toMatch(/Not sure about the architecture/);
    await snapshot('existing-architecture', cols, architecture ?? '');

    expect(agents).toMatch(/Which agents/);
    await snapshot('existing-agents', cols, agents ?? '');

    expect(review).toMatch(/Ready to write/);
    expect(review).toMatch(/What next/);
    await snapshot('existing-review', cols, review ?? '');

    expect(report).toMatch(/Wrote \d+ files/);
    expect(report).toMatch(/Next steps/);
    expect(report).toMatch(/Done\./);
    await snapshot('existing-report', cols, report ?? '');
  }, 90_000);

  it.each(WIDTHS)('greenfield wizard and next steps at %i columns', async (cols) => {
    const dir = await emptyProject();
    const result = await runPtyScreen({
      args: ['init', '--cwd', dir],
      cwd: dir,
      cols,
      keys: greenfieldKeys,
    });
    expect(result.exitCode).toBe(0);
    expect(result.screens.length).toBe(7);

    const labels = [
      'greenfield-framework',
      'greenfield-typescript',
      'greenfield-libraries',
      'greenfield-architecture',
      'greenfield-agents',
      'greenfield-review',
      'greenfield-report',
    ] as const;
    const markers = [
      /Which framework/,
      /How strict/,
      /Which libraries/,
      /Which architecture/,
      /Which agents/,
      /What next/,
      /Next steps/,
    ];
    for (let index = 0; index < labels.length; index += 1) {
      const screen = result.screens[index] ?? '';
      expect(screen).toMatch(markers[index] ?? /./);
      await snapshot(labels[index] ?? 'greenfield', cols, screen);
    }
    expect(result.screen).toMatch(/create vite/);
  }, 120_000);

  it.each(WIDTHS)('conflict diff and question at %i columns', async (cols) => {
    const dir = await projects.copyFixture('existing-claude-md');
    const result = await runPtyScreen({
      args: ['init', '--agents', 'claude', '--cwd', dir],
      cwd: dir,
      cols,
      keys: conflictKeys,
    });
    expect(result.exitCode).toBe(0);
    const conflict = result.screens.find((screen) => screen.includes('Adopt') || screen.includes('already exists'));
    expect(conflict).toBeDefined();
    expect(conflict).toMatch(/CLAUDE\.md/);
    expect(conflict).toMatch(/\+|Adopt/);
    await snapshot('conflict-prompt', cols, conflict ?? '');
    await snapshot('conflict-report', cols, result.screen);
  }, 90_000);

  it.each(WIDTHS)('up-to-date re-run at %i columns', async (cols) => {
    const dir = await projects.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);
    const result = await runPtyScreen({
      args: ['init', '--cwd', dir],
      cwd: dir,
      cols,
      keys: [enterWhen(/What next\?|Done/)],
    });
    expect(result.exitCode).toBe(0);
    expect(result.screens[0]).toMatch(/Already up to date/);
    await snapshot('uptodate-prompt', cols, result.screens[0] ?? '');
    await snapshot('uptodate-done', cols, result.screen);
  }, 90_000);

  it.each(WIDTHS)('doctor healthy and with one issue at %i columns', async (cols) => {
    const dir = await projects.copyFixture('next15-src');
    expect((await runCli(['init', '--yes', '--cwd', dir])).code).toBe(0);

    const healthy = await runPtyScreen({
      args: ['doctor', '--cwd', dir],
      cwd: dir,
      cols,
      keys: [],
      timeoutMs: 30_000,
    });
    // doctor exits without prompts; wait for exit only.
    expect(healthy.exitCode).toBe(0);
    expect(healthy.screen).toMatch(/No issues found/);
    await snapshot('doctor-healthy', cols, healthy.screen);

    const edited = path.join(dir, '.cursor/rules/agentinit-nextjs-app-router.mdc');
    await writeFile(edited, `${await readFile(edited, 'utf8')}user edit\n`);

    const issue = await runPtyScreen({
      args: ['doctor', '--cwd', dir],
      cwd: dir,
      cols,
      keys: [],
      timeoutMs: 30_000,
    });
    expect(issue.exitCode).toBe(2);
    expect(issue.screen).toMatch(/error/);
    await snapshot('doctor-issue', cols, issue.screen);
  }, 120_000);

  it.each([
    { name: 'nocolor', env: { NO_COLOR: '1' } },
    { name: 'dumb', env: { TERM: 'dumb', NO_COLOR: '1' } },
  ] as const)('existing report with $name', async ({ name, env }) => {
    const cols = 72;
    const dir = await projects.copyFixture('next15-src');
    const result = await runPtyScreen({
      args: ['init', '--cwd', dir],
      cwd: dir,
      cols,
      env,
      keys: existingKeys,
    });
    expect(result.exitCode).toBe(0);
    expect(result.screen.includes('\u001b[')).toBe(false);
    if (name === 'dumb') {
      expect(result.screen).toMatch(/AGENT\s+INIT/);
      expect(result.screen).not.toContain('█████');
    }
    await snapshot(`existing-report-${name}`, cols, result.screen);
  }, 90_000);
});
