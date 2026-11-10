import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProject } from '../src/detect/index.js';
import { isOwnedBlockKey, isOwnedPath, isOwnedWorkflowPath, ownedRuleId } from '../src/owned-paths.js';
import { buildPlan } from '../src/plan/build-plan.js';
import { loadRegistry } from '../src/registry/load.js';
import { resolveSelection, type ResolvedSelection } from '../src/registry/resolve.js';
import type { AgentTarget, FileOp, ProjectProfile } from '../src/types.js';
import { createTempProject } from './e2e/project.js';
import { profile, resolved } from './plan/helpers.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const AGENTS = ['cursor', 'claude', 'windsurf', 'copilot'] as const satisfies readonly AgentTarget[];
/** Fixtures that cannot produce a plan (JS-only projects, monorepo roots). */
const SKIP_DETECT_FIXTURES = new Set(['js-only', 'pnpm-monorepo']);

const temp = createTempProject('agentinit-owned-');

afterEach(() => temp.cleanup());

describe('isOwnedPath / isOwnedBlockKey', () => {
  it.each([
    '.cursor/rules/agentinit-zustand.mdc',
    '.claude/rules/agentinit-vitest.md',
    '.windsurf/rules/agentinit-nextjs-app-router.md',
    '.github/instructions/agentinit-tailwind.instructions.md',
    '.cursor/commands/new-feature.md',
    '.cursor/skills/new-feature/SKILL.md',
    '.claude/skills/new-feature/SKILL.md',
    '.claude/skills/agentinit-forms/SKILL.md',
    '.windsurf/workflows/refactor.md',
    '.github/prompts/write-tests.prompt.md',
    '.github/prompts/agentinit-forms.prompt.md',
  ])('accepts owned whole-file path %s', (filePath) => {
    expect(isOwnedPath(filePath)).toBe(true);
  });

  it.each([
    'secret-notes.txt',
    'package.json',
    '.git/config',
    '.cursor/rules/custom.mdc',
    '.cursor/rules/../../x.mdc',
    'AGENTS.md',
    'CLAUDE.md',
    'ARCHITECTURE.md',
    '.github/copilot-instructions.md',
  ])('rejects non-owned or bare shared path %s', (filePath) => {
    expect(isOwnedPath(filePath)).toBe(false);
  });

  it.each([
    ['AGENTS.md', 'core'],
    ['ARCHITECTURE.md', 'architecture'],
    ['CLAUDE.md', 'claude'],
    ['.github/copilot-instructions.md', 'copilot'],
  ] as const)('accepts owned block key %s#%s', (filePath, blockId) => {
    expect(isOwnedBlockKey(filePath, blockId)).toBe(true);
  });

  it('rejects a block key on a non-shared path', () => {
    expect(isOwnedBlockKey('.cursor/rules/agentinit-zustand.mdc', 'core')).toBe(false);
  });

  it.each([
    ['.cursor/rules/agentinit-zustand.mdc', 'zustand'],
    ['.claude/rules/agentinit-vitest.md', 'vitest'],
    ['.github/instructions/agentinit-tailwind.instructions.md', 'tailwind'],
  ] as const)('reads rule fragment id from %s', (filePath, id) => {
    expect(ownedRuleId(filePath)).toBe(id);
    expect(isOwnedWorkflowPath(filePath)).toBe(false);
  });

  it.each([
    '.cursor/commands/new-feature.md',
    '.windsurf/workflows/refactor.md',
    '.github/prompts/write-tests.prompt.md',
    '.claude/skills/new-feature/SKILL.md',
    '.cursor/skills/new-feature/SKILL.md',
  ])('classifies workflow path %s', (filePath) => {
    expect(isOwnedWorkflowPath(filePath)).toBe(true);
    expect(ownedRuleId(filePath)).toBeUndefined();
  });
});

describe('every plan path is owned', () => {
  it('covers every registry fragment under every target and every e2e fixture', async () => {
    const registry = await loadRegistry();
    const rules = registry.fragments.filter((fragment) => fragment.meta.category !== 'workflow');
    const workflows = registry.byCategory('workflow');
    const selection = resolved(rules, workflows);
    const base = profile({
      language: 'typescript-strict',
      architecture: { id: 'layered', confidence: 1 },
      frameworks: rules.filter((fragment) => fragment.meta.category === 'framework').map((f) => f.meta.id),
      libraries: rules.filter((fragment) => fragment.meta.category === 'library').map((f) => f.meta.id),
    });

    for (const agent of AGENTS) {
      assertOwnedOps(buildPlan({ ...base, agents: [agent] }, selection).ops, `registry×${agent}`);
    }
    assertOwnedOps(buildPlan({ ...base, agents: [...AGENTS] }, selection).ops, 'registry×all-agents');

    const fixtureNames = (await readdir(fixturesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('registry-') && !entry.name.startsWith('detect-'))
      .map((entry) => entry.name)
      .sort();

    const skippedDetect = new Set<string>();
    for (const name of fixtureNames) {
      const dir = await temp.copyFixture(name);
      let detection;
      try {
        detection = detectProject(dir, registry);
      } catch (error) {
        if (SKIP_DETECT_FIXTURES.has(name)) {
          skippedDetect.add(name);
          continue;
        }
        throw error;
      }
      if (detection.mode === 'greenfield') {
        const greenfield = profile({
          root: dir,
          mode: 'greenfield',
          agents: [...AGENTS],
          architecture: { id: 'layered', confidence: 1 },
          language: 'typescript-strict',
        });
        const resolvedGreenfield = resolveSelection(registry, {
          language: 'typescript-strict',
          architecture: 'layered',
          frameworks: [],
          libraries: [],
          origin: {},
        });
        assertOwnedOps(buildPlan(greenfield, resolvedGreenfield).ops, `fixture:${name}`);
        continue;
      }
      const draft = detection.draft;
      const project: ProjectProfile = {
        root: draft.root,
        mode: draft.mode,
        name: draft.name,
        packageManager: draft.packageManager,
        srcDir: draft.srcDir,
        language: draft.language,
        packages: draft.packages,
        scripts: draft.scripts,
        frameworks: draft.frameworks,
        libraries: draft.libraries,
        architecture: draft.architecture,
        folders: draft.folders,
        existingAgentFiles: draft.existingAgentFiles,
        isMonorepo: draft.isMonorepo,
        agents: [...AGENTS],
      };
      const resolvedFixture: ResolvedSelection = resolveSelection(
        registry,
        {
          language: draft.language,
          architecture: draft.architecture.id,
          frameworks: draft.frameworks,
          libraries: draft.libraries,
          origin: {},
        },
        { packages: draft.packages, files: draft.existingAgentFiles },
      );
      assertOwnedOps(buildPlan(project, resolvedFixture).ops, `fixture:${name}`);
    }
    expect([...skippedDetect].sort()).toEqual([...SKIP_DETECT_FIXTURES].sort());
  });
});

function assertOwnedOps(ops: readonly FileOp[], label: string): void {
  expect(ops.length, label).toBeGreaterThan(0);
  for (const op of ops) {
    if (op.kind === 'managed-block') {
      const blockId = op.blockId;
      expect(blockId, `${label} ${op.path}`).toBeTypeOf('string');
      if (blockId === undefined) continue;
      expect(isOwnedBlockKey(op.path, blockId), `${label} ${op.path}#${blockId}`).toBe(true);
      continue;
    }
    expect(isOwnedPath(op.path), `${label} ${op.path}`).toBe(true);
  }
}
