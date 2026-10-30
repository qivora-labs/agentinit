import { compareText } from '../compare-text.js';
import { AgentInitError } from '../errors.js';
import type { ResolvedSelection } from '../registry/resolve.js';
import { agentsMdAdapter } from '../targets/agents-md.js';
import { architectureMdAdapter } from '../targets/architecture-md.js';
import type { AgentTarget, FileOp, ProjectProfile } from '../types.js';
import { renderTargetContext } from './render.js';
import { alwaysOnTokenWarning, estimateTokens } from './tokens.js';
import type { Plan, PlanWarning, TargetAdapter } from './types.js';

const SHARED_ADAPTERS: readonly TargetAdapter[] = [agentsMdAdapter, architectureMdAdapter];

const AGENT_ORDER = ['cursor', 'claude', 'windsurf', 'copilot'] as const satisfies readonly AgentTarget[];

/**
 * T21–T24 add entries here. A missing or `undefined` entry adds no files,
 * so shared outputs stay free of agent-specific content. `undefined` is
 * allowed so a test can clear an entry without deleting the key.
 */
export const agentAdapters: Partial<Record<AgentTarget, TargetAdapter | undefined>> = {};

export function buildPlan(profile: ProjectProfile, resolved: ResolvedSelection): Plan {
  const ctx = renderTargetContext(profile, resolved);
  const ops: FileOp[] = [];
  for (const adapter of SHARED_ADAPTERS) {
    ops.push(...adapter(ctx));
  }

  const selected = new Set(profile.agents);
  for (const agent of AGENT_ORDER) {
    if (!selected.has(agent)) continue;
    const adapter = agentAdapters[agent];
    if (adapter === undefined) continue;
    ops.push(...adapter(ctx));
  }

  ops.sort(compareOps);
  assertUniqueOps(ops);

  const alwaysOn = ops.find((op) => op.path === 'AGENTS.md' && op.blockId === 'core');
  if (alwaysOn === undefined) {
    throw new AgentInitError('Plan is missing the AGENTS.md core block.');
  }
  const alwaysOnTokens = estimateTokens(alwaysOn.content);
  const warning = alwaysOnTokenWarning(alwaysOnTokens);
  const warnings: PlanWarning[] = warning === undefined ? [] : [warning];
  return { ops, alwaysOnTokens, warnings };
}

function compareOps(left: FileOp, right: FileOp): number {
  const byPath = compareText(left.path, right.path);
  if (byPath !== 0) return byPath;
  return compareText(left.blockId ?? '', right.blockId ?? '');
}

function assertUniqueOps(ops: readonly FileOp[]): void {
  const paths = new Set<string>();
  const blocks = new Set<string>();
  for (const op of ops) {
    if (paths.has(op.path)) {
      throw new AgentInitError(`Duplicate plan path "${op.path}".`);
    }
    paths.add(op.path);
    if (op.kind !== 'managed-block') continue;
    if (op.blockId === undefined || op.blockId.length === 0) {
      throw new AgentInitError(`Managed block "${op.path}" is missing a block id.`);
    }
    if (blocks.has(op.blockId)) {
      throw new AgentInitError(`Duplicate managed block "${op.blockId}".`);
    }
    blocks.add(op.blockId);
  }
}
