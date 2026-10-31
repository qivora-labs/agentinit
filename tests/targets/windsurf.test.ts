import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { buildPlan } from '../../src/plan/build-plan.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { windsurfAdapter } from '../../src/targets/windsurf.js';
import type { FileOp } from '../../src/types.js';
import { layeredFragment, profile, resolved, ruleFragment, workflowFragment } from '../plan/helpers.js';

const GLOB_DESCRIPTION =
  'React Server Components by default, strict client boundaries, and App Router data conventions.';
const RULE_CHAR_LIMIT = 12_000;

function content(ops: readonly FileOp[], path: string): string {
  const found = ops.find((op) => op.path === path);
  if (found === undefined) throw new Error(`missing ${path}`);
  return found.content;
}

function frontmatter(text: string): string {
  const match = /^---\n([\s\S]*?)\n---/u.exec(text);
  const body = match?.[1];
  if (body === undefined) throw new Error('missing frontmatter');
  return body;
}

function globRule(globs: readonly string[], srcDir: '' | 'src' = 'src', body = 'RULE'): FileOp[] {
  return windsurfAdapter(
    renderTargetContext(
      profile({ srcDir }),
      resolved([
        layeredFragment(),
        ruleFragment({
          id: 'app-router',
          name: 'App Router',
          category: 'framework',
          scope: 'glob',
          order: 30,
          description: 'File scoped rule.',
          globs: [...globs],
          body,
        }),
      ]),
    ),
  );
}

