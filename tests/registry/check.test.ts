import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { runRegistryCheck } from '../../scripts/check-registry.js';
import {
  checkFragments,
  formatReport,
  problemsFromLoadError,
  reportStatus,
  type RegistryProblem,
} from '../../src/registry/check.js';
import { defaultRegistryDir } from '../../src/registry/locate.js';
import { parseFragment, type Fragment } from '../../src/registry/parse.js';

const TODAY = '2026-10-28';
const SAMPLE = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));
const INVALID = fileURLToPath(new URL('../fixtures/registry-invalid', import.meta.url));

const FENCE = ['```ts', 'const ok = true;', '```'].join('\n');
const VALID_RULE = ['ALWAYS keep the boundary.', '', FENCE].join('\n');

const WORKFLOW_SECTIONS = ['Purpose', 'Input', 'Steps', 'Output', 'Guardrails'] as const;

const WORKFLOW_BODY: Record<(typeof WORKFLOW_SECTIONS)[number], string> = {
  Purpose: 'Do the work.',
  Input: 'A name.',
  Steps: 'Follow the plan.',
  Output: 'A summary.',
  Guardrails: 'Stop when unsure.',
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe('checkFragments', () => {
  it('accepts a fragment body of 120 lines', () => {
    expect(checkFragments([ruleFragment({ body: paddedRule(120) })], TODAY)).toEqual([]);
  });

  it('rejects a fragment body over 120 lines', () => {
    expect(checkFragments([ruleFragment({ body: paddedRule(121) })], TODAY)).toEqual([
      error('body is 121 lines; the limit is 120'),
    ]);
  });

  it.each(['ALWAYS', 'NEVER', 'PREFER', 'FORBID', 'DEFAULT'])('accepts a rule that uses %s', (keyword) => {
    const body = [`${keyword} keep the boundary.`, '', FENCE].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('rejects a rule with no directive keyword', () => {
    expect(checkFragments([ruleFragment({ body: `Keep the boundary.\n\n${FENCE}` })], TODAY)).toEqual([
      error('missing a directive keyword (ALWAYS, NEVER, PREFER, FORBID, DEFAULT)'),
    ]);
  });

  it('rejects a rule with no fenced code block', () => {
    expect(checkFragments([ruleFragment({ body: 'ALWAYS keep the boundary.' })], TODAY)).toEqual([
      error('missing a fenced code block'),
    ]);
  });

  it('accepts a tilde fence and a fence indented by three spaces', () => {
    const tilde = ['ALWAYS keep the boundary.', '', '~~~ts', 'const ok = true;', '~~~'].join('\n');
    const indented = ['ALWAYS keep the boundary.', '', '   ```ts', 'const ok = true;', '   ```'].join('\n');
    expect(checkFragments([ruleFragment({ body: tilde }), ruleFragment({ body: indented, id: 'other' })], TODAY)).toEqual(
      [],
    );
  });

  it('does not count an indented code block as a fence', () => {
    const body = ['ALWAYS keep the boundary.', '', '    ```', '    const ok = true;', '    ```'].join('\n');
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([error('missing a fenced code block')]);
  });

  it('does not require directives or a fence on a workflow', () => {
    expect(checkFragments([workflowFragment(workflowBody())], TODAY)).toEqual([]);
  });

  it('accepts an architecture fragment with Summary, Map, a directive, and a fence', () => {
    expect(checkFragments([architectureFragment(summaryLines(1))], TODAY)).toEqual([]);
  });

  it('accepts a Summary of 10 non-empty lines', () => {
    expect(checkFragments([architectureFragment(summaryLines(10, true))], TODAY)).toEqual([]);
  });

  it('rejects a Summary longer than 10 non-empty lines', () => {
    expect(checkFragments([architectureFragment(summaryLines(11))], TODAY)).toEqual([
      error('## Summary is 11 non-empty lines; the limit is 10', 'architectures/sample.md'),
    ]);
  });

  it('rejects an architecture fragment without Summary or Map', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, category: 'architecture' })], TODAY)).toEqual([
      error('missing "## Summary" section', 'architectures/sample.md'),
      error('missing "## Map" section', 'architectures/sample.md'),
    ]);
  });

  it.each(WORKFLOW_SECTIONS)('rejects a workflow missing ## %s', (name) => {
    expect(checkFragments([workflowFragment(workflowBody(name))], TODAY)).toEqual([
      error(`missing "## ${name}" section`, 'workflows/sample.md'),
    ]);
  });

  it('accepts known placeholders in the body and in globs', () => {
    const body = `Use {{src}}, {{ pm }}, and {{scripts.test}}.\n\n${VALID_RULE}`;
    const fragment = ruleFragment({
      body,
      globs: ['{{src}}app/**/*.ts', '{{pm}}', '{{scripts.test}}'],
    });
    expect(checkFragments([fragment], TODAY)).toEqual([]);
  });

  it('rejects an unknown placeholder once', () => {
    const body = `Use {{foo}} and {{foo}} again.\n\n${VALID_RULE}`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([error('unknown placeholder "{{foo}}"')]);
  });

  it('rejects a script placeholder whose name contains whitespace', () => {
    const fragment = ruleFragment({
      body: VALID_RULE,
      globs: ['{{scripts.foo bar}}'],
    });
    expect(checkFragments([fragment], TODAY)).toEqual([error('unknown placeholder "{{scripts.foo bar}}"')]);
  });

  it('does not warn when verifiedAt is exactly 6 months old', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, verifiedAt: '2026-04-28' })], TODAY)).toEqual([]);
  });

  it('warns when verifiedAt is older than 6 months', () => {
    expect(checkFragments([ruleFragment({ body: VALID_RULE, verifiedAt: '2026-04-27' })], TODAY)).toEqual([
      warning('verifiedAt 2026-04-27 is older than 6 months'),
    ]);
  });

  it('clamps a month-end verifiedAt to the last day six months later', () => {
    const fragment = ruleFragment({ body: VALID_RULE, verifiedAt: '2025-08-31' });
    expect(checkFragments([fragment], '2026-02-28')).toEqual([]);
    expect(checkFragments([fragment], '2026-03-01')).toEqual([
      warning('verifiedAt 2025-08-31 is older than 6 months'),
    ]);
  });

  it.each([
    ['curl', 'Run curl https://example.com'],
    ['wget', 'Fetch it with wget https://example.com/file'],
    ['npm install', 'Run npm install left-pad'],
    ['pnpm add', 'Run pnpm add left-pad'],
    ['yarn add', 'Run yarn add left-pad'],
    ['read .env', 'Read the `.env` file before starting'],
    ['read .env', 'reading .env files is required'],
    ['move or rename existing files', 'Rename the existing files before editing'],
    ['move or rename existing files', 'mv the existing config out of the way'],
  ] as const)('rejects %s', (phrase, line) => {
    expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n${line}` })], TODAY)).toEqual([
      error(`forbidden phrase "${phrase}"`),
    ]);
  });

  it('reports forbidden phrases in list order', () => {
    const body = `${VALID_RULE}\nUse wget, then curl https://example.com`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([
      error('forbidden phrase "curl"'),
      error('forbidden phrase "wget"'),
    ]);
  });

  it('ignores a forbidden phrase in a clearly marked anti-pattern block', () => {
    const blocks = [
      ['## Anti-Pattern', '', '```ts', 'curl https://example.com', '```'].join('\n'),
      ['```ts anti-pattern', 'wget https://example.com', '```'].join('\n'),
      ['```ts', '// Anti-pattern', 'npm install left-pad', '```'].join('\n'),
    ];
    for (const block of blocks) {
      expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n\n${block}` })], TODAY)).toEqual([]);
    }
  });

  it('flags a forbidden phrase when the block also shows the good example', () => {
    const block = ['```ts', '// ✅ Good', 'const ok = true;', '// Anti-pattern', 'curl https://example.com', '```'].join(
      '\n',
    );
    expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n\n${block}` })], TODAY)).toEqual([
      error('forbidden phrase "curl"'),
    ]);
  });

  it('flags a forbidden phrase under a heading that also says Good', () => {
    const block = ['## Good vs Anti-Pattern', '', '```ts', 'curl https://example.com', '```'].join('\n');
    expect(checkFragments([ruleFragment({ body: `${VALID_RULE}\n\n${block}` })], TODAY)).toEqual([
      error('forbidden phrase "curl"'),
    ]);
  });

  it('does not treat NEVER or FORBID as an instruction to do the forbidden thing', () => {
    const body = `${VALID_RULE}\nNEVER run curl or wget.\nFORBID npm install, pnpm add, and yarn add.\n`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('does not flag curl inside a URL or a longer identifier', () => {
    const body = `${VALID_RULE}\nSee https://curl.se and libcurl.`;
    expect(checkFragments([ruleFragment({ body })], TODAY)).toEqual([]);
  });

  it('rejects a today value that is not a real calendar date', () => {
    const fragment = ruleFragment({ body: VALID_RULE });
    expect(() => checkFragments([fragment], '2026-02-31')).toThrow(AgentInitError);
    expect(() => checkFragments([fragment], 'yesterday')).toThrow('today must be YYYY-MM-DD.');
  });
});

