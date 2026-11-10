import { FRAGMENT_ID_PATTERN } from './registry/schema.js';

/**
 * Shared managed-block files from PRD §5.2. Manifest keys for these must use
 * `path#blockId`; the bare path alone is not a valid file key.
 */
const SHARED_BLOCK_FILES = new Set([
  'AGENTS.md',
  'ARCHITECTURE.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
]);

/** Prefix / suffix pairs for rule files (`agentinit-<id>` in the middle). */
const RULE_FORMS = [
  { prefix: '.cursor/rules/agentinit-', suffix: '.mdc' },
  { prefix: '.claude/rules/agentinit-', suffix: '.md' },
  { prefix: '.windsurf/rules/agentinit-', suffix: '.md' },
  { prefix: '.github/instructions/agentinit-', suffix: '.instructions.md' },
] as const;

/**
 * Whole-file workflow and manual outputs (`<id>` in the named slot).
 * `.cursor/commands/` stays owned so 0.1.0 leftovers can be deleted as stale.
 */
const WORKFLOW_FORMS = [
  { prefix: '.cursor/commands/', suffix: '.md' },
  { prefix: '.windsurf/workflows/', suffix: '.md' },
  { prefix: '.github/prompts/', suffix: '.prompt.md' },
] as const;

/** Skill folders: `.claude/skills/<id>/SKILL.md` and `.cursor/skills/<id>/SKILL.md`. */
const SKILL_FORMS = [
  { prefix: '.claude/skills/', suffix: '/SKILL.md' },
  { prefix: '.cursor/skills/', suffix: '/SKILL.md' },
] as const;

/**
 * True when `path` is a whole-file output agentinit writes (rules, workflows,
 * manuals). Shared managed-block files are checked with `isOwnedBlockKey`.
 */
export function isOwnedPath(path: string): boolean {
  for (const form of RULE_FORMS) {
    if (idBetween(path, form.prefix, form.suffix) !== undefined) return true;
  }
  for (const form of WORKFLOW_FORMS) {
    if (idBetween(path, form.prefix, form.suffix) !== undefined) return true;
  }
  for (const form of SKILL_FORMS) {
    if (idBetween(path, form.prefix, form.suffix) !== undefined) return true;
  }
  return false;
}

/**
 * True when `path` is a shared managed-block file and `blockId` matches the
 * registry id pattern. The filesystem path alone is not enough for a manifest key.
 */
export function isOwnedBlockKey(path: string, blockId: string): boolean {
  if (!SHARED_BLOCK_FILES.has(path)) return false;
  return FRAGMENT_ID_PATTERN.test(blockId);
}

function idBetween(path: string, prefix: string, suffix: string): string | undefined {
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return undefined;
  const id = path.slice(prefix.length, path.length - suffix.length);
  if (id.includes('/') || !FRAGMENT_ID_PATTERN.test(id)) return undefined;
  return id;
}