describe('windsurfAdapter', () => {
  const ctx = renderTargetContext(
    profile(),
    resolved(
      [
        layeredFragment(),
        ruleFragment({
          id: 'typescript-strict',
          name: 'TypeScript strict',
          category: 'language',
          scope: 'always',
          order: 20,
          body: 'ALWAYS_RULE',
          description: 'Strict TypeScript for application and test code.',
        }),
        ruleFragment({
          id: 'app-router',
          name: 'App Router',
          category: 'framework',
          scope: 'glob',
          order: 30,
          description: GLOB_DESCRIPTION,
          globs: ['{{src}}app/**/*.ts', '{{src}}app/**/*.tsx'],
          body: '## Boundary\n\nServer Components by default.\n\nALWAYS keep client components at the leaves.\n',
        }),
        ruleFragment({
          id: 'zustand',
          name: 'Zustand',
          category: 'library',
          scope: 'auto',
          order: 40,
          description: 'Client state that the server does not own.',
          globs: ['{{src}}**/*.ts'],
          body: '## Boundary\n\nStores hold client-only state.\n\nALWAYS keep server data out of the store.\n',
        }),
        ruleFragment({
          id: 'review',
          name: 'Review',
          category: 'library',
          scope: 'manual',
          order: 50,
          description: 'Manual only when mentioned.',
          body: '## Boundary\n\nApply this only when mentioned.\n\nALWAYS wait for an explicit mention.\n',
        }),
      ],
      [
        workflowFragment({
          id: 'new-feature',
          name: 'New feature',
          order: 50,
          argumentHint: '<feature-name>',
          body: '## Purpose\n\nPlan the files, then implement them.\n\n## Steps\n\n1. Read `AGENTS.md`.\n',
        }),
      ],
    ),
  );
  const ops = windsurfAdapter(ctx);

  it('snapshots one glob rule, one auto rule, one manual rule, and one workflow', async () => {
    expect(ops.map((op) => op.path)).toEqual([
      '.windsurf/rules/agentinit-app-router.md',
      '.windsurf/rules/agentinit-zustand.md',
      '.windsurf/rules/agentinit-review.md',
      '.windsurf/workflows/new-feature.md',
    ]);
    expect(ops.map((op) => ({ kind: op.kind, target: op.target, blockId: op.blockId }))).toEqual([
      { kind: 'file', target: 'windsurf', blockId: undefined },
      { kind: 'file', target: 'windsurf', blockId: undefined },
      { kind: 'file', target: 'windsurf', blockId: undefined },
      { kind: 'file', target: 'windsurf', blockId: undefined },
    ]);

    const glob = content(ops, '.windsurf/rules/agentinit-app-router.md');
    const auto = content(ops, '.windsurf/rules/agentinit-zustand.md');
    const manual = content(ops, '.windsurf/rules/agentinit-review.md');
    const workflow = content(ops, '.windsurf/workflows/new-feature.md');
    for (const text of [glob, auto, manual, workflow]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toContain('\r');
      expect(text).not.toContain('ALWAYS_RULE');
    }
    expect(glob).not.toContain('description');
    expect(glob).not.toContain(GLOB_DESCRIPTION);
    expect(auto).not.toContain('globs');
    expect(manual).not.toContain('description');
    expect(manual).not.toContain('Manual only when mentioned.');
    expect(manual).not.toContain('globs');
    expect(workflow).not.toContain('argument-hint');
    expect(workflow).not.toContain('<feature-name>');

    await expect(glob).toMatchFileSnapshot('../__snapshots__/targets/windsurf-glob.md');
    await expect(auto).toMatchFileSnapshot('../__snapshots__/targets/windsurf-auto.md');
    await expect(manual).toMatchFileSnapshot('../__snapshots__/targets/windsurf-manual.md');
    await expect(workflow).toMatchFileSnapshot('../__snapshots__/targets/windsurf-workflow.md');
  });

  it('serializes globs as a comma-separated string', () => {
    const text = content(ops, '.windsurf/rules/agentinit-app-router.md');
    expect(text).toContain('globs: src/app/**/*.ts,src/app/**/*.tsx\n');
    expect(text).not.toMatch(/globs:\s*\[/u);
    expect(text).not.toMatch(/globs:\s*"/u);
    expect(parseYaml(frontmatter(text))).toEqual({
      trigger: 'glob',
      globs: 'src/app/**/*.ts,src/app/**/*.tsx',
    });
    expect(parseYaml(frontmatter(content(ops, '.windsurf/rules/agentinit-zustand.md')))).toEqual({
      trigger: 'model_decision',
      description: 'Client state that the server does not own.',
    });
    expect(parseYaml(frontmatter(content(ops, '.windsurf/rules/agentinit-review.md')))).toEqual({
      trigger: 'manual',
    });
    expect(parseYaml(frontmatter(content(ops, '.windsurf/workflows/new-feature.md')))).toEqual({
      description: 'A workflow.',
    });
  });

  it.each([
    {
      behavior: 'quotes a glob list that starts with *',
      srcDir: 'src' as const,
      globs: ['**/*.test.tsx', '*.test.ts'],
      line: 'globs: "**/*.test.tsx,*.test.ts"',
      parsed: '**/*.test.tsx,*.test.ts',
    },
    {
      behavior: 'quotes globs that start with * when srcDir is empty',
      srcDir: '' as const,
      globs: ['{{src}}**/*.tsx', '{{src}}**/*.css'],
      line: 'globs: "**/*.tsx,**/*.css"',
      parsed: '**/*.tsx,**/*.css',
    },
  ])('$behavior and round-trips through yaml.parse', ({ srcDir, globs, line, parsed }) => {
    const text = content(globRule(globs, srcDir), '.windsurf/rules/agentinit-app-router.md');
    expect(text).toContain(`${line}\n`);
    expect(text).not.toMatch(/globs:\s*\[/u);
    expect(text).not.toMatch(/globs:\s*"[^"]+"\s*,/u);
    expect(parseYaml(frontmatter(text))).toEqual({ trigger: 'glob', globs: parsed });
  });

  it('omits a glob rule when the rendered glob list is empty', () => {
    const empty = globRule(['{{scripts.missing}}/**/*.ts']);
    expect(empty).toEqual([]);
  });

  it.each([
    {
      behavior: 'quotes a colon',
      description: 'Apply to App Router: keep server components.',
      line: 'description: "Apply to App Router: keep server components."',
    },
    {
      behavior: 'quotes a hash',
      description: 'Keep # comments in examples.',
      line: 'description: "Keep # comments in examples."',
    },
    {
      behavior: 'quotes a number',
      description: '15',
      line: 'description: "15"',
    },
  ])('$behavior and round-trips through yaml.parse', ({ description, line }) => {
    const text = content(
      windsurfAdapter(
        renderTargetContext(
          profile(),
          resolved([
            layeredFragment(),
            ruleFragment({
              id: 'zustand',
              name: 'Zustand',
              category: 'library',
              scope: 'auto',
              order: 40,
              description,
              globs: ['{{src}}**/*.ts'],
              body: 'RULE',
            }),
          ]),
        ),
      ),
      '.windsurf/rules/agentinit-zustand.md',
    );
    expect(text).toContain(`${line}\n`);
    expect(parseYaml(frontmatter(text))).toEqual({ trigger: 'model_decision', description });
  });

  it('rejects a rule file that reaches 12000 characters and names the fragment', () => {
    const under = globRule(['{{src}}**/*.ts'], 'src', 'x');
    const sample = content(under, '.windsurf/rules/agentinit-app-router.md');
    const overhead = sample.length - 1;
    const atLimit = () => globRule(['{{src}}**/*.ts'], 'src', 'x'.repeat(RULE_CHAR_LIMIT - overhead));
    const belowLimit = globRule(['{{src}}**/*.ts'], 'src', 'x'.repeat(RULE_CHAR_LIMIT - overhead - 1));

    expect(atLimit).toThrow(AgentInitError);
    expect(atLimit).toThrow(
      `Windsurf rule for fragment "app-router" is ${String(RULE_CHAR_LIMIT)} characters. Windsurf rule files must stay below ${String(RULE_CHAR_LIMIT)} characters.`,
    );
    expect(content(belowLimit, '.windsurf/rules/agentinit-app-router.md')).toHaveLength(RULE_CHAR_LIMIT - 1);
  });

  it.each(['auto', 'manual'] as const)('rejects an oversized %s rule and names the fragment', (scope) => {
    const run = (): FileOp[] =>
      windsurfAdapter(
        renderTargetContext(
          profile(),
          resolved([
            layeredFragment(),
            ruleFragment({
              id: 'zustand',
              name: 'Zustand',
              category: 'library',
              scope,
              order: 40,
              description: 'Client state.',
              globs: ['{{src}}**/*.ts'],
              body: 'x'.repeat(RULE_CHAR_LIMIT),
            }),
          ]),
        ),
      );
    expect(run).toThrow(AgentInitError);
    expect(run).toThrow(/Windsurf rule for fragment "zustand"/u);
  });

  it('emits no windsurf file for always fragments', () => {
    expect(
      windsurfAdapter(
        renderTargetContext(
          profile(),
          resolved([
            layeredFragment(),
            ruleFragment({
              id: 'typescript-strict',
              name: 'TypeScript strict',
              category: 'language',
              scope: 'always',
              order: 20,
              body: 'ALWAYS_RULE',
            }),
          ]),
        ),
      ),
    ).toEqual([]);
  });

  it('adds windsurf files only when windsurf is selected', () => {
    const selection = resolved(
      [
        layeredFragment(),
        ruleFragment({
          id: 'app-router',
          name: 'App Router',
          category: 'framework',
          scope: 'glob',
          order: 30,
          globs: ['{{src}}**/*.ts'],
          body: 'GLOB_RULE',
        }),
      ],
      [workflowFragment({ id: 'new-feature', name: 'New feature', order: 50, body: 'WORKFLOW' })],
    );
    expect(buildPlan(profile({ agents: ['windsurf'] }), selection).ops.map((op) => op.path)).toEqual([
      '.windsurf/rules/agentinit-app-router.md',
      '.windsurf/workflows/new-feature.md',
      'AGENTS.md',
      'ARCHITECTURE.md',
    ]);
    expect(buildPlan(profile({ agents: ['copilot'] }), selection).ops.map((op) => op.path)).toEqual([
      'AGENTS.md',
      'ARCHITECTURE.md',
    ]);
  });
});
