import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/plan/build-plan.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { cursorAdapter } from '../../src/targets/cursor.js';
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

function globRule(globs: readonly string[], srcDir: '' | 'src' = 'src'): string {
  return content(
    cursorAdapter(
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
            body: 'RULE',
          }),
        ]),
      ),
    ),
    '.cursor/rules/agentinit-app-router.mdc',
  );
}

describe('cursorAdapter', () => {
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
          body: '## Purpose\n\nPlan the files, then implement them.\n\n## Steps\n\n1. Read `AGENTS.md`.\n',
        }),
      ],
    ),
  );
  const ops = cursorAdapter(ctx);

  it('snapshots one glob rule, one auto rule, one manual rule, and one workflow', async () => {
    expect(ops.map((op) => op.path)).toEqual([
      '.cursor/rules/agentinit-app-router.mdc',
      '.cursor/rules/agentinit-zustand.mdc',
      '.cursor/rules/agentinit-review.mdc',
      '.cursor/commands/new-feature.md',
    ]);
    expect(ops.map((op) => ({ kind: op.kind, target: op.target, blockId: op.blockId }))).toEqual([
      { kind: 'file', target: 'cursor', blockId: undefined },
      { kind: 'file', target: 'cursor', blockId: undefined },
      { kind: 'file', target: 'cursor', blockId: undefined },
      { kind: 'file', target: 'cursor', blockId: undefined },
    ]);

    const glob = content(ops, '.cursor/rules/agentinit-app-router.mdc');
    const auto = content(ops, '.cursor/rules/agentinit-zustand.mdc');
    const manual = content(ops, '.cursor/rules/agentinit-review.mdc');
    const workflow = content(ops, '.cursor/commands/new-feature.md');
    for (const text of [glob, auto, manual, workflow]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toContain('\r');
    }
    expect(glob).not.toContain('ALWAYS_RULE');
    expect(auto).not.toContain('globs');
    expect(manual).not.toContain('description');
    expect(manual).not.toContain('Manual only when mentioned.');
    expect(manual).not.toContain('globs');
    expect(workflow.startsWith('---')).toBe(false);

    await expect(glob).toMatchFileSnapshot('../__snapshots__/targets/cursor-glob.mdc');
    await expect(auto).toMatchFileSnapshot('../__snapshots__/targets/cursor-auto.mdc');
    await expect(manual).toMatchFileSnapshot('../__snapshots__/targets/cursor-manual.mdc');
    await expect(workflow).toMatchFileSnapshot('../__snapshots__/targets/cursor-command.md');
  });

  it('serializes globs as a comma-separated string', () => {
    const text = content(ops, '.cursor/rules/agentinit-app-router.mdc');
    expect(text).toContain('globs: src/app/**/*.ts,src/app/**/*.tsx\n');
    expect(text).not.toMatch(/globs:\s*\[/u);
    expect(text).not.toMatch(/globs:\s*"/u);
    expect(parseYaml(frontmatter(text))).toEqual({
      description: GLOB_DESCRIPTION,
      globs: 'src/app/**/*.ts,src/app/**/*.tsx',
      alwaysApply: false,
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
    const text = globRule(globs, srcDir);
    expect(text).toContain(`${line}\n`);
    expect(text).not.toMatch(/globs:\s*\[/u);
    expect(text).not.toMatch(/globs:\s*"[^"]+"\s*,/u);
    expect(parseYaml(frontmatter(text))).toMatchObject({ globs: parsed, alwaysApply: false });
  });

  it('omits globs when the rendered list is empty', () => {
    const text = globRule(['{{scripts.missing}}/**/*.ts']);
    expect(text).not.toMatch(/^globs:/mu);
    expect(parseYaml(frontmatter(text))).toEqual({
      description: 'File scoped rule.',
      alwaysApply: false,
    });
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
      behavior: 'quotes a colon inside a quoted phrase',
      description: 'Say "go": then stop.',
      line: 'description: "Say \\"go\\": then stop."',
    },
  ])('$behavior and round-trips through yaml.parse', ({ description, line }) => {
    const text = content(
      cursorAdapter(
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
              description,
              globs: ['{{src}}app/**/*.ts'],
              body: 'RULE',
            }),
          ]),
        ),
      ),
      '.cursor/rules/agentinit-app-router.mdc',
    );
    expect(text).toContain(`${line}\n`);
    expect(parseYaml(frontmatter(text))).toMatchObject({ description, alwaysApply: false });
  });

  it('emits no cursor file for always fragments', () => {
    expect(
      cursorAdapter(
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

  it('adds cursor files only when cursor is selected', () => {
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
    expect(buildPlan(profile({ agents: ['cursor'] }), selection).ops.map((op) => op.path)).toEqual([
      '.cursor/commands/new-feature.md',
      '.cursor/rules/agentinit-app-router.mdc',
      'AGENTS.md',
      'ARCHITECTURE.md',
    ]);
    expect(buildPlan(profile({ agents: ['windsurf'] }), selection).ops.map((op) => op.path)).toEqual([
      'AGENTS.md',
      'ARCHITECTURE.md',
    ]);
  });
});
