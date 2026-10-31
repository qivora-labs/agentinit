import type { RenderedFragment, RenderedWorkflow, TargetAdapter } from '../plan/types.js';
import type { FileOp } from '../types.js';

const POINTER = 'Follow `AGENTS.md` at the repository root.\n\nScoped rules are in `.github/instructions/`.';

/**
 * Copilot reads `AGENTS.md` on many surfaces and only the pointer on others
 * (PRD §5.1, §5.3, §13). The managed block names `AGENTS.md` and
 * `.github/instructions/`; `always` text stays in `AGENTS.md`. `glob` and
 * `auto` share one instruction file: `applyTo` is the glob fallback, and
 * `description` is the VS Code on-demand field. `applyTo` is always one
 * double-quoted comma-separated string. A glob or auto fragment whose
 * rendered glob list is empty is omitted. Manual rules and workflows are
 * prompt files. Prompt frontmatter uses `description` and, for workflows,
 * `argument-hint`. `agent` stays unset so the current agent runs the prompt.
 * Markers are added by the IO layer.
 */
export const copilotAdapter: TargetAdapter = (ctx) => {
  const ops: FileOp[] = [copilotInstructionsOp()];
  for (const fragment of ctx.fragments.glob) {
    const op = instructionOp(fragment);
    if (op !== undefined) ops.push(op);
  }
  for (const fragment of ctx.fragments.auto) {
    const op = instructionOp(fragment);
    if (op !== undefined) ops.push(op);
  }
  for (const fragment of ctx.fragments.manual) ops.push(manualPromptOp(fragment));
  for (const workflow of ctx.workflows) ops.push(workflowPromptOp(workflow));
  return ops;
};

function copilotInstructionsOp(): FileOp {
  return {
    path: '.github/copilot-instructions.md',
    kind: 'managed-block',
    blockId: 'copilot',
    content: document(POINTER),
    target: 'copilot',
  };
}

/** `glob` and `auto` share this shape. Copilot code review ignores a file with no `applyTo`. */
function instructionOp(fragment: RenderedFragment): FileOp | undefined {
  const globs = fragment.globs.filter((glob) => glob.length > 0);
  if (globs.length === 0) return undefined;
  const lines = [`description: ${yamlScalar(fragment.description)}`, `applyTo: ${quoted(globs.join(','))}`];
  return fileOp(
    `.github/instructions/agentinit-${fragment.id}.instructions.md`,
    document(frontmatter(lines), fragment.body),
  );
}

function manualPromptOp(fragment: RenderedFragment): FileOp {
  return fileOp(
    `.github/prompts/agentinit-${fragment.id}.prompt.md`,
    document(frontmatter([`description: ${yamlScalar(fragment.description)}`]), fragment.body),
  );
}

function workflowPromptOp(workflow: RenderedWorkflow): FileOp {
  const lines = [`description: ${yamlScalar(workflow.description)}`];
  if (workflow.argumentHint !== undefined) {
    lines.push(`argument-hint: ${yamlScalar(workflow.argumentHint)}`);
  }
  return fileOp(`.github/prompts/${workflow.id}.prompt.md`, document(frontmatter(lines), workflow.body));
}

function fileOp(path: string, content: string): FileOp {
  return { path, kind: 'file', content, target: 'copilot' };
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

/** `applyTo` is one quoted string in the GitHub docs and PRD §5.4. A leading `*` is an alias. */
function quoted(value: string): string {
  return `"${escapeDoubleQuoted(value)}"`;
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
  return quoted(value);
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