describe('problemsFromLoadError', () => {
  it('returns no problems for an empty message', () => {
    expect(problemsFromLoadError('')).toEqual([]);
  });

  it('turns each loadRegistry line into an error', () => {
    const message = [
      'libraries/a.md: duplicate id "a" (first seen at frameworks/a.md)',
      'Not a directory: /tmp/registry',
    ].join('\n');
    expect(problemsFromLoadError(message)).toEqual([
      {
        path: 'libraries/a.md',
        severity: 'error',
        message: 'duplicate id "a" (first seen at frameworks/a.md)',
      },
      { path: '.', severity: 'error', message: 'Not a directory: /tmp/registry' },
    ]);
  });
});

describe('formatReport', () => {
  it('prints one line per problem and a summary', () => {
    const problems: RegistryProblem[] = [
      { path: 'libraries/a.md', severity: 'error', message: 'missing a fenced code block' },
      { path: 'libraries/a.md', severity: 'warning', message: 'verifiedAt 2020-01-01 is older than 6 months' },
    ];
    expect(formatReport(problems)).toBe(
      [
        'libraries/a.md: [error] missing a fenced code block',
        'libraries/a.md: [warning] verifiedAt 2020-01-01 is older than 6 months',
        '1 error, 1 warning',
        '',
      ].join('\n'),
    );
    expect(formatReport([])).toBe('0 errors, 0 warnings\n');
    expect(reportStatus(problems)).toBe(1);
    const warningOnly = problems[1];
    if (warningOnly === undefined) throw new Error('expected a warning');
    expect(reportStatus([warningOnly])).toBe(0);
  });
});

