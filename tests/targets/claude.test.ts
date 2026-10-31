import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/plan/build-plan.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { claudeAdapter } from '../../src/targets/claude.js';
import type { FileOp } from '../../src/types.js';
import { layeredFragment, profile, resolved, ruleFragment, workflowFragment } from '../plan/helpers.js';

const GLOB_DESCRIPTION =
  'React Server Components by default, strict client boundaries, and App Router data conventions.';

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

function pathRule(scope: 'glob' | 'auto', globs: readonly string[], srcDir: '' | 'src' = 'src'): string {
  return content(
    claudeAdapter(
      renderTargetContext(
        profile({ srcDir }),
        resolved([
          layeredFragment(),
          ruleFragment({
            id: 'app-router',
            name: 'App Router',
            category: 'framework',
            scope,
            order: 30,
            description: 'File scoped rule.',
            globs: [...globs],
            body: 'RULE',
          }),
        ]),
      ),
    ),
    '.claude/rules/agentinit-app-router.md',
  );
}

describe('claudeAdapter', () => {
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
  const ops = claudeAdapter(ctx);

  it('snapshots the CLAUDE.md block, each scope, and one workflow', async () => {
    expect(ops.map((op) => op.path)).toEqual([
      'CLAUDE.md',
      '.claude/rules/agentinit-app-router.md',
      '.claude/rules/agentinit-zustand.md',
      '.claude/skills/agentinit-review/SKILL.md',
      '.claude/skills/new-feature/SKILL.md',
    ]);
    expect(ops.map((op) => ({ kind: op.kind, target: op.target, blockId: op.blockId }))).toEqual([
      { kind: 'managed-block', target: 'claude', blockId: 'claude' },
      { kind: 'file', target: 'claude', blockId: undefined },
      { kind: 'file', target: 'claude', blockId: undefined },
      { kind: 'file', target: 'claude', blockId: undefined },
      { kind: 'file', target: 'claude', blockId: undefined },
    ]);

    const claudeMd = content(ops, 'CLAUDE.md');
    const glob = content(ops, '.claude/rules/agentinit-app-router.md');
    const auto = content(ops, '.claude/rules/agentinit-zustand.md');
    const manual = content(ops, '.claude/skills/agentinit-review/SKILL.md');
    const workflow = content(ops, '.claude/skills/new-feature/SKILL.md');
    for (const text of [claudeMd, glob, auto, manual, workflow]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toContain('\r');
      expect(text).not.toContain('ALWAYS_RULE');
      expect(text).not.toContain('agentinit:begin');
    }
    expect(claudeMd.startsWith('@AGENTS.md\n')).toBe(true);
    expect(auto).not.toContain('description');
    expect(auto).not.toContain('Client state that the server does not own.');
    expect(glob).not.toContain('description');

    await expect(claudeMd).toMatchFileSnapshot('../__snapshots__/targets/claude-md.md');
    await expect(glob).toMatchFileSnapshot('../__snapshots__/targets/claude-glob.md');
    await expect(auto).toMatchFileSnapshot('../__snapshots__/targets/claude-auto.md');
    await expect(manual).toMatchFileSnapshot('../__snapshots__/targets/claude-manual.md');
    await expect(workflow).toMatchFileSnapshot('../__snapshots__/targets/claude-skill.md');
  });

  it('serializes paths as a YAML list that round-trips through yaml.parse', () => {
    const text = content(ops, '.claude/rules/agentinit-app-router.md');
    expect(text).toContain('paths:\n  - "src/app/**/*.ts"\n  - "src/app/**/*.tsx"\n');
    expect(text).not.toMatch(/paths:\s*\[/u);
    expect(parseYaml(frontmatter(text))).toEqual({
      paths: ['src/app/**/*.ts', 'src/app/**/*.tsx'],
    });
    expect(parseYaml(frontmatter(content(ops, '.claude/rules/agentinit-zustand.md')))).toEqual({
      paths: ['src/**/*.ts'],
    });
  });

  it.each([
    {
      behavior: 'quotes a path that starts with *',
      srcDir: 'src' as const,
      globs: ['**/*.test.tsx'],
      line: '  - "**/*.test.tsx"',
      parsed: ['**/*.test.tsx'],
    },
    {
      behavior: 'quotes paths that start with * when srcDir is empty',
      srcDir: '' as const,
      globs: ['{{src}}**/*.tsx', '{{src}}**/*.css'],
      line: '  - "**/*.tsx"',
      parsed: ['**/*.tsx', '**/*.css'],
    },
  ])('$behavior and round-trips through yaml.parse', ({ srcDir, globs, line, parsed }) => {
    const text = pathRule('glob', globs, srcDir);
    expect(text).toContain(`${line}\n`);
    expect(parseYaml(frontmatter(text))).toEqual({ paths: parsed });
  });

  it('omits a glob or auto rule when the rendered path list is empty', () => {
    const empty = claudeAdapter(
      renderTargetContext(
        profile(),
        resolved([
          layeredFragment(),
          ruleFragment({
            id: 'app-router',
            name: 'App Router',
            category: 'framework',
            scope: 'glob',
            order: 30,
            globs: ['{{scripts.missing}}/**/*.ts'],
            body: 'GLOB_RULE',
          }),
          ruleFragment({
            id: 'zustand',
            name: 'Zustand',
            category: 'library',
            scope: 'auto',
            order: 40,
            globs: ['{{scripts.missing}}/**/*.ts'],
            body: 'AUTO_RULE',
          }),
        ]),
      ),
    );
    expect(empty.map((op) => op.path)).toEqual(['CLAUDE.md']);
    expect(content(empty, 'CLAUDE.md')).not.toContain('GLOB_RULE');
    expect(content(empty, 'CLAUDE.md')).not.toContain('AUTO_RULE');
  });

  it('sets disable-model-invocation on manual rules and workflows', () => {
    const manual = content(ops, '.claude/skills/agentinit-review/SKILL.md');
    const workflow = content(ops, '.claude/skills/new-feature/SKILL.md');
    expect(parseYaml(frontmatter(manual))).toEqual({
      name: 'review',
      description: 'Manual only when mentioned.',
      'disable-model-invocation': true,
    });
    expect(parseYaml(frontmatter(workflow))).toEqual({
      name: 'new-feature',
      description: 'A workflow.',
      'argument-hint': '<feature-name>',
      'disable-model-invocation': true,
    });
  });

  it.each([
    {
      behavior: 'quotes a colon in a skill description',
      description: 'Apply to App Router: keep server components.',
      line: 'description: "Apply to App Router: keep server components."',
    },
    {
      behavior: 'quotes a hash in a skill description',
      description: 'Keep # comments in examples.',
      line: 'description: "Keep # comments in examples."',
    },
  ])('$behavior and round-trips through yaml.parse', ({ description, line }) => {
    const text = content(
      claudeAdapter(
        renderTargetContext(
          profile(),
          resolved([
            layeredFragment(),
            ruleFragment({
              id: 'review',
              name: 'Review',
              category: 'library',
              scope: 'manual',
              order: 50,
              description,
              body: 'RULE',
            }),
          ]),
        ),
      ),
      '.claude/skills/agentinit-review/SKILL.md',
    );
    expect(text).toContain(`${line}\n`);
    expect(parseYaml(frontmatter(text))).toMatchObject({
      description,
      'disable-model-invocation': true,
    });
  });

  it.each([
    {
      behavior: 'quotes an argument hint that starts with [',
      argumentHint: '[path]',
      line: 'argument-hint: "[path]"',
    },
    {
      behavior: 'quotes an argument hint that contains a colon',
      argumentHint: '<target>: <goal>',
      line: 'argument-hint: "<target>: <goal>"',
    },
  ])('$behavior and round-trips through yaml.parse', ({ argumentHint, line }) => {
    const text = content(
      claudeAdapter(
        renderTargetContext(
          profile(),
          resolved(
            [layeredFragment()],
            [workflowFragment({ id: 'review-arch', name: 'Review arch', order: 50, argumentHint, body: 'STEPS' })],
          ),
        ),
      ),
      '.claude/skills/review-arch/SKILL.md',
    );
    expect(text).toContain(`${line}\n`);
    expect(parseYaml(frontmatter(text))).toMatchObject({
      'argument-hint': argumentHint,
      'disable-model-invocation': true,
    });
  });

  it('omits argument-hint when the workflow has none', () => {
    const text = content(
      claudeAdapter(
        renderTargetContext(
          profile(),
          resolved(
            [layeredFragment()],
            [workflowFragment({ id: 'review-arch', name: 'Review arch', order: 50, body: 'STEPS' })],
          ),
        ),
      ),
      '.claude/skills/review-arch/SKILL.md',
    );
    expect(text).not.toMatch(/^argument-hint:/mu);
    expect(parseYaml(frontmatter(text))).toEqual({
      name: 'review-arch',
      description: 'A workflow.',
      'disable-model-invocation': true,
    });
  });

  it('quotes a skill name that YAML would read as a boolean', () => {
    const text = content(
      claudeAdapter(
        renderTargetContext(
          profile(),
          resolved([
            layeredFragment(),
            ruleFragment({
              id: 'on',
              name: 'On',
              category: 'library',
              scope: 'manual',
              order: 50,
              description: 'Toggle.',
              body: 'RULE',
            }),
          ]),
        ),
      ),
      '.claude/skills/agentinit-on/SKILL.md',
    );
    expect(text).toContain('name: "on"\n');
    expect(parseYaml(frontmatter(text))).toMatchObject({ name: 'on', 'disable-model-invocation': true });
  });

  it('writes no Claude file that copies always-on fragment text', () => {
    const onlyAlways = claudeAdapter(
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
    );
    expect(onlyAlways.map((op) => op.path)).toEqual(['CLAUDE.md']);
    expect(content(onlyAlways, 'CLAUDE.md')).toBe(
      '@AGENTS.md\n\nScoped rules live in `.claude/rules/`.\n',
    );
  });

  it('adds claude files only when claude is selected', () => {
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
        ruleFragment({
          id: 'review',
          name: 'Review',
          category: 'library',
          scope: 'manual',
          order: 40,
          body: 'MANUAL_RULE',
        }),
      ],
      [
        workflowFragment({
          id: 'new-feature',
          name: 'New feature',
          order: 50,
          argumentHint: '<feature-name>',
          body: 'WORKFLOW',
        }),
      ],
    );
    expect(buildPlan(profile({ agents: ['claude'] }), selection).ops.map((op) => op.path)).toEqual([
      '.claude/rules/agentinit-app-router.md',
      '.claude/skills/agentinit-review/SKILL.md',
      '.claude/skills/new-feature/SKILL.md',
      'AGENTS.md',
      'ARCHITECTURE.md',
      'CLAUDE.md',
    ]);
    expect(buildPlan(profile({ agents: ['cursor'] }), selection).ops.map((op) => op.path)).toEqual([
      '.cursor/commands/new-feature.md',
      '.cursor/rules/agentinit-app-router.mdc',
      '.cursor/rules/agentinit-review.mdc',
      'AGENTS.md',
      'ARCHITECTURE.md',
    ]);
  });
});
