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

/**
 * Unknown keys are kept (passthrough) so a newer CLI's manifest still parses.
 * Known fields keep their validation; extras are stripped into `extras` bags.
 */
const selectionsSchema = z
  .object({
    language: z.enum(LANGUAGES),
    frameworks: z.array(nonEmpty),
    libraries: z.array(nonEmpty),
    architecture: nonEmpty,
    agents: z.array(z.enum(AGENT_TARGETS)),
    /** Opted-out detected fragment ids. Optional on read; always written. */
    excluded: excludedSchema,
    /** Include slash-command workflows. Optional on read; defaults to true; always written. */
    workflows: z.boolean().optional().default(true),
  })
  .loose();

const fileEntrySchema = z.object({ sha256: sha256Schema }).loose();

export const manifestSchema = z
  .object({
    cliVersion: nonEmpty,
    mode: z.enum(MODES),
    selections: selectionsSchema,
    fragments: z.record(nonEmpty, nonEmpty),
    files: z.record(fileKeySchema, fileEntrySchema),
  })
  .loose();

const KNOWN_TOP_KEYS = new Set(['cliVersion', 'mode', 'selections', 'fragments', 'files']);
const KNOWN_SELECTION_KEYS = new Set([
  'language',
  'frameworks',
  'libraries',
  'architecture',
  'agents',
  'excluded',
  'workflows',
]);
const KNOWN_FILE_KEYS = new Set(['sha256']);

/** Unknown JSON keys from a newer CLI; written after known keys on serialize. */
export type ManifestExtras = Readonly<Record<string, unknown>>;

export interface ManifestFileEntry {
  readonly sha256: string;
  readonly extras?: ManifestExtras;
}

export interface ManifestSelections {
  readonly language: Language;
  readonly frameworks: readonly string[];
  readonly libraries: readonly string[];
  readonly architecture: string;
  readonly agents: readonly AgentTarget[];
  readonly excluded: readonly string[];
  readonly workflows: boolean;
  readonly extras?: ManifestExtras;
}

export interface Manifest {
  readonly cliVersion: string;
  readonly mode: (typeof MODES)[number];
  readonly selections: ManifestSelections;
  readonly fragments: Readonly<Record<string, string>>;
  readonly files: Readonly<Record<string, ManifestFileEntry>>;
  readonly extras?: ManifestExtras;
}

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
 * Known keys first; unknown extras follow in their original relative order.
 * `fragments` and `files` keys are sorted by UTF-16 code unit.
 * Array order is kept as given.
 */
export function serializeManifest(manifest: Manifest): string {
  const selections: Record<string, unknown> = {
    language: manifest.selections.language,
    frameworks: [...manifest.selections.frameworks],
    libraries: [...manifest.selections.libraries],
    architecture: manifest.selections.architecture,
    agents: [...manifest.selections.agents],
    excluded: [...manifest.selections.excluded].sort(compareText),
    workflows: manifest.selections.workflows,
  };
  appendExtras(selections, manifest.selections.extras);

  const files: Record<string, unknown> = {};
  for (const key of Object.keys(manifest.files).sort(compareText)) {
    const entry = manifest.files[key];
    if (entry === undefined) continue;
    const out: Record<string, unknown> = { sha256: entry.sha256 };
    appendExtras(out, entry.extras);
    files[key] = out;
  }

  const ordered: Record<string, unknown> = {
    cliVersion: manifest.cliVersion,
    mode: manifest.mode,
    selections,
    fragments: sortedRecord(manifest.fragments),
    files,
  };
  appendExtras(ordered, manifest.extras);
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Copy unknown top-level and `selections` keys from a previous manifest onto a
 * freshly built body so an older CLI rewrite does not drop newer data.
 */
export function withPreservedExtras(
  next: Omit<Manifest, 'files'>,
  previous: Manifest | null | undefined,
): Omit<Manifest, 'files'> {
  if (previous === null || previous === undefined) return next;
  return {
    ...next,
    ...(previous.extras === undefined ? {} : { extras: previous.extras }),
    selections: {
      ...next.selections,
      ...(previous.selections.extras === undefined ? {} : { extras: previous.selections.extras }),
    },
  };
}

/**
 * Keep unknown keys on file entries that still exist after apply updates hashes.
 */
export function withPreservedFileExtras(
  files: Readonly<Record<string, { readonly sha256: string }>>,
  previous: Manifest['files'] | undefined,
): Manifest['files'] {
  if (previous === undefined) {
    const next: Record<string, ManifestFileEntry> = {};
    for (const [key, entry] of Object.entries(files)) {
      next[key] = { sha256: entry.sha256 };
    }
    return next;
  }
  const next: Record<string, ManifestFileEntry> = {};
  for (const [key, entry] of Object.entries(files)) {
    const prior = previous[key];
    next[key] =
      prior?.extras === undefined
        ? { sha256: entry.sha256 }
        : { sha256: entry.sha256, extras: prior.extras };
  }
  return next;
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
  return toManifest(result.data);
}

function toManifest(parsed: z.infer<typeof manifestSchema>): Manifest {
  const topExtras = pickExtras(parsed, KNOWN_TOP_KEYS);
  const selectionExtras = pickExtras(parsed.selections, KNOWN_SELECTION_KEYS);
  const files: Record<string, ManifestFileEntry> = {};
  for (const [key, entry] of Object.entries(parsed.files)) {
    const extras = pickExtras(entry, KNOWN_FILE_KEYS);
    files[key] = extras === undefined ? { sha256: entry.sha256 } : { sha256: entry.sha256, extras };
  }
  return {
    cliVersion: parsed.cliVersion,
    mode: parsed.mode,
    selections: {
      language: parsed.selections.language,
      frameworks: parsed.selections.frameworks,
      libraries: parsed.selections.libraries,
      architecture: parsed.selections.architecture,
      agents: parsed.selections.agents,
      excluded: parsed.selections.excluded,
      workflows: parsed.selections.workflows,
      ...(selectionExtras === undefined ? {} : { extras: selectionExtras }),
    },
    fragments: parsed.fragments,
    files,
    ...(topExtras === undefined ? {} : { extras: topExtras }),
  };
}

function pickExtras(value: object, known: ReadonlySet<string>): ManifestExtras | undefined {
  const extras: Record<string, unknown> = {};
  let found = false;
  for (const [key, entry] of Object.entries(value)) {
    if (known.has(key)) continue;
    extras[key] = entry;
    found = true;
  }
  return found ? extras : undefined;
}

function appendExtras(target: Record<string, unknown>, extras: ManifestExtras | undefined): void {
  if (extras === undefined) return;
  for (const [key, value] of Object.entries(extras)) {
    if (Object.hasOwn(target, key)) continue;
    target[key] = value;
  }
}

function sortedRecord(record: Readonly<Record<string, string>>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(record).sort(compareText)) {
    const value = record[key];
    if (value === undefined) continue;
    sorted[key] = value;
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
