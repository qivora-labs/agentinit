import type { RenderedFragment, RenderedWorkflow, TargetAdapter } from '../plan/types.js';
import type { FileOp } from '../types.js';

const SCOPED_RULES_NOTE = 'Scoped rules live in `.claude/rules/`.';

/**
 * Claude Code reads `CLAUDE.md`, not `AGENTS.md` (PRD §5.1, §5.3). The managed
 * block only imports `AGENTS.md` and points at path-scoped rules. `always`
 * text stays in `AGENTS.md`. A rule file with no `paths` loads at launch, so
 * a glob or auto fragment whose rendered glob list is empty is omitted.
 * `paths` is a YAML list of double-quoted patterns: a leading `*` is an alias.
 * Skills set `disable-model-invocation` so they run only when the user invokes
 * them. Markers are added by the IO layer.
 */
export const claudeAdapter: TargetAdapter = (ctx) => {
  const ops: FileOp[] = [claudeMdOp()];
  for (const fragment of ctx.fragments.glob) {
    const op = pathRuleOp(fragment);
    if (op !== undefined) ops.push(op);
  }
  for (const fragment of ctx.fragments.auto) {
    const op = pathRuleOp(fragment);
    if (op !== undefined) ops.push(op);
  }
  for (const fragment of ctx.fragments.manual) ops.push(manualSkillOp(fragment));
  for (const workflow of ctx.workflows) ops.push(workflowSkillOp(workflow));
  return ops;
};

function claudeMdOp(): FileOp {
  return {
    path: 'CLAUDE.md',
    kind: 'managed-block',
    blockId: 'claude',
    content: document(`@AGENTS.md\n\n${SCOPED_RULES_NOTE}`),
    target: 'claude',
  };
}

/** `glob` and `auto` share this shape. Claude has no description-based activation. */
function pathRuleOp(fragment: RenderedFragment): FileOp | undefined {
  const paths = fragment.globs.filter((glob) => glob.length > 0);
  if (paths.length === 0) return undefined;
  const lines = ['paths:', ...paths.map((glob) => `  - ${quoted(glob)}`)];
  return fileOp(`.claude/rules/agentinit-${fragment.id}.md`, document(frontmatter(lines), fragment.body));
}

function manualSkillOp(fragment: RenderedFragment): FileOp {
  const lines = [
    `name: ${yamlScalar(fragment.id)}`,
    `description: ${yamlScalar(fragment.description)}`,
    'disable-model-invocation: true',
  ];
  return fileOp(
    `.claude/skills/agentinit-${fragment.id}/SKILL.md`,
    document(frontmatter(lines), fragment.body),
  );
}

function workflowSkillOp(workflow: RenderedWorkflow): FileOp {
  const lines = [`name: ${yamlScalar(workflow.id)}`, `description: ${yamlScalar(workflow.description)}`];
  if (workflow.argumentHint !== undefined) {
    lines.push(`argument-hint: ${yamlScalar(workflow.argumentHint)}`);
  }
  lines.push('disable-model-invocation: true');
  return fileOp(`.claude/skills/${workflow.id}/SKILL.md`, document(frontmatter(lines), workflow.body));
}

function fileOp(path: string, content: string): FileOp {
  return { path, kind: 'file', content, target: 'claude' };
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

/** Every `paths` entry is quoted. PRD §5.4 and a leading `*` both require it. */
function quoted(value: string): string {
  return `"${escapeDoubleQuoted(value)}"`;
}

/**
 * Plain when YAML would keep the text. `:` and `#` are always quoted: a colon
 * opens a mapping and a hash starts a comment. A leading `*` is an alias and
 * a leading `[` is a flow sequence. Quotes, backslashes, and keywords are
 * quoted so a later `yaml.parse` returns the same string.
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
