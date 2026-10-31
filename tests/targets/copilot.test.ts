import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/plan/build-plan.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { copilotAdapter } from '../../src/targets/copilot.js';
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

function instruction(scope: 'glob' | 'auto', globs: readonly string[], srcDir: '' | 'src' = 'src'): string {
  return content(
    copilotAdapter(
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
    '.github/instructions/agentinit-app-router.instructions.md',
  );
}

describe('copilotAdapter', () => {
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
  const ops = copilotAdapter(ctx);

  it('snapshots the pointer block, each scope, and one workflow', async () => {
    expect(ops.map((op) => op.path)).toEqual([
      '.github/copilot-instructions.md',
      '.github/instructions/agentinit-app-router.instructions.md',
      '.github/instructions/agentinit-zustand.instructions.md',
      '.github/prompts/agentinit-review.prompt.md',
      '.github/prompts/new-feature.prompt.md',
    ]);
    expect(ops.map((op) => ({ kind: op.kind, target: op.target, blockId: op.blockId }))).toEqual([
      { kind: 'managed-block', target: 'copilot', blockId: 'copilot' },
      { kind: 'file', target: 'copilot', blockId: undefined },
      { kind: 'file', target: 'copilot', blockId: undefined },
      { kind: 'file', target: 'copilot', blockId: undefined },
      { kind: 'file', target: 'copilot', blockId: undefined },
    ]);

    const pointer = content(ops, '.github/copilot-instructions.md');
    const glob = content(ops, '.github/instructions/agentinit-app-router.instructions.md');
    const auto = content(ops, '.github/instructions/agentinit-zustand.instructions.md');
    const manual = content(ops, '.github/prompts/agentinit-review.prompt.md');
    const workflow = content(ops, '.github/prompts/new-feature.prompt.md');
    for (const text of [pointer, glob, auto, manual, workflow]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toContain('\r');
      expect(text).not.toContain('ALWAYS_RULE');
      expect(text).not.toContain('agentinit:begin');
    }
    expect(pointer).toContain('AGENTS.md');
    expect(pointer).toContain('.github/instructions/');
    expect(manual).not.toContain('applyTo');
    expect(manual).not.toContain('argument-hint');
    expect(workflow).not.toContain('agent:');
    expect(workflow).not.toContain('mode:');

    await expect(pointer).toMatchFileSnapshot('../__snapshots__/targets/copilot-instructions.md');
    await expect(glob).toMatchFileSnapshot('../__snapshots__/targets/copilot-glob.instructions.md');
    await expect(auto).toMatchFileSnapshot('../__snapshots__/targets/copilot-auto.instructions.md');
    await expect(manual).toMatchFileSnapshot('../__snapshots__/targets/copilot-manual.prompt.md');
    await expect(workflow).toMatchFileSnapshot('../__snapshots__/targets/copilot-workflow.prompt.md');
  });

  it('serializes applyTo as one quoted comma-separated string that round-trips through yaml.parse', () => {
    const text = content(ops, '.github/instructions/agentinit-app-router.instructions.md');
    expect(text).toContain('applyTo: "src/app/**/*.ts,src/app/**/*.tsx"\n');
    expect(text).not.toMatch(/applyTo:\s*\[/u);
    expect(text).not.toMatch(/applyTo:\s*"[^"]+"\s*,/u);
    expect(parseYaml(frontmatter(text))).toEqual({
      description: GLOB_DESCRIPTION,
      applyTo: 'src/app/**/*.ts,src/app/**/*.tsx',
    });
    expect(parseYaml(frontmatter(content(ops, '.github/instructions/agentinit-zustand.instructions.md')))).toEqual({
      description: 'Client state that the server does not own.',
      applyTo: 'src/**/*.ts',
    });
    expect(parseYaml(frontmatter(content(ops, '.github/prompts/agentinit-review.prompt.md')))).toEqual({
      description: 'Manual only when mentioned.',
    });
    expect(parseYaml(frontmatter(content(ops, '.github/prompts/new-feature.prompt.md')))).toEqual({
      description: 'A workflow.',
      'argument-hint': '<feature-name>',
    });
  });

  it.each([
    {
      behavior: 'quotes an applyTo list that starts with *',
      srcDir: 'src' as const,
      globs: ['**/*.test.tsx', '*.test.ts'],
      line: 'applyTo: "**/*.test.tsx,*.test.ts"',
      parsed: '**/*.test.tsx,*.test.ts',
    },
    {
      behavior: 'quotes applyTo patterns that start with * when srcDir is empty',
      srcDir: '' as const,
      globs: ['{{src}}**/*.tsx', '{{src}}**/*.css'],
      line: 'applyTo: "**/*.tsx,**/*.css"',
      parsed: '**/*.tsx,**/*.css',
    },
  ])('$behavior and round-trips through yaml.parse', ({ srcDir, globs, line, parsed }) => {
    const text = instruction('glob', globs, srcDir);
    expect(text).toContain(`${line}\n`);
    expect(text).not.toMatch(/applyTo:\s*\[/u);
    expect(parseYaml(frontmatter(text))).toEqual({ description: 'File scoped rule.', applyTo: parsed });
  });

  it('omits a glob or auto instruction when the rendered glob list is empty', () => {
    const empty = copilotAdapter(
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
    expect(empty.map((op) => op.path)).toEqual(['.github/copilot-instructions.md']);
    expect(content(empty, '.github/copilot-instructions.md')).not.toContain('GLOB_RULE');
    expect(content(empty, '.github/copilot-instructions.md')).not.toContain('AUTO_RULE');
  });

  it.each([
    {
      behavior: 'quotes a colon in an instruction description',
      description: 'Apply to App Router: keep server components.',
      line: 'description: "Apply to App Router: keep server components."',
    },
    {
      behavior: 'quotes a hash in an instruction description',
      description: 'Keep # comments in examples.',
      line: 'description: "Keep # comments in examples."',
    },
    {
      behavior: 'quotes a numeric instruction description',
      description: '15',
      line: 'description: "15"',
    },
  ])('$behavior and round-trips through yaml.parse', ({ description, line }) => {
    const text = content(
      copilotAdapter(
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
      '.github/instructions/agentinit-zustand.instructions.md',
    );
    expect(text).toContain(`${line}\n`);
    expect(text).toContain('applyTo: "src/**/*.ts"\n');
    expect(parseYaml(frontmatter(text))).toEqual({ description, applyTo: 'src/**/*.ts' });
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
      copilotAdapter(
        renderTargetContext(
          profile(),
          resolved(
            [layeredFragment()],
            [workflowFragment({ id: 'review-arch', name: 'Review arch', order: 50, argumentHint, body: 'STEPS' })],
          ),
        ),
      ),
      '.github/prompts/review-arch.prompt.md',
    );
    expect(text).toContain(`${line}\n`);
    expect(text).not.toMatch(/^agent:/mu);
    expect(text).not.toMatch(/^mode:/mu);
    expect(parseYaml(frontmatter(text))).toEqual({
      description: 'A workflow.',
      'argument-hint': argumentHint,
    });
  });

  it('omits argument-hint when the workflow has none', () => {
    const text = content(
      copilotAdapter(
        renderTargetContext(
          profile(),
          resolved(
            [layeredFragment()],
            [workflowFragment({ id: 'review-arch', name: 'Review arch', order: 50, body: 'STEPS' })],
          ),
        ),
      ),
      '.github/prompts/review-arch.prompt.md',
    );
    expect(text).not.toMatch(/^argument-hint:/mu);
    expect(parseYaml(frontmatter(text))).toEqual({ description: 'A workflow.' });
  });

  it('writes no Copilot file that copies always-on fragment text', () => {
    const onlyAlways = copilotAdapter(
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
    expect(onlyAlways.map((op) => op.path)).toEqual(['.github/copilot-instructions.md']);
    expect(content(onlyAlways, '.github/copilot-instructions.md')).toBe(
      'Follow `AGENTS.md` at the repository root.\n\nScoped rules are in `.github/instructions/`.\n',
    );
  });

  it('adds copilot files only when copilot is selected', () => {
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
    expect(buildPlan(profile({ agents: ['copilot'] }), selection).ops.map((op) => op.path)).toEqual([
      '.github/copilot-instructions.md',
      '.github/instructions/agentinit-app-router.instructions.md',
      '.github/prompts/agentinit-review.prompt.md',
      '.github/prompts/new-feature.prompt.md',
      'AGENTS.md',
      'ARCHITECTURE.md',
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
