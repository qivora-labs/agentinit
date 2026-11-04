import type { Change } from '../io/changes.js';
import { ALWAYS_ON_TOKEN_LIMIT } from '../plan/tokens.js';
import type { Plan, PlanWarning } from '../plan/types.js';
import type { AgentTarget } from '../types.js';
import type { Prompter } from './prompter.js';
import {
  agentReportParts,
  formatTokenLine,
  resolveReportTarget,
  type ReportEntry,
} from './report.js';
import type { Theme } from './theme.js';

export type ReviewChoice = 'write' | 'preview' | 'change';

export interface ReviewPlanInput {
  readonly plan: Plan;
  readonly changes: readonly Change[];
  readonly theme: Theme;
}

/**
 * Review card before interactive writes (PRD §3.2 / §3.3 step 6).
 * Cancel rejects with exit 130 via the prompter.
 */
export async function reviewPlan(prompter: Prompter, input: ReviewPlanInput): Promise<ReviewChoice> {
  const entries = reviewEntries(input.changes, input.plan);
  const parts = agentReportParts(entries, input.theme);
  const conflicts = countConflicts(input.changes);
  const over = tokenBudget(input.plan.warnings);
  const tokens = formatTokenLine(input.plan.alwaysOnTokens, over, {
    theme: input.theme,
    limit: ALWAYS_ON_TOKEN_LIMIT,
  });

  const body = [
    parts.rows,
    tokens,
    ...(conflicts > 0
      ? [`${formatCount(conflicts)} existing ${plural(conflicts, 'file', 'files')} need your decision`]
      : []),
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  prompter.note(body, `Ready to write ${formatCount(parts.fileTotal)} ${plural(parts.fileTotal, 'file', 'files')}`);

  return prompter.select<ReviewChoice>({
    message: 'What next?',
    options: [
      { value: 'write', label: 'Write files' },
      { value: 'preview', label: 'Preview changes' },
      { value: 'change', label: 'Change setup' },
    ],
    initialValue: 'write',
  });
}

/** Map planned changes to report rows for the review card. */
export function reviewEntries(changes: readonly Change[], plan: Plan): ReportEntry[] {
  const targetsByPath = new Map<string, AgentTarget | 'shared'>();
  for (const op of plan.ops) targetsByPath.set(op.path, op.target);
  return changes.map((change) => ({
    path: change.path,
    action: reviewAction(change),
    target: change.target ?? resolveReportTarget(change.path, targetsByPath),
  }));
}

export function countConflicts(changes: readonly Change[]): number {
  let count = 0;
  for (const change of changes) {
    if (change.kind === 'conflict-unmanaged' || change.kind === 'conflict-edited') count += 1;
  }
  return count;
}

function reviewAction(change: Change): string {
  switch (change.kind) {
    case 'create':
      return 'created';
    case 'update':
      return 'updated';
    case 'delete-stale':
      return 'deleted';
    case 'conflict-unmanaged':
    case 'conflict-edited':
      return 'pending';
    case 'unchanged':
      return 'unchanged';
    default: {
      const unexpected: never = change.kind;
      return unexpected;
    }
  }
}

function tokenBudget(warnings: readonly PlanWarning[]): { tokens: number; limit: number } | undefined {
  const warning = warnings[0];
  if (warning === undefined) return undefined;
  return { tokens: warning.tokens, limit: warning.limit };
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
