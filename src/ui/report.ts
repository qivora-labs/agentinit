import { compareText } from '../compare-text.js';
import { AGENT_TARGETS } from '../context.js';
import type { AgentTarget } from '../types.js';
import { alignColumns, visibleWidth } from './align.js';
import { AGENT_FOLDERS, AGENT_LABELS } from './agents.js';
import type { Theme } from './theme.js';

export interface ReportFile {
  readonly path: string;
  readonly action: string;
  readonly diff: string;
}

/** Report entry with a resolved target for the grouped TTY summary. */
export interface ReportEntry {
  readonly path: string;
  readonly action: string;
  readonly target: AgentTarget | 'shared' | 'removed';
}

export interface TokenBudget {
  readonly tokens: number;
  readonly limit: number;
}

export interface TokenLineOptions {
  readonly theme?: Theme;
  /** Always-on budget. Required for the TTY wording when under budget. */
  readonly limit?: number;
}

interface TreeNode {
  name: string;
  action?: string;
  children: Map<string, TreeNode>;
}

type ActionCounts = Map<string, number>;

/** Non-created actions shown in the gray breakdown, in display order. */
const BREAKDOWN_ACTIONS = ['updated', 'adopted', 'backed-up', 'skipped', 'deleted'] as const;

/**
 * Changed paths as a tree. Unchanged entries are omitted. A leaf keeps its action.
 */
export function formatFileTree(files: readonly ReportFile[]): string {
  const root: TreeNode = { name: '', children: new Map() };
  for (const file of files) {
    if (file.action === 'unchanged') continue;
    insertPath(root, file.path, file.action);
  }
  const lines: string[] = [];
  renderNode(root, '', true, lines, true);
  return lines.join('\n');
}

/** Unified diffs for the dry-run preview. Empty diffs are skipped. */
export function formatDiffs(files: readonly ReportFile[]): string {
  return files
    .map((file) => file.diff.trim())
    .filter((diff) => diff.length > 0)
    .join('\n\n');
}

/**
 * Always-on token line. Pipes keep the short form. A TTY spells out context
 * cost and the budget; over-budget text uses the warning color.
 */
export function formatTokenLine(
  tokens: number,
  over?: TokenBudget,
  options: TokenLineOptions = {},
): string {
  const theme = options.theme;
  if (!theme?.tty) {
    if (over === undefined) return `Always-on tokens: ${String(tokens)}`;
    return `Always-on tokens: ${String(tokens)}, over the ${String(over.limit)} token budget.`;
  }

  const limit = over?.limit ?? options.limit;
  if (limit === undefined) {
    throw new Error('formatTokenLine on a TTY needs a token budget limit.');
  }
  const count = formatCount(tokens);
  const budget = formatCount(limit);
  if (over !== undefined) {
    return `Context cost  ~${count} tokens loaded in every chat (${theme.warn(`over the ${budget} token budget`)})`;
  }
  return `Context cost  ~${count} tokens loaded in every chat (budget ${budget})`;
}

/**
 * Grouped TTY report: heading, one row per agent with changes, then Shared
 * and Removed. Pure; callers put the result under the Clack rail.
 */