describe('runRegistryCheck', () => {
  it('passes on the empty bundled registry and on registry-sample', async () => {
    const bundled = await run(defaultRegistryDir());
    const sample = await run(SAMPLE);
    expect(bundled).toEqual({ code: 0, text: '0 errors, 0 warnings\n' });
    expect(sample).toEqual({ code: 0, text: '0 errors, 0 warnings\n' });
  });

  it('prints every load error and exits 1', async () => {
    const result = await run(path.join(INVALID, 'multiple'));
    expect(result.code).toBe(1);
    expect(result.text).toBe(
      [
        'architectures/broken.md: [error] missing frontmatter block',
        'frameworks/layered.md: [error] folder "frameworks" does not match category "library"; expected "libraries"',
        'languages/typescript.md: [error] requires: unknown id "missing-lang"',
        'languages/typescript.md: [error] conflictsWith: unknown id "missing-conflict"',
        'languages/typescript.md: [error] compatibleWith: unknown id "missing-compat"',
        'libraries/mismatch.md: [error] file name "mismatch.md" does not match id "zustand"',
        'libraries/zustand.md: [error] duplicate id "zustand" (first seen at libraries/mismatch.md)',
        '7 errors, 0 warnings',
        '',
      ].join('\n'),
    );
  });

  it('prints every content problem and exits 1 when any error is present', async () => {
    const dir = await tempDir();
    await writeMarkdown(
      dir,
      'libraries/alpha.md',
      `---
id: alpha
name: Alpha
category: library
version: 1.0.0
order: 40
description: A library rule.
scope: always
sources:
  - https://example.com/docs
verifiedAt: 2020-01-01
---
Use {{nope}} in the client.

ALWAYS keep the boundary.

\`\`\`ts
const ok = true;
\`\`\`

Run curl https://example.com
`,
    );
    await writeMarkdown(
      dir,
      'workflows/beta.md',
      `---
id: beta
name: Beta
category: workflow
version: 1.0.0
order: 50
description: A workflow.
sources:
  - https://example.com/docs
verifiedAt: 2026-10-17
---
## Steps
Follow the plan.
`,
    );

    const result = await run(dir);
    expect(result.code).toBe(1);
    expect(result.text).toBe(
      [
        'libraries/alpha.md: [error] unknown placeholder "{{nope}}"',
        'libraries/alpha.md: [warning] verifiedAt 2020-01-01 is older than 6 months',
        'libraries/alpha.md: [error] forbidden phrase "curl"',
        'workflows/beta.md: [error] missing "## Purpose" section',
        'workflows/beta.md: [error] missing "## Input" section',
        'workflows/beta.md: [error] missing "## Output" section',
        'workflows/beta.md: [error] missing "## Guardrails" section',
        '6 errors, 1 warning',
        '',
      ].join('\n'),
    );
  });

  it('exits 0 when the only problems are warnings', async () => {
    const dir = await tempDir();
    await writeMarkdown(
      dir,
      'libraries/sample.md',
      `---
id: sample
name: Sample
category: library
version: 1.0.0
order: 40
description: A library rule.
scope: always
sources:
  - https://example.com/docs
verifiedAt: 2020-01-01
---
ALWAYS keep the boundary.

\`\`\`ts
const ok = true;
\`\`\`
`,
    );

    const result = await run(dir);
    expect(result.code).toBe(0);
    expect(result.text).toBe(
      ['libraries/sample.md: [warning] verifiedAt 2020-01-01 is older than 6 months', '0 errors, 1 warning', ''].join(
        '\n',
      ),
    );
  });
});

