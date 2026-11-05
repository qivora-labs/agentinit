import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { ZodError } from 'zod';
import * as z from 'zod';
import { compareText } from '../compare-text.js';
import { AgentInitError } from '../errors.js';
import { isOwnedBlockKey, isOwnedPath } from '../owned-paths.js';
import type { AgentTarget, Language } from '../types.js';

/** Project-relative path of the committed manifest (PRD §6.2). */
export const MANIFEST_PATH = '.agentinit/manifest.json';

const RECOVER_HINT =
  'Fix .agentinit/manifest.json, or delete it and run `agentinit init` again.';

const LANGUAGES = ['typescript-strict', 'typescript'] as const satisfies readonly Language[];
const AGENT_TARGETS = ['cursor', 'claude', 'windsurf', 'copilot'] as const satisfies readonly AgentTarget[];
const MODES = ['existing', 'greenfield'] as const;

/** Same kebab-case rule as registry fragment ids (PRD §4.4 / §6.2). */
const FRAGMENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const nonEmpty = z.string().min(1, { error: 'must not be empty' });

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, {
  error: 'must be a lowercase sha256 hex digest',
});

const fragmentIdSchema = z.string().regex(FRAGMENT_ID, { error: 'must be kebab-case' });

const excludedSchema = z
  .array(fragmentIdSchema)
  .superRefine((ids, ctx) => {
    const seen = new Set<string>();
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (id === undefined) continue;
      if (seen.has(id)) {
        ctx.addIssue({ code: 'custom', message: 'must be unique', path: [index] });
        continue;
      }
      seen.add(id);
    }
  })
  .optional()
  .default([]);

const fileKeySchema = z.string().superRefine((key, ctx) => {
  const problem = fileKeyProblem(key);
  if (problem !== undefined) {
    ctx.addIssue({ code: 'custom', message: problem });
  }
});

const selectionsSchema = z
  .object({
    language: z.enum(LANGUAGES),
    frameworks: z.array(nonEmpty),
    libraries: z.array(nonEmpty),
    architecture: nonEmpty,
    agents: z.array(z.enum(AGENT_TARGETS)),
    /** Opted-out detected fragment ids. Optional on read; always written. */
    excluded: excludedSchema,
  })
  .strict();

