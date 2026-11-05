import { AgentInitError } from '../errors.js';
import { agentRuleBody } from '../plan/render.js';
import type { RenderedFragment, RenderedWorkflow, TargetAdapter } from '../plan/types.js';
import type { FileOp } from '../types.js';

/** PRD §4.4. A file of this length is already over the budget. */
const RULE_CHAR_LIMIT = 12_000;

/**
 * Windsurf reads root `AGENTS.md` as always-on, so `always` fragments produce
 * no files (PRD §5.1, §5.3). Scoped rules use `trigger` frontmatter.
 * `globs` is one comma-separated scalar, never a YAML list. A value YAML
 * would misread (a leading asterisk is an alias) is one double-quoted
 * string. A path-prefixed list such as the PRD §5.4 example stays unquoted.
 * A description that contains `:` or `#` is double-quoted so the frontmatter
 * stays valid YAML. A generated rule file of 12,000 characters or more is a
 * plan error. Workflows carry `description` only; the filename is the slash
 * command.
 */
export const windsurfAdapter: TargetAdapter = (ctx) => {
  const ops: FileOp[] = [];
  for (const fragment of ctx.fragments.glob) {
    const op = globRule(fragment);
    if (op !== undefined) ops.push(op);
  }
  for (const fragment of ctx.fragments.auto) ops.push(autoRule(fragment));
  for (const fragment of ctx.fragments.manual) ops.push(manualRule(fragment));
  for (const workflow of ctx.workflows) ops.push(workflowOp(workflow));
  return ops;
};

/** A glob trigger with no patterns never matches, so the file is omitted. */
function globRule(fragment: RenderedFragment): FileOp | undefined {
  const globs = fragment.globs.filter((glob) => glob.length > 0);
  if (globs.length === 0) return undefined;
  return ruleFile(fragment, ['trigger: glob', `globs: ${yamlScalar(globs.join(','))}`]);
}

function autoRule(fragment: RenderedFragment): FileOp {
  return ruleFile(fragment, ['trigger: model_decision', `description: ${yamlScalar(fragment.description)}`]);
}

function manualRule(fragment: RenderedFragment): FileOp {
  return ruleFile(fragment, ['trigger: manual']);
}

function workflowOp(workflow: RenderedWorkflow): FileOp {
  const content = document(frontmatter([`description: ${yamlScalar(workflow.description)}`]), workflow.body);
  return fileOp(`.windsurf/workflows/${workflow.id}.md`, content);
}

function ruleFile(fragment: RenderedFragment, lines: readonly string[]): FileOp {
  const content = document(frontmatter(lines), agentRuleBody(fragment));
  if (content.length >= RULE_CHAR_LIMIT) {
    throw new AgentInitError(
      `Windsurf rule for fragment "${fragment.id}" is ${String(content.length)} characters. ` +
        `Windsurf rule files must stay below ${String(RULE_CHAR_LIMIT)} characters.`,
    );
  }
  return fileOp(`.windsurf/rules/agentinit-${fragment.id}.md`, content);
}

function fileOp(path: string, content: string): FileOp {
  return { path, kind: 'file', content, target: 'windsurf' };
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
 * opens a mapping and a hash starts a comment. A leading `*` is an alias and
 * a leading `[` is a flow sequence. Quotes, backslashes, keywords, and
 * numbers are quoted so a later `yaml.parse` returns the same string
 * (`1e2` would become 100).
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
