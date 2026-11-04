import { AGENT_TARGETS } from '../context.js';
import type { AgentTarget } from '../types.js';
import type { Prompter } from './prompter.js';
import { withStep } from './steps.js';

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

/** Picker hint naming what the agent target writes (PRD §3.2). */
export const AGENT_HINTS = {
  cursor: '.cursor/',
  claude: '.claude/ + CLAUDE.md',
  windsurf: '.windsurf/',
  copilot: '.github/',
} as const satisfies Record<AgentTarget, string>;

/**
 * Exact root markers that belong to an agent when the plan no longer lists
 * them (stale deletes). Keep in sync with `PRESELECT` in `existing-agents.ts`.
 */
export const AGENT_ROOT_MARKERS: ReadonlyMap<string, AgentTarget> = new Map([
  ['CLAUDE.md', 'claude'],
  ['.cursorrules', 'cursor'],
  ['.windsurfrules', 'windsurf'],
]);

/**
 * Extra directory prefixes beyond `AGENT_FOLDERS` (Windsurf's Devin Desktop
 * layout). Same sync note as `AGENT_ROOT_MARKERS`.
 */
export const AGENT_EXTRA_FOLDERS: Readonly<Partial<Record<AgentTarget, readonly string[]>>> = {
  windsurf: ['.devin/'],
};
export interface AgentPromptInput {
  /** Empty means none of the four has config yet, so all four start selected (PRD §3.5). */
  readonly preselected: readonly AgentTarget[];
  /** `--agents` skips the prompt and replaces preselection. */
  readonly override?: readonly AgentTarget[];
}

export interface AgentStepInfo {
  readonly step: number;
  readonly total: number;
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

export async function selectAgents(
  prompter: Prompter,
  input: AgentPromptInput,
  stepInfo?: AgentStepInfo,
): Promise<AgentTarget[]> {
  if (input.override !== undefined) return [...input.override];
  const question = 'Which agents should we generate rules for?';
  const headed = stepInfo === undefined ? question : withStep(stepInfo.step, stepInfo.total, question);
  return prompter.multiselect({
    message: `${headed}\nAGENTS.md is always written.`,
    options: AGENT_TARGETS.map((agent) => ({
      value: agent,
      label: AGENT_LABELS[agent],
      hint: AGENT_HINTS[agent],
    })),
    initialValues: resolvedAgents(input.preselected),
    // Clack defaults `required` to true. Clearing every agent matches an empty `--agents`.
    required: false,
  });
}
