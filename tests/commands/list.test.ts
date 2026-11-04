import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { list } from '../../src/commands/list.js';
import { createRunContext } from '../../src/context.js';
import { AgentInitError } from '../../src/errors.js';
import { createLogger } from '../../src/ui/logger.js';
import { captureStream, runCli } from '../helpers/run.js';

const sampleDir = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));
const multipleDir = fileURLToPath(new URL('../fixtures/registry-invalid/multiple', import.meta.url));

const SAMPLE_TEXT = [
  'architecture',
  '  layered              Layered               One direction of dependencies.',
  '',
  'language',
  '  typescript           TypeScript            TypeScript without strict compiler options.',
  '  typescript-strict    TypeScript strict     Strict TypeScript for application and test code.',
  '',
  'framework',
  '  nextjs-app-router    Next.js App Router    React Server Components by default.',
  '  nextjs-pages-router  Next.js Pages Router  Page-based Next.js routing.',
  '',
  'library',
  '  forms                Forms                 Form state and validation.',
  '  shadcn               shadcn/ui             Accessible components from a local registry.',
  '  tailwind             Tailwind CSS          Utility-first styling.',
  '  vitest               Vitest                Unit tests on Vite.',
  '  zustand              Zustand               Small client-side state.',
  '',
  'workflow',
  '  new-feature          New feature           Plan and implement a feature.',
  '  review-arch          Review architecture   Read-only architecture review.',
].join('\n');

const SAMPLE_JSON = [
  {
    id: 'layered',
    name: 'Layered',
    category: 'architecture',
    version: '1.0.0',
    description: 'One direction of dependencies.',
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    category: 'language',
    version: '1.0.0',
    description: 'TypeScript without strict compiler options.',
  },
  {
    id: 'typescript-strict',
    name: 'TypeScript strict',
    category: 'language',
    version: '1.0.0',
    description: 'Strict TypeScript for application and test code.',
  },
  {
    id: 'nextjs-app-router',
    name: 'Next.js App Router',
    category: 'framework',
    version: '1.0.0',
    description: 'React Server Components by default.',
  },
  {
    id: 'nextjs-pages-router',
    name: 'Next.js Pages Router',
    category: 'framework',
    version: '1.0.0',
    description: 'Page-based Next.js routing.',
  },
  {
    id: 'forms',
    name: 'Forms',
    category: 'library',
    version: '1.0.0',
    description: 'Form state and validation.',
  },
  {
    id: 'shadcn',
    name: 'shadcn/ui',
    category: 'library',
    version: '1.0.0',
    description: 'Accessible components from a local registry.',
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'library',
    version: '1.0.0',
    description: 'Utility-first styling.',
  },
  {
    id: 'vitest',
    name: 'Vitest',
    category: 'library',
    version: '1.0.0',
    description: 'Unit tests on Vite.',
  },
  {
    id: 'zustand',
    name: 'Zustand',
    category: 'library',
    version: '1.0.0',
    description: 'Small client-side state.',
  },
  {
    id: 'new-feature',
    name: 'New feature',
    category: 'workflow',
    version: '1.0.0',
    description: 'Plan and implement a feature.',
  },
  {
    id: 'review-arch',
    name: 'Review architecture',
    category: 'workflow',
    version: '1.0.0',
    description: 'Read-only architecture review.',
  },
];

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-'));
  directories.push(dir);
  return dir;
}

