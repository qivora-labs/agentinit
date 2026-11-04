import type { Theme } from './theme.js';

/**
 * Colors only the action token. `formatFileTree` stays plain for `--json` and pipes.
 * `adopted` shares the update color; `skipped` shares the warning color.
 */
export function paintFileTree(tree: string, theme: Theme): string {
  if (!theme.tty || tree.length === 0) return tree;
  return tree.split('\n').map((line) => paintTreeLine(line, theme)).join('\n');
}

/** Category titles are the first line of each block from `formatGrouped`. */
export function paintGroupedList(text: string, theme: Theme): string {
  if (!theme.tty || text.length === 0) return text;
  return text.split('\n\n').map((block) => paintListBlock(block, theme)).join('\n\n');
}

/** Group titles are the unindented lines of a doctor report. Issue lines stay plain. */
export function paintDoctorReport(text: string, theme: Theme): string {
  if (!theme.tty || text.length === 0) return text;
  return text.split('\n').map((line) => paintDoctorLine(line, theme)).join('\n');
}

function paintTreeLine(line: string, theme: Theme): string {
  const split = splitAction(line);
  const body = dimBranches(split.body, theme);
  if (split.action === undefined) return body;
  const painted = split.action.split(', ').map((part) => paintAction(part, theme)).join(', ');
  return `${body} (${painted})`;
}

function splitAction(line: string): { body: string; action: string | undefined } {
  const match = /^(.*) \(([^()\n]+)\)$/.exec(line);
  const body = match?.[1];
  const action = match?.[2];
  if (body === undefined || action === undefined) return { body: line, action: undefined };
  return { body, action };
}

function dimBranches(body: string, theme: Theme): string {
  const match = /^([│├└─ ]+)(.*)$/.exec(body);
  const prefix = match?.[1];
  const name = match?.[2];
  if (prefix === undefined || prefix.length === 0 || name === undefined) return body;
  return `${theme.dim(prefix)}${name}`;
}

/** Action token colors shared by the file tree and dry-run diff headers. */
export function paintAction(action: string, theme: Theme): string {
  switch (action) {
    case 'created':
      return theme.success(action);
    case 'updated':
    case 'adopted':
      return theme.accent(action);
    case 'backed-up':
    case 'skipped':
      return theme.warn(action);
    case 'deleted':
      return theme.error(action);
    default:
      return action;
  }
}

function paintListBlock(block: string, theme: Theme): string {
  const newline = block.indexOf('\n');
  if (newline === -1) return theme.boldAccent(block);
  return `${theme.boldAccent(block.slice(0, newline))}${block.slice(newline)}`;
}

function paintDoctorLine(line: string, theme: Theme): string {
  if (line.length === 0 || line.startsWith(' ')) return line;
  return theme.boldAccent(line);
}

/** Structured TTY checklist: icon + label, then indented issue lines. */
export function paintDoctorChecks(
  checks: readonly {
    readonly label: string;
    readonly ok: boolean;
    readonly issues: readonly { readonly message: string; readonly fix: string }[];
  }[],
  theme: Theme,
): string {
  const blocks: string[] = [];
  for (const check of checks) {
    const icon = check.ok
      ? theme.success(theme.glyphs.success)
      : theme.error(theme.glyphs.error);
    const lines = [`${icon}  ${check.label}`];
    if (!check.ok) {
      for (const issue of check.issues) {
        lines.push(`  ${issue.message}`);
        lines.push(`    Fix: ${issue.fix}`);
      }
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n');
}
