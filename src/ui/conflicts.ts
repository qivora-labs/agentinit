import { AgentInitError } from '../errors.js';
import type { Registry } from '../registry/load.js';
import type { FragmentConflict, Selection, SelectionOrigin } from '../registry/resolve.js';
import { fragmentName } from './catalog.js';
import { sanitizeDisplayText } from './display-text.js';
import type { Prompter } from './prompter.js';

export type ConflictDecision =
  | {
      readonly a: string;
      readonly b: string;
      readonly choice: 'keep-both';
    }
  | {
      readonly a: string;
      readonly b: string;
      readonly choice: 'keep-one';
      readonly keep: string;
    };

type KeepChoice = 'keep-one' | 'keep-both';

/**
 * One question per pair from `resolveSelection`. Detected pairs are already
 * omitted there (PRD §3.5). Keeping one drops the other id from the selection.
 */
export async function promptConflicts(
  prompter: Prompter,
  conflicts: readonly FragmentConflict[],
  registry: Registry,
): Promise<ConflictDecision[]> {
  const decisions: ConflictDecision[] = [];
  for (const conflict of conflicts) {
    decisions.push(await promptConflict(prompter, conflict, registry));
  }
  return decisions;
}

/**
 * Keep-one drops the other id. Keep-both leaves the selection unchanged, so
 * both ids stay `manual` and a later `resolveSelection` reports that pair
 * again. `init` must remember answered pairs instead of looping on resolve.
 */
export function applyConflictDecisions(
  selection: Selection,
  decisions: readonly ConflictDecision[],
): Selection {
  const dropped = new Set<string>();
  for (const decision of decisions) {
    if (decision.choice === 'keep-both') continue;
    if (decision.keep !== decision.a && decision.keep !== decision.b) {
      throw new AgentInitError(`"${decision.keep}" is not part of this conflict.`);
    }
    dropped.add(decision.keep === decision.a ? decision.b : decision.a);
  }
  if (dropped.size === 0) return selection;

  if (dropped.has(selection.language)) {
    throw new AgentInitError(
      `Cannot drop language "${selection.language}" without a replacement.`,
    );
  }
  if (dropped.has(selection.architecture)) {
    throw new AgentInitError(
      `Cannot drop architecture "${selection.architecture}" without a replacement.`,
    );
  }

  const origin: Record<string, SelectionOrigin> = {};
  for (const [id, value] of Object.entries(selection.origin)) {
    if (!dropped.has(id)) origin[id] = value;
  }

  return {
    language: selection.language,
    architecture: selection.architecture,
    frameworks: selection.frameworks.filter((id) => !dropped.has(id)),
    libraries: selection.libraries.filter((id) => !dropped.has(id)),
    origin,
  };
}

async function promptConflict(
  prompter: Prompter,
  conflict: FragmentConflict,
  registry: Registry,
): Promise<ConflictDecision> {
  const left = sanitizeDisplayText(fragmentName(registry, conflict.a));
  const right = sanitizeDisplayText(fragmentName(registry, conflict.b));
  const choice = await prompter.select({
    message: `"${left}" and "${right}" conflict. Keep one, or keep both?`,
    options: [
      { value: 'keep-one' satisfies KeepChoice, label: 'Keep one' },
      { value: 'keep-both' satisfies KeepChoice, label: 'Keep both' },
    ],
  });

  if (choice === 'keep-both') {
    return { a: conflict.a, b: conflict.b, choice: 'keep-both' };
  }

  const keep = await prompter.select({
    message: 'Which one should we keep?',
    options: [
      { value: conflict.a, label: left },
      { value: conflict.b, label: right },
    ],
  });
  return { a: conflict.a, b: conflict.b, choice: 'keep-one', keep };
}