export function formatAgentReport(
  entries: readonly ReportEntry[],
  theme: Theme,
  options: { readonly dryRun?: boolean } = {},
): string {
  const changed = entries.filter((entry) => entry.action !== 'unchanged');
  const byAgent = new Map<AgentTarget, ReportEntry[]>();
  const shared: ReportEntry[] = [];
  const removed: ReportEntry[] = [];

  for (const entry of changed) {
    if (entry.target === 'shared') {
      shared.push(entry);
      continue;
    }
    if (entry.target === 'removed') {
      removed.push(entry);
      continue;
    }
    const list = byAgent.get(entry.target);
    if (list === undefined) byAgent.set(entry.target, [entry]);
    else list.push(entry);
  }

  const agentRows: string[][] = [];
  for (const agent of AGENT_TARGETS) {
    const files = byAgent.get(agent);
    if (files === undefined || files.length === 0) continue;
    agentRows.push([
      AGENT_LABELS[agent],
      fileCountLabel(files.length, countActions(files), theme),
      AGENT_FOLDERS[agent],
    ]);
  }

  // Shared names must not widen the agent "N files" column, so agents align
  // alone and Shared/Removed only match the label column width.
  const labels = [
    ...agentRows.map((row) => row[0] ?? ''),
    ...(shared.length > 0 ? ['Shared'] : []),
    ...(removed.length > 0 ? ['Removed'] : []),
  ];
  const labelWidth = Math.max(0, ...labels.map((label) => visibleWidth(label)));
  const gap = 2;

  const lines: string[] = [];
  const fileTotal = changed.length;
  const agentTotal = agentRows.length;
  const verb = options.dryRun === true ? 'Would write' : 'Wrote';
  lines.push(
    `${verb} ${formatCount(fileTotal)} ${plural(fileTotal, 'file', 'files')} for ${formatCount(agentTotal)} ${plural(agentTotal, 'agent', 'agents')}`,
  );

  if (agentRows.length > 0) {
    const body = alignColumns(
      agentRows.map((row) => [row[1] ?? '', row[2] ?? '']),
      gap,
    );
    for (let index = 0; index < agentRows.length; index += 1) {
      const label = agentRows[index]?.[0] ?? '';
      const rest = body[index] ?? '';
      lines.push(`${padEndVisible(label, labelWidth)}${' '.repeat(gap)}${rest}`);
    }
  }

  if (shared.length > 0) {
    const names = [...shared]
      .map((entry) => basename(entry.path))
      .sort(compareText)
      .join('  ');
    lines.push(`${padEndVisible('Shared', labelWidth)}${' '.repeat(gap)}${names}`);
  }

  if (removed.length > 0) {
    const detail = fileCountLabel(removed.length, countActions(removed), theme);
    lines.push(`${padEndVisible('Removed', labelWidth)}${' '.repeat(gap)}${detail}`);
  }

  return lines.join('\n');
}

function padEndVisible(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - visibleWidth(text)))}`;
}

/**
 * Resolve a report path's target from the plan. Deleted paths are not in the
 * plan, so fall back to the agent folder prefix, then `removed`.
 */
export function resolveReportTarget(
  path: string,
  targetsByPath: ReadonlyMap<string, AgentTarget | 'shared'>,
): AgentTarget | 'shared' | 'removed' {
  const fromPlan = targetsByPath.get(path);
  if (fromPlan !== undefined) return fromPlan;
  for (const agent of AGENT_TARGETS) {
    if (path === AGENT_FOLDERS[agent].slice(0, -1) || path.startsWith(AGENT_FOLDERS[agent])) {
      return agent;
    }
  }
  return 'removed';
}

function countActions(entries: readonly ReportEntry[]): ActionCounts {
  const counts: ActionCounts = new Map();
  for (const entry of entries) {
    counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
  }
  return counts;
}

function fileCountLabel(total: number, counts: ActionCounts, theme: Theme): string {
  const base = `${formatCount(total)} ${plural(total, 'file', 'files')}`;
  const parts: string[] = [];
  for (const action of BREAKDOWN_ACTIONS) {
    const count = counts.get(action);
    if (count === undefined || count === 0) continue;
    const text = `${formatCount(count)} ${action}`;
    const painted = action === 'skipped' || action === 'backed-up' ? theme.warn(text) : theme.muted(text);
    parts.push(painted);
  }
  if (parts.length === 0) return base;
  return `${base} ${theme.muted('·')} ${parts.join(theme.muted(', '))}`;
}

function basename(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? filePath : filePath.slice(slash + 1);
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function insertPath(root: TreeNode, filePath: string, action: string): void {
  const parts = filePath.split('/').filter((part) => part.length > 0);
  let node = root;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined) continue;
    let child = node.children.get(part);
    if (child === undefined) {
      child = { name: part, children: new Map() };
      node.children.set(part, child);
    }
    node = child;
    if (index === parts.length - 1) node.action = mergeAction(node.action, action);
  }
}

function mergeAction(current: string | undefined, action: string): string {
  if (current === undefined || current.length === 0) return action;
  if (current.split(', ').includes(action)) return current;
  return `${current}, ${action}`;
}

function renderNode(node: TreeNode, prefix: string, isLast: boolean, lines: string[], isRoot: boolean): void {
  if (!isRoot) {
    const branch = isLast ? '└── ' : '├── ';
    const label = node.action === undefined ? node.name : `${node.name} (${node.action})`;
    lines.push(`${prefix}${branch}${label}`);
  }
  const children = [...node.children.values()].sort((left, right) => compareText(left.name, right.name));
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined) continue;
    renderNode(child, nextPrefix, index === children.length - 1, lines, false);
  }
}
