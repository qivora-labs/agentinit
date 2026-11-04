import type { AgentTarget } from '../types.js';
import type { Prompter } from './prompter.js';
import {
  agentReportParts,
  formatTokenLine,
  resolveReportTarget,
  type ReportEntry,
  type TokenBudget,
} from './report.js';
import type { Theme } from './theme.js';

export type ReviewChoice = 'write' | 'preview' | 'change';

/** Change kinds the review card needs; structurally matches `io/changes`. */
export type ReviewChangeKind =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'conflict-unmanaged'
  | 'conflict-edited'
  | 'delete-stale';

export interface ReviewChange {
  readonly kind: ReviewChangeKind;
  readonly path: string;
  readonly target?: AgentTarget | 'shared';
}

/** Plan fields the review card needs; structurally matches `plan/types`.Plan. */
export interface ReviewPlanView {
  readonly ops: readonly { readonly path: string; readonly target: AgentTarget | 'shared' }[];
  readonly alwaysOnTokens: number;
  readonly warnings: readonly TokenBudget[];
}

export interface ReviewPlanInput {
  readonly plan: ReviewPlanView;
  readonly changes: readonly ReviewChange[];
  readonly theme: Theme;
  /** Always-on token budget (from the command layer; ui never imports plan/). */
  readonly tokenLimit: number;
  /** Terminal columns; narrow terminals drop the folder column. */
  readonly columns?: number;
}

/**
 * Review card before interactive writes (PRD §3.2 / §3.3 step 6).
 * Cancel rejects with exit 130 via the prompter.
 */
export async function reviewPlan(prompter: Prompter, input: ReviewPlanInput): Promise<ReviewChoice> {
  const entries = reviewEntries(input.changes, input.plan);
  const parts = agentReportParts(
    entries,
    input.theme,
    input.columns === undefined ? {} : { columns: input.columns },
  );
  const conflicts = countConflicts(input.changes);
  const over = tokenBudget(input.plan.warnings);
  const tokens = formatTokenLine(input.plan.alwaysOnTokens, over, {
    theme: input.theme,
    limit: input.tokenLimit,
  });

  const body = [
    parts.rows,
    tokens,
    ...(conflicts > 0
      ? [
          `${formatCount(conflicts)} existing ${plural(conflicts, 'file', 'files')} ${plural(conflicts, 'needs', 'need')} your decision`,
        ]
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
export function reviewEntries(changes: readonly ReviewChange[], plan: ReviewPlanView): ReportEntry[] {
  const targetsByPath = new Map<string, AgentTarget | 'shared'>();
  for (const op of plan.ops) targetsByPath.set(op.path, op.target);
  return changes.map((change) => ({
    path: change.path,
    action: reviewAction(change),
    target: change.target ?? resolveReportTarget(change.path, targetsByPath),
  }));
}

export function countConflicts(changes: readonly ReviewChange[]): number {
  let count = 0;
  for (const change of changes) {
    if (change.kind === 'conflict-unmanaged' || change.kind === 'conflict-edited') count += 1;
  }
  return count;
}

function reviewAction(change: ReviewChange): string {
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

function tokenBudget(warnings: readonly TokenBudget[]): TokenBudget | undefined {
  return warnings[0];
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
