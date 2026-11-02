import { AgentInitError } from '../errors.js';
import type { Registry } from '../registry/load.js';
import {
  resolveSelection,
  type FragmentConflict,
  type ProjectFacts,
  type ResolvedSelection,
  type Selection,
} from '../registry/resolve.js';
import { applyConflictDecisions, promptConflicts } from '../ui/conflicts.js';
import type { Prompter } from '../ui/prompter.js';

/**
 * Keep-both leaves the pair in the next `resolveSelection`. Remember it so
 * the prompt does not repeat. A non-interactive run never asks and keeps both.
 */
export async function resolveWithConflicts(
  registry: Registry,
  selection: Selection,
  facts: ProjectFacts,
  interactive: boolean,
  prompts: () => Prompter,
): Promise<ResolvedSelection> {
  const answered = new Set<string>();
  let current = selection;
  for (;;) {
    const resolved = resolveSelection(registry, current, facts);
    const pending = resolved.conflicts.filter((conflict) => !answered.has(conflictKey(conflict)));
    if (pending.length === 0 || !interactive) return resolved;
    const decisions = await promptConflicts(prompts(), pending, registry);
    for (const decision of decisions) {
      if (decision.choice === 'keep-both') answered.add(conflictKey(decision));
    }
    const next = applyConflictDecisions(current, decisions);
    if (sameSelection(current, next) && decisions.every((decision) => decision.choice !== 'keep-both')) {
      throw new AgentInitError('Could not resolve fragment conflicts.');
    }
    current = next;
  }
}

function conflictKey(conflict: Pick<FragmentConflict, 'a' | 'b'>): string {
  return `${conflict.a}\0${conflict.b}`;
}

function sameSelection(left: Selection, right: Selection): boolean {
  return (
    left.language === right.language &&
    left.architecture === right.architecture &&
    sameIds(left.frameworks, right.frameworks) &&
    sameIds(left.libraries, right.libraries)
  );
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}