function ruleFragment(options: {
  body: string;
  category?: 'architecture' | 'language' | 'framework' | 'library';
  verifiedAt?: string;
  globs?: readonly string[];
  id?: string;
}): Fragment {
  const category = options.category ?? 'library';
  const id = options.id ?? 'sample';
  const folders = {
    architecture: 'architectures',
    language: 'languages',
    framework: 'frameworks',
    library: 'libraries',
  } as const;
  const scope = options.globs === undefined ? 'always' : 'glob';
  const globs =
    options.globs === undefined
      ? ''
      : `globs:\n${options.globs.map((glob) => `  - ${JSON.stringify(glob)}`).join('\n')}\n`;
  return parseFragment(
    `---
id: ${id}
name: Sample
category: ${category}
version: 1.0.0
order: 10
description: A sample.
scope: ${scope}
${globs}sources:
  - https://example.com/docs
verifiedAt: ${options.verifiedAt ?? '2026-10-17'}
---
${options.body}`,
    `${folders[category]}/${id}.md`,
  );
}

function architectureFragment(summary: readonly string[]): Fragment {
  const body = ['## Summary', ...summary, '', '## Map', 'src/features', '', VALID_RULE].join('\n');
  return ruleFragment({ body, category: 'architecture' });
}

function workflowFragment(body: string, verifiedAt = '2026-10-17'): Fragment {
  return parseFragment(
    `---
id: sample
name: Sample
category: workflow
version: 1.0.0
order: 50
description: A workflow.
sources:
  - https://example.com/docs
verifiedAt: ${verifiedAt}
---
${body}`,
    'workflows/sample.md',
  );
}

function workflowBody(omit?: (typeof WORKFLOW_SECTIONS)[number]): string {
  return WORKFLOW_SECTIONS.filter((name) => name !== omit)
    .map((name) => `## ${name}\n${WORKFLOW_BODY[name]}`)
    .join('\n\n');
}

function summaryLines(count: number, blankBetween = false): string[] {
  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (blankBetween && index > 0) lines.push('');
    lines.push(`line ${String(index + 1)}`);
  }
  return lines;
}

function paddedRule(count: number): string {
  const head = VALID_RULE.split('\n');
  const filler = Array.from({ length: count - head.length }, (_, index) => `note ${String(index + 1)}`);
  return [...head, ...filler].join('\n');
}

function error(message: string, path = 'libraries/sample.md'): RegistryProblem {
  return { path, severity: 'error', message };
}

function warning(message: string, path = 'libraries/sample.md'): RegistryProblem {
  return { path, severity: 'warning', message };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentinit-'));
  directories.push(dir);
  return dir;
}

async function writeMarkdown(root: string, relativePath: string, text: string): Promise<void> {
  const file = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function run(dir: string): Promise<{ code: 0 | 1; text: string }> {
  const output = {
    text: '',
    write(chunk: string): void {
      output.text += chunk;
    },
  };
  const code = await runRegistryCheck(dir, TODAY, output);
  return { code, text: output.text };
}