export const manifestSchema = z
  .object({
    cliVersion: nonEmpty,
    mode: z.enum(MODES),
    selections: selectionsSchema,
    fragments: z.record(nonEmpty, nonEmpty),
    files: z.record(fileKeySchema, z.object({ sha256: sha256Schema }).strict()),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;

/** `null` when the manifest file is absent. Invalid JSON or schema throws. */
export async function readManifest(root: string): Promise<Manifest | null> {
  const absolute = path.join(root, MANIFEST_PATH);
  let raw: string;
  try {
    raw = await readFile(absolute, 'utf8');
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return null;
    throw new AgentInitError(readFailureMessage(nodeErrorCode(error)), {
      hint: 'Check that the manifest is a readable file.',
    });
  }
  return parseManifest(raw);
}

/**
 * Stable key order, 2-space indent, and one trailing newline.
 * `fragments` and `files` keys are sorted by UTF-16 code unit.
 * Array order is kept as given.
 */
export function serializeManifest(manifest: Manifest): string {
  const ordered = {
    cliVersion: manifest.cliVersion,
    mode: manifest.mode,
    selections: {
      language: manifest.selections.language,
      frameworks: [...manifest.selections.frameworks],
      libraries: [...manifest.selections.libraries],
      architecture: manifest.selections.architecture,
      agents: [...manifest.selections.agents],
      excluded: [...manifest.selections.excluded].sort(compareText),
    },
    fragments: sortedRecord(manifest.fragments),
    files: sortedFiles(manifest.files),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function parseManifest(raw: string): Manifest {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new AgentInitError(`${MANIFEST_PATH}: invalid JSON.`, { hint: RECOVER_HINT });
  }
  const result = manifestSchema.safeParse(data);
  if (!result.success) {
    throw new AgentInitError(formatIssues(result.error), { hint: RECOVER_HINT });
  }
  return result.data;
}

function sortedRecord(record: Readonly<Record<string, string>>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value === undefined) continue;
    sorted[key] = value;
  }
  return sorted;
}

function sortedFiles(
  files: Readonly<Record<string, { sha256: string }>>,
): Record<string, { sha256: string }> {
  const sorted: Record<string, { sha256: string }> = {};
  for (const key of Object.keys(files).sort()) {
    const entry = files[key];
    if (entry === undefined) continue;
    sorted[key] = { sha256: entry.sha256 };
  }
  return sorted;
}

/**
 * A manifest file key is a relative POSIX path, or that path plus `#` and a block id
 * (`AGENTS.md#core`). One `#` splits the key; the path itself cannot contain `#`.
 * Keys must name a file agentinit writes (PRD §5.2).
 */
function fileKeyProblem(key: string): string | undefined {
  if (key.length === 0) return 'must not be empty';
  if (key.includes('\\')) return 'backslashes are not allowed';
  if (key.startsWith('/') || key.includes('\n') || key.includes('\r')) return 'must be a relative path';
  const hash = key.indexOf('#');
  if (hash === -1) {
    if (hasBadPathSegment(key) || !isOwnedPath(key)) {
      return `"${key}" is not a file agentinit writes`;
    }
    return undefined;
  }
  if (key.slice(hash + 1).includes('#')) return 'must contain at most one #';
  const filePath = key.slice(0, hash);
  const blockId = key.slice(hash + 1);
  if (filePath.length === 0) return 'path before # must not be empty';
  // Same charset as managed-block ids: no whitespace, `#`, `\`, or `>`.
  if (blockId.length === 0 || /[\s>#\\]/.test(blockId)) return 'block id after # is not valid';
  if (hasBadPathSegment(filePath) || !isOwnedBlockKey(filePath, blockId)) {
    return `"${key}" is not a file agentinit writes`;
  }
  return undefined;
}

function hasBadPathSegment(filePath: string): boolean {
  for (const segment of filePath.split('/')) {
    if (segment.length === 0 || segment === '.' || segment === '..') return true;
  }
  return false;
}

function formatIssues(error: ZodError): string {
  const lines: string[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        lines.push(formatIssueLine([...issue.path, key], 'unknown key'));
      }
      continue;
    }
    // Record key failures are wrapped. The nested issue has the specific reason.
    if (issue.code === 'invalid_key') {
      for (const inner of issue.issues) {
        lines.push(formatIssueLine([...issue.path, ...inner.path], inner.message));
      }
      continue;
    }
    lines.push(formatIssueLine(issue.path, issue.message));
  }
  return lines.length > 0 ? lines.join('\n') : `${MANIFEST_PATH}: invalid manifest`;
}

function formatIssueLine(issuePath: readonly PropertyKey[], message: string): string {
  const formatted = formatPath(issuePath);
  const detail = formatted.length > 0 ? `${formatted}: ${message}` : message;
  return `${MANIFEST_PATH}: ${detail}`;
}

function formatPath(issuePath: readonly PropertyKey[]): string {
  let formatted = '';
  for (const segment of issuePath) {
    if (typeof segment === 'number') {
      formatted += `[${String(segment)}]`;
      continue;
    }
    if (typeof segment !== 'string') continue;
    formatted = formatted.length === 0 ? segment : `${formatted}.${segment}`;
  }
  return formatted;
}

function readFailureMessage(code: string | undefined): string {
  if (code === 'EACCES' || code === 'EPERM') return `Cannot read ${MANIFEST_PATH}: permission denied.`;
  if (code === 'EISDIR') return `${MANIFEST_PATH} is a directory.`;
  return `Cannot read ${MANIFEST_PATH}.`;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
