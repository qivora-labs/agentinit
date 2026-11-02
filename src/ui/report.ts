import { compareText } from '../compare-text.js';

export interface ReportFile {
  readonly path: string;
  readonly action: string;
  readonly diff: string;
}

export interface TokenBudget {
  readonly tokens: number;
  readonly limit: number;
}

interface TreeNode {
  name: string;
  action?: string;
  children: Map<string, TreeNode>;
}

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

export function formatTokenLine(tokens: number, over?: TokenBudget): string {
  if (over === undefined) return `Always-on tokens: ${String(tokens)}`;
  return `Always-on tokens: ${String(tokens)}, over the ${String(over.limit)} token budget.`;
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
