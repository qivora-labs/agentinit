import { AGENT_TARGETS } from '../context.js';
import type { AgentTarget } from '../types.js';
import type { Prompter } from './prompter.js';

export const AGENT_LABELS = {
  cursor: 'Cursor',
  claude: 'Claude Code',
  windsurf: 'Windsurf',
  copilot: 'GitHub Copilot',
} as const satisfies Record<AgentTarget, string>;

/** Folder each agent owns. Used by the init report and path-prefix grouping. */
export const AGENT_FOLDERS = {
  cursor: '.cursor/',
  claude: '.claude/',
  windsurf: '.windsurf/',
  copilot: '.github/',
} as const satisfies Record<AgentTarget, string>;

export interface AgentPromptInput {
  /** Empty means none of the four has config yet, so all four start selected (PRD §3.5). */
  readonly preselected: readonly AgentTarget[];
  /** `--agents` skips the prompt and replaces preselection. */
  readonly override?: readonly AgentTarget[];
}

/**
 * `--agents` wins. Otherwise agents whose config already exists are selected.
 * An empty preselection is all four.
 */
export function resolvedAgents(
  preselected: readonly AgentTarget[],
  override?: readonly AgentTarget[],
): AgentTarget[] {
  if (override !== undefined) return [...override];
  if (preselected.length > 0) return [...preselected];
  return [...AGENT_TARGETS];
}

export async function selectAgents(prompter: Prompter, input: AgentPromptInput): Promise<AgentTarget[]> {
  if (input.override !== undefined) return [...input.override];
  return prompter.multiselect({
    message: 'Which agents should we generate rules for?',
    options: AGENT_TARGETS.map((agent) => ({ value: agent, label: AGENT_LABELS[agent] })),
    initialValues: resolvedAgents(input.preselected),
    // Clack defaults `required` to true. Clearing every agent matches an empty `--agents`.
    required: false,
  });
}
