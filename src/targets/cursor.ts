import type { RenderedFragment, RenderedWorkflow, TargetAdapter } from '../plan/types.js';
import type { FileOp } from '../types.js';

type CursorRuleScope = 'glob' | 'auto' | 'manual';

/**
 * Cursor reads `AGENTS.md` itself, so `always` fragments produce no files
 * (PRD §5.1, §5.3). `globs` stays an unquoted comma-separated scalar: a YAML
 * list, or quotes from a general serializer, would not match `.mdc` files.
 * A description that contains `:` or `#` is double-quoted so the frontmatter
 * stays valid YAML.
 */
export const cursorAdapter: TargetAdapter = (ctx) => {
  const ops: FileOp[] = [];
  for (const fragment of ctx.fragments.glob) ops.push(ruleOp(fragment, 'glob'));
  for (const fragment of ctx.fragments.auto) ops.push(ruleOp(fragment, 'auto'));
  for (const fragment of ctx.fragments.manual) ops.push(ruleOp(fragment, 'manual'));
  for (const workflow of ctx.workflows) ops.push(workflowOp(workflow));
  return ops;
};

function ruleOp(fragment: RenderedFragment, scope: CursorRuleScope): FileOp {
  const lines: string[] = [];
  if (scope !== 'manual') lines.push(`description: ${yamlScalar(fragment.description)}`);
  // An empty list is omitted: `globs:` with no value is not a pattern.
  if (scope === 'glob' && fragment.globs.length > 0) lines.push(`globs: ${fragment.globs.join(',')}`);
  lines.push('alwaysApply: false');
  return fileOp(`.cursor/rules/agentinit-${fragment.id}.mdc`, document(frontmatter(lines), fragment.body));
}

function workflowOp(workflow: RenderedWorkflow): FileOp {
  return fileOp(`.cursor/commands/${workflow.id}.md`, document(workflow.body));
}

function fileOp(path: string, content: string): FileOp {
  return { path, kind: 'file', content, target: 'cursor' };
}

function frontmatter(lines: readonly string[]): string {
  return ['---', ...lines, '---'].join('\n');
}

/** One trailing newline, LF, with a blank line between frontmatter and body. */
function document(...parts: readonly string[]): string {
  const body = parts
    .map((part) => part.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').trim())
    .filter((part) => part.length > 0)
    .join('\n\n');
  return `${body}\n`;
}

/**
 * Plain when YAML would keep the text. `:` and `#` are always quoted: a colon
 * opens a mapping and a hash starts a comment. Quotes, backslashes, and
 * keywords are quoted so a later `yaml.parse` returns the same string.
 */
function yamlScalar(value: string): string {
  if (isPlainScalar(value)) return value;
  return `"${escapeDoubleQuoted(value)}"`;
}

function isPlainScalar(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return false;
  if (/[:#\n\r\t"\\]/u.test(value)) return false;
  if (/^[&*!%@`|>{}[\],?'"-]/u.test(value)) return false;
  if (/^(?:true|false|null|yes|no|on|off|~|n|y)$/iu.test(value)) return false;
  if (/^[-+]?(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?$/u.test(value)) return false;
  return true;
}

function escapeDoubleQuoted(value: string): string {
  let escaped = '';
  for (const char of value) {
    switch (char) {
      case '\\':
        escaped += '\\\\';
        break;
      case '"':
        escaped += '\\"';
        break;
      case '\n':
        escaped += '\\n';
        break;
      case '\r':
        escaped += '\\r';
        break;
      case '\t':
        escaped += '\\t';
        break;
      default:
        escaped += char;
        break;
    }
  }
  return escaped;
}
