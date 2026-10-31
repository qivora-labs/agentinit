import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { agentAdapters, buildPlan } from '../../src/plan/build-plan.js';
import { scriptCommand } from '../../src/plan/placeholders.js';
import { estimateTokens } from '../../src/plan/tokens.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import { resolveSelection, type ResolvedSelection } from '../../src/registry/resolve.js';
import type { AgentTarget, FileOp } from '../../src/types.js';
import type { TargetAdapter } from '../../src/plan/types.js';
import { layeredFragment, profile, resolved, ruleFragment, workflowFragment } from './helpers.js';

const sampleDir = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));

function content(plan: { ops: FileOp[] }, path: string): string {
  const found = plan.ops.find((op) => op.path === path);
  if (found === undefined) throw new Error(`missing ${path}`);
  return found.content;
}

function withAdapter(agent: AgentTarget, adapter: TargetAdapter, run: () => void): void {
  const previous = agentAdapters[agent];
  agentAdapters[agent] = adapter;
  try {
    run();
  } finally {
    agentAdapters[agent] = previous;
  }
}

describe('buildPlan', () => {
  let sample: ResolvedSelection;

  beforeAll(async () => {
    const registry: Registry = await loadRegistry(sampleDir);
    sample = resolveSelection(registry, {
      language: 'typescript-strict',
      architecture: 'layered',
      frameworks: ['nextjs-app-router'],
      libraries: ['vitest'],
      origin: {},
    });
  });

  const existing = profile({
    scripts: { typecheck: 'tsc --noEmit', test: 'vitest', lint: 'eslint .' },
    folders: ['presentation', 'domain', 'lib', 'application'],
    agents: ['cursor', 'claude'],
  });

  it('writes shared managed blocks once, sorted by path, when no agent is selected', async () => {
    const plan = buildPlan({ ...existing, agents: [] }, sample);
    expect(plan.ops.map((op) => op.path)).toEqual(['AGENTS.md', 'ARCHITECTURE.md']);
    expect(plan.ops.map((op) => ({ kind: op.kind, blockId: op.blockId, target: op.target }))).toEqual([
      { kind: 'managed-block', blockId: 'core', target: 'shared' },
      { kind: 'managed-block', blockId: 'architecture', target: 'shared' },
    ]);

    const agents = content(plan, 'AGENTS.md');
    const architecture = content(plan, 'ARCHITECTURE.md');
    expect(agents.endsWith('\n')).toBe(true);
    expect(agents.endsWith('\n\n')).toBe(false);
    expect(architecture.endsWith('\n')).toBe(true);
    expect(architecture.endsWith('\n\n')).toBe(false);
    expect(agents).not.toContain('agentinit:begin');
    expect(architecture).not.toContain('agentinit:begin');
    expect(agents).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(architecture).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(agents).not.toContain('1.0.0');
    expect(architecture).not.toContain('1.0.0');

    await expect(agents).toMatchFileSnapshot('../__snapshots__/plan/agents-existing.md');
    await expect(architecture).toMatchFileSnapshot('../__snapshots__/plan/architecture-existing.md');
  });

  it('omits project commands in greenfield and describes the planned layout', async () => {
    const plan = buildPlan(
      profile({
        mode: 'greenfield',
        packageManager: null,
        scripts: { test: 'vitest' },
        folders: ['lib'],
        agents: [],
      }),
      sample,
    );
    const agents = content(plan, 'AGENTS.md');
    const architecture = content(plan, 'ARCHITECTURE.md');
    expect(agents).not.toContain('## Project commands');
    expect(agents).not.toContain('pnpm');
    expect(architecture).not.toContain('src/lib');
    expect(architecture).not.toContain('## Other existing folders');
    expect(architecture).not.toBe(content(buildPlan(existing, sample), 'ARCHITECTURE.md'));

    await expect(agents).toMatchFileSnapshot('../__snapshots__/plan/agents-greenfield.md');
    await expect(architecture).toMatchFileSnapshot('../__snapshots__/plan/architecture-greenfield.md');
  });

  it('writes LF when an always-on fragment body uses CRLF', () => {
    const plan = buildPlan(
      profile({ scripts: {} }),
      resolved([
        layeredFragment(),
        ruleFragment({
          id: 'typescript-strict',
          name: 'TypeScript strict',
          category: 'language',
          scope: 'always',
          order: 20,
          body: '## Boundary\r\n\r\nALWAYS typecheck in strict mode.\r\n',
        }),
      ]),
    );
    const agents = content(plan, 'AGENTS.md');
    expect(agents).not.toContain('\r');
    expect(agents).toContain('### Boundary\n\nALWAYS typecheck in strict mode.\n');
  });

  it('keeps always-on fragment text once, in order, and leaves scoped text out', () => {
    const plan = buildPlan(
      profile({ scripts: {} }),
      resolved(
        [
          ruleFragment({
            id: 'zeta',
            name: 'Zeta',
            category: 'language',
            scope: 'always',
            order: 30,
            body: 'ZETA_RULE',
          }),
          ruleFragment({
            id: 'globbed',
            name: 'Globbed',
            category: 'framework',
            scope: 'glob',
            order: 5,
            body: 'GLOB_RULE',
            globs: ['{{src}}app/**/*.ts'],
          }),
          layeredFragment(),
          ruleFragment({
            id: 'early',
            name: 'Early',
            category: 'language',
            scope: 'always',
            order: 1,
            body: 'EARLY_RULE',
          }),
          ruleFragment({
            id: 'alpha',
            name: 'Alpha',
            category: 'language',
            scope: 'always',
            order: 20,
            body: 'ALPHA_RULE',
          }),
          ruleFragment({
            id: 'autoed',
            name: 'Autoed',
            category: 'library',
            scope: 'auto',
            order: 4,
            body: 'AUTO_RULE',
            globs: ['{{src}}**/*.ts'],
          }),
          ruleFragment({
            id: 'manualed',
            name: 'Manualed',
            category: 'library',
            scope: 'manual',
            order: 2,
            body: 'MANUAL_RULE',
          }),
        ],
        [workflowFragment({ id: 'new-feature', name: 'New feature', order: 50, body: 'WORKFLOW_RULE' })],
      ),
    );
    const agents = content(plan, 'AGENTS.md');
    expect(agents.indexOf('## Architecture')).toBeLessThan(agents.indexOf('## Early'));
    expect(agents.indexOf('## Early')).toBeLessThan(agents.indexOf('## Alpha'));
    expect(agents.indexOf('## Alpha')).toBeLessThan(agents.indexOf('## Zeta'));
    expect(agents.match(/Controllers call services/gu)).toHaveLength(1);
    expect(agents).not.toContain('GLOB_RULE');
    expect(agents).not.toContain('AUTO_RULE');
    expect(agents).not.toContain('MANUAL_RULE');
    expect(agents).not.toContain('WORKFLOW_RULE');
    expect(agents).not.toContain('Business rules.');
    expect(content(plan, 'ARCHITECTURE.md')).not.toContain('const example = true');
  });

  it.each(['npm', 'pnpm', 'yarn', 'bun'] as const)('lists only existing %s scripts', (packageManager) => {
    const agents = content(
      buildPlan(
        profile({
          packageManager,
          scripts: { test: 'vitest run', lint: 'eslint .' },
        }),
        resolved([
          layeredFragment(),
          ruleFragment({
            id: 'typescript-strict',
            name: 'TypeScript strict',
            category: 'language',
            scope: 'always',
            order: 20,
            body: 'Run {{scripts.build}} before {{scripts.test}}.',
          }),
        ]),
      ),
      'AGENTS.md',
    );
    expect(agents).toContain(`- \`${scriptCommand(packageManager, 'lint')}\``);
    expect(agents).toContain(`- \`${scriptCommand(packageManager, 'test')}\``);
    expect(agents).not.toContain(scriptCommand(packageManager, 'build'));
    expect(agents).not.toContain('vitest run');
    expect(agents.indexOf(scriptCommand(packageManager, 'lint'))).toBeLessThan(
      agents.indexOf(scriptCommand(packageManager, 'test')),
    );
  });

  it('nests fragment headings under the fragment name and leaves fenced headings alone', () => {
    const agents = content(
      buildPlan(
        profile({ scripts: {} }),
        resolved([
          layeredFragment(),
          ruleFragment({
            id: 'typescript-strict',
            name: 'TypeScript strict',
            category: 'language',
            scope: 'always',
            order: 20,
            body: ['## Boundary', 'Rule.', '', '```md', '## Not a heading', '```'].join('\n'),
          }),
        ]),
      ),
      'AGENTS.md',
    );
    expect(agents).toMatch(/## TypeScript strict\n\n### Boundary\nRule\./u);
    expect(agents).toContain('```md\n## Not a heading\n```');
  });

  it('omits the commands section when the mode is greenfield even if scripts were passed', () => {
    const agents = content(
      buildPlan(
        profile({ mode: 'greenfield', packageManager: 'pnpm', scripts: { test: 'vitest' } }),
        resolved([layeredFragment()]),
      ),
      'AGENTS.md',
    );
    expect(agents).not.toContain('## Project commands');
    expect(agents).not.toContain('pnpm test');
  });

  it('reports the always-on estimate and warns only above 1,500 tokens', () => {
    const quiet = buildPlan(profile({ scripts: {} }), resolved([layeredFragment()]));
    const agents = content(quiet, 'AGENTS.md');
    expect(quiet.alwaysOnTokens).toBe(estimateTokens(agents));
    expect(quiet.alwaysOnTokens).toBeLessThanOrEqual(1500);
    expect(quiet.warnings).toEqual([]);

    const loud = buildPlan(
      profile({ scripts: {} }),
      resolved([
        layeredFragment(),
        ruleFragment({
          id: 'typescript-strict',
          name: 'TypeScript strict',
          category: 'language',
          scope: 'always',
          order: 20,
          body: 'x'.repeat(7000),
        }),
      ]),
    );
    expect(loud.alwaysOnTokens).toBe(estimateTokens(content(loud, 'AGENTS.md')));
    expect(loud.alwaysOnTokens).toBeGreaterThan(1500);
    expect(loud.warnings).toEqual([
      { kind: 'always-on-tokens', tokens: loud.alwaysOnTokens, limit: 1500 },
    ]);
  });

  it('throws on a duplicate path or a duplicate managed block', () => {
    const selection = resolved([layeredFragment()]);
    withAdapter(
      'cursor',
      () => [
        {
          path: 'AGENTS.md',
          kind: 'managed-block',
          blockId: 'extra',
          content: 'nope\n',
          target: 'cursor',
        },
      ],
      () => {
        expect(() => buildPlan(profile({ agents: ['cursor'] }), selection)).toThrow(AgentInitError);
        expect(() => buildPlan(profile({ agents: ['cursor'] }), selection)).toThrow(
          'Duplicate plan path "AGENTS.md".',
        );
      },
    );
    withAdapter(
      'cursor',
      () => [
        {
          path: 'CLAUDE.md',
          kind: 'managed-block',
          blockId: 'core',
          content: 'nope\n',
          target: 'cursor',
        },
      ],
      () => {
        expect(() => buildPlan(profile({ agents: ['cursor'] }), selection)).toThrow(
          'Duplicate managed block "core".',
        );
      },
    );
  });

  it('runs a registered agent adapter only when that agent is selected', () => {
    const selection = resolved([layeredFragment()]);
    const adapter: TargetAdapter = () => [
      { path: 'notes.md', kind: 'file', content: 'n\n', target: 'windsurf' },
    ];
    withAdapter('windsurf', adapter, () => {
      expect(buildPlan(profile({ agents: [] }), selection).ops.map((op) => op.path)).toEqual([
        'AGENTS.md',
        'ARCHITECTURE.md',
      ]);
      expect(buildPlan(profile({ agents: ['windsurf'] }), selection).ops.map((op) => op.path)).toEqual([
        'AGENTS.md',
        'ARCHITECTURE.md',
        'notes.md',
      ]);
    });
  });

  it('is identical across two runs', () => {
    const first = buildPlan(existing, sample);
    const second = buildPlan(existing, sample);
    expect(second).toEqual(first);
  });

  it('throws when the selected architecture fragment was not resolved', () => {
    expect(() => buildPlan(profile(), resolved([]))).toThrow(
      'Architecture fragment "layered" was not resolved.',
    );
  });

  it('throws when the architecture fragment is missing its summary or map', () => {
    const summaryOnly = ruleFragment({
      id: 'layered',
      name: 'Layered',
      category: 'architecture',
      scope: 'always',
      order: 10,
      body: '## Summary\nShort.\n',
    });
    const mapOnly = ruleFragment({
      id: 'layered',
      name: 'Layered',
      category: 'architecture',
      scope: 'always',
      order: 10,
      body: '## Map\n| `{{src}}domain/` | Rules. |\n',
    });
    expect(() => buildPlan(profile(), resolved([mapOnly]))).toThrow('missing a "## Summary" section');
    expect(() => buildPlan(profile(), resolved([summaryOnly]))).toThrow('missing a "## Map" section');
  });
});
