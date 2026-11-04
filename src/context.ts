import { AgentInitError, NotInteractiveError } from './errors.js';
import type { AgentTarget } from './types.js';
import { closestMatch } from './suggest.js';

export const AGENT_TARGETS: readonly AgentTarget[] = ['cursor', 'claude', 'windsurf', 'copilot'];

export interface RunContext {
  cwd: string;
  yes: boolean;
  dryRun: boolean;
  agents: AgentTarget[] | undefined;
  force: boolean;
  json: boolean;
  isInteractive: boolean;
}

export interface RunContextInput {
  cwd: string;
  yes: boolean;
  dryRun: boolean;
  agents: AgentTarget[] | undefined;
  force: boolean;
  json: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}

const VALID_AGENTS = AGENT_TARGETS.join(', ');

export function createRunContext(input: RunContextInput): RunContext {
  return {
    cwd: input.cwd,
    yes: input.yes,
    dryRun: input.dryRun,
    agents: input.agents === undefined ? undefined : [...input.agents],
    force: input.force,
    json: input.json,
    isInteractive: input.stdinIsTTY && input.stdoutIsTTY && !input.yes,
  };
}

export function requireInteractiveOrYes(ctx: RunContext): void {
  if (!ctx.isInteractive && !ctx.yes) {
    throw new NotInteractiveError();
  }
}

export function parseAgents(input: string): AgentTarget[] {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new AgentInitError(
      `Flag --agents requires a comma-separated list. Valid values: ${VALID_AGENTS}.`,
    );
  }

  const unknown = parts.filter((part) => !isAgentTarget(part));
  if (unknown.length > 0) {
    throw new AgentInitError(unknownAgentsMessage(unknown));
  }

  const agents: AgentTarget[] = [];
  for (const part of parts) {
    if (isAgentTarget(part) && !agents.includes(part)) {
      agents.push(part);
    }
  }
  return agents;
}

function isAgentTarget(value: string): value is AgentTarget {
  for (const agent of AGENT_TARGETS) {
    if (agent === value) return true;
  }
  return false;
}

function unknownAgentsMessage(unknown: readonly string[]): string {
  const listed = unknown.map((name) => `"${name}"`).join(', ');
  const noun = unknown.length === 1 ? 'agent' : 'agents';
  const suggestion =
    unknown.length === 1 ? closestMatch(unknown[0] ?? '', AGENT_TARGETS) : undefined;
  const hint =
    suggestion === undefined ? '' : ` Did you mean "${suggestion}"?`;
  return `Unknown ${noun} ${listed}.${hint} Valid values: ${VALID_AGENTS}.`;
}