async function runList(options?: {
  readonly json?: boolean;
  readonly category?: string;
  readonly registryDir?: string;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout = captureStream();
  const stderr = captureStream();
  const json = options?.json ?? false;
  const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, json);
  const ctx = createRunContext({
    cwd: options?.registryDir ?? sampleDir,
    yes: false,
    dryRun: false,
    agents: undefined,
    force: false,
    json,
    stdinIsTTY: false,
    stdoutIsTTY: false,
  });
  const code = await list(ctx, logger, {
    stdout: stdout.stream,
    registryDir: options?.registryDir ?? sampleDir,
    ...(options?.category === undefined ? {} : { category: options.category }),
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

describe('list', () => {
  it('prints sample fragments grouped by category', async () => {
    const result = await runList();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`${SAMPLE_TEXT}\n`);
  });

  it('filters sample fragments with --category library', async () => {
    const result = await runList({ category: 'library' });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        'library',
        '  forms     Forms         Form state and validation.',
        '  shadcn    shadcn/ui     Accessible components from a local registry.',
        '  tailwind  Tailwind CSS  Utility-first styling.',
        '  vitest    Vitest        Unit tests on Vite.',
        '  zustand   Zustand       Small client-side state.',
        '',
      ].join('\n'),
    );
  });

  it('prints sample fragments as json', async () => {
    const result = await runList({ json: true });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`${JSON.stringify(SAMPLE_JSON, null, 2)}\n`);
  });

  it('prints a filtered category as json', async () => {
    const result = await runList({ json: true, category: ' library ' });
    expect(result.code).toBe(0);
    const library = SAMPLE_JSON.filter((entry) => entry.category === 'library');
    expect(result.stdout).toBe(`${JSON.stringify(library, null, 2)}\n`);
  });

  it('groups json rows by category, then order, then id', async () => {
    const dir = await tempDir();
    await writeRule(dir, 'libraries/zeta.md', { id: 'zeta', name: 'Zeta', category: 'library', order: 5 });
    await writeRule(dir, 'libraries/alpha.md', { id: 'alpha', name: 'Alpha', category: 'library', order: 5 });
    await writeRule(dir, 'architectures/mid.md', { id: 'mid', name: 'Mid', category: 'architecture', order: 5 });
    await writeRule(dir, 'frameworks/early.md', { id: 'early', name: 'Early', category: 'framework', order: 1 });

    const result = await runList({ json: true, registryDir: dir });
    const parsed = JSON.parse(result.stdout) as { id: string }[];
    expect(parsed.map((entry) => entry.id)).toEqual(['mid', 'early', 'alpha', 'zeta']);
  });

  it('prints a sentence for an empty registry and an empty array for json', async () => {
    const dir = await tempDir();
    const human = await runList({ registryDir: dir });
    expect(human.code).toBe(0);
    expect(human.stdout).toBe('No fragments available.\n');
    expect(human.stderr).toBe('');

    const json = await runList({ registryDir: dir, json: true, category: 'library' });
    expect(json.code).toBe(0);
    expect(json.stdout).toBe('[]\n');
    expect(json.stderr).toBe('');
  });

  it('rejects an unknown category and suggests the closest name', async () => {
    await expect(runList({ category: 'libary' })).rejects.toThrow(AgentInitError);
    await expect(runList({ category: 'libary' })).rejects.toThrow(
      'Unknown category "libary". Did you mean "library"? Valid categories: architecture, language, framework, library, workflow.',
    );
  });

  it('lists valid categories without a suggestion when nothing is close', async () => {
    await expect(runList({ category: 'xyz' })).rejects.toThrow(
      'Unknown category "xyz". Valid categories: architecture, language, framework, library, workflow.',
    );
  });

  it('rejects an empty --category value', async () => {
    await expect(runList({ category: '   ' })).rejects.toThrow('Flag --category requires a category name.');
  });

  it('surfaces registry errors instead of printing a partial list', async () => {
    await expect(runList({ registryDir: multipleDir })).rejects.toThrow(/duplicate id "zustand"/);
    await expect(runList({ registryDir: multipleDir })).rejects.toThrow(/missing frontmatter/);
  });

  it('shows --category on list help and not on the root help', async () => {
    const listHelp = await runCli(['list', '--help']);
    expect(listHelp.code).toBe(0);
    expect(listHelp.stdout).toContain('--category');

    const rootHelp = await runCli(['--help']);
    expect(rootHelp.stdout).not.toContain('--category');
  });

  it('rejects --category on a command that does not define it', async () => {
    const result = await runCli(['init', '--category', 'library']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--category');
    expect(result.stderr).not.toContain('This is a bug');
  });

  it('rejects a missing --category value', async () => {
    const result = await runCli(['list', '--category']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--category');
    expect(result.stderr).not.toContain('This is a bug');
  });

  it('rejects an unknown category from the cli and lists the valid ones', async () => {
    const result = await runCli(['list', '--category', 'nope']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unknown category "nope"');
    for (const category of ['architecture', 'language', 'framework', 'library', 'workflow']) {
      expect(result.stderr).toContain(category);
    }
    expect(result.stderr).not.toContain('This is a bug');
  });
});

async function writeRule(root: string, relativePath: string, overrides: Record<string, unknown>): Promise<void> {
  const file = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  const data = {
    name: 'Name',
    version: '1.0.0',
    order: 10,
    description: 'A fragment.',
    scope: 'always',
    sources: ['https://example.com/docs'],
    verifiedAt: '2026-10-17',
    ...overrides,
  };
  await writeFile(file, `---\n${stringify(data)}---\n## Body\ntext\n`);
}
