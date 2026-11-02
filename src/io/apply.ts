import { randomBytes } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { createPatch } from 'diff';
import { AgentInitError, NotInteractiveError } from '../errors.js';
import type { Prompter } from '../ui/prompter.js';
import {
  canonicalBlockInner,
  changeKey,
  inspectProjectPath,
  pathEscapes,
  readProjectText,
  resolveProjectPath,
  type Change,
} from './changes.js';
import { contentHash } from './hash.js';
import { createWithBlock, findBlocks, removeBlock, upsertBlock } from './managed-block.js';
import { MANIFEST_PATH, serializeManifest, type Manifest } from './manifest.js';

export type ApplyAction =
  | 'created'
  | 'updated'
  | 'adopted'
  | 'backed-up'
  | 'skipped'
  | 'deleted'
  | 'unchanged';

export interface ApplyReportEntry {
  readonly path: string;
  readonly action: ApplyAction;
  /** Unified diff of this change. Empty when the file bytes would not change. */
  readonly diff: string;
  readonly blockId?: string;
  /** Project-relative path of the backup created for this change. */
  readonly backupPath?: string;
}

export interface ApplyResult {
  readonly manifestFiles: Manifest['files'];
  readonly report: readonly ApplyReportEntry[];
}

export interface ApplyOptions {
  /** Backup folder timestamp. Tests pass a fixed clock. */
  readonly now: Date;
  /** Written last, with `manifestFiles` from this apply. Omitted on a dry run. */
  readonly manifest: Omit<Manifest, 'files'>;
  readonly prompter?: Prompter;
  /** Use PRD §3.5 defaults instead of prompting. */
  readonly yes?: boolean;
  /** Backup & replace every conflict. */
  readonly force?: boolean;
  /** Resolve and report, but do not create or modify anything. */
  readonly dryRun?: boolean;
  /**
   * Runs after every temp file is written and before any rename.
   * A throw leaves the project tree unchanged.
   */
  readonly beforeRename?: () => void | Promise<void>;
}

type Choice = 'adopt' | 'backup-replace' | 'skip';
type Decision = Choice | 'proceed';

interface Resolved {
  readonly change: Change;
  readonly decision: Decision;
  readonly diff: string;
  readonly proposed: string | null;
}

interface PathOutcome {
  readonly relPath: string;
  readonly backup: { readonly destRel: string; readonly body: string } | null;
  readonly next: string | null;
  readonly mode: 'write' | 'delete' | 'keep';
  readonly entries: ApplyReportEntry[];
  readonly files: { readonly key: string; readonly sha256: string }[];
}

const GITIGNORE_PATH = '.agentinit/.gitignore';
const BACKUPS_LINE = 'backups/';

/**
 * Resolve conflicts, then write. Temp files are renamed only after all of them
 * exist; the manifest is the last rename. `dryRun` returns the same report and
 * manifest map without creating `.agentinit/` or any other path.
 */
export async function applyChanges(
  root: string,
  changes: readonly Change[],
  options: ApplyOptions,
): Promise<ApplyResult> {
  const originals = await readOriginals(root, changes);
  const resolved = await resolveAll(changes, originals, options);
  const outcome = settleAll(resolved, originals, backupStamp(options.now));
  const manifestFiles = manifestRecord(outcome.flatMap((item) => item.files));
  const result: ApplyResult = { manifestFiles, report: outcome.flatMap((item) => item.entries) };
  if (options.dryRun === true) return result;

  const gitignore = await nextGitignore(root);
  await commit(
    root,
    outcome,
    gitignore,
    serializeManifest({ ...options.manifest, files: manifestFiles }),
    options.beforeRename,
  );
  return result;
}

async function readOriginals(root: string, changes: readonly Change[]): Promise<Map<string, string | null>> {
  const paths = new Set(changes.map((change) => change.path));
  const originals = new Map<string, string | null>();
  await Promise.all(
    [...paths].map(async (relPath) => {
      originals.set(relPath, await readProjectText(root, relPath));
    }),
  );
  return originals;
}

async function resolveAll(
  changes: readonly Change[],
  originals: ReadonlyMap<string, string | null>,
  options: ApplyOptions,
): Promise<Resolved[]> {
  const resolved: Resolved[] = [];
  for (const change of changes) {
    const original = originals.get(change.path) ?? null;
    const proposed = proposedFile(change, original);
    const diff = unifiedDiff(change.path, original, proposed);
    const decision = await decide(change, diff, options);
    resolved.push({ change, decision, diff, proposed });
  }
  return resolved;
}

async function decide(change: Change, diff: string, options: ApplyOptions): Promise<Decision> {
  if (change.kind !== 'conflict-unmanaged' && change.kind !== 'conflict-edited') return 'proceed';
  if (options.force === true) return 'backup-replace';
  if (options.yes === true) return defaultChoice(change);
  const prompter = options.prompter;
  if (prompter === undefined) throw new NotInteractiveError();
  if (diff.length > 0) prompter.note(diff, change.path);
  const choice = await ask(prompter, change);
  if (choice === 'adopt' && change.opKind !== 'managed-block') {
    throw new AgentInitError(`${change.path}: only shared files can be adopted.`);
  }
  return choice;
}

function defaultChoice(change: Change): Choice {
  if (change.kind === 'conflict-unmanaged' && change.opKind === 'managed-block') return 'adopt';
  return 'skip';
}

async function ask(prompter: Prompter, change: Change): Promise<Choice> {
  const label = change.blockId === undefined ? change.path : `${change.path}#${change.blockId}`;
  if (change.kind === 'conflict-unmanaged' && change.opKind === 'managed-block') {
    return choose(prompter, `${label} already exists and is not managed by AgentInit. What should we do?`, 'adopt', [
      { value: 'adopt', label: 'Adopt', hint: 'Keep your content and add the managed block' },
      { value: 'backup-replace', label: 'Backup & replace', hint: 'Back up the file, then write a fresh copy' },
      { value: 'skip', label: 'Skip', hint: 'Leave the file untouched' },
    ]);
  }
  if (change.kind === 'conflict-unmanaged') {
    return choose(prompter, `${label} already exists and is not managed by AgentInit. What should we do?`, 'skip', [
      { value: 'skip', label: 'Skip', hint: 'Leave the file untouched' },
      { value: 'backup-replace', label: 'Backup & replace', hint: 'Back up the file, then write a fresh copy' },
    ]);
  }
  const removing = change.content === undefined;
  const message = removing
    ? `${label} was edited and is no longer in the plan. What should we do?`
    : `${label} was edited after AgentInit wrote it. What should we do?`;
  const replaceHint = removing
    ? change.opKind === 'managed-block'
      ? 'Back up the file, then remove the managed block'
      : 'Back up the file, then remove it'
    : 'Back up the file, then write a fresh copy';
  return choose(prompter, message, 'skip', [
    { value: 'skip', label: 'Skip', hint: 'Leave the file untouched' },
    { value: 'backup-replace', label: 'Backup & replace', hint: replaceHint },
  ]);
}

async function choose(
  prompter: Prompter,
  message: string,
  initialValue: Choice,
  options: readonly { value: Choice; label: string; hint: string }[],
): Promise<Choice> {
  const value = await prompter.select({ message, initialValue, options });
  if (options.some((option) => option.value === value)) return value;
  throw new AgentInitError(`Unexpected conflict choice for "${message}".`);
}

function settleAll(
  resolved: readonly Resolved[],
  originals: ReadonlyMap<string, string | null>,
  stamp: string,
): PathOutcome[] {
  const groups = new Map<string, Resolved[]>();
  for (const item of resolved) {
    const list = groups.get(item.change.path);
    if (list === undefined) groups.set(item.change.path, [item]);
    else list.push(item);
  }
  const outcomes: PathOutcome[] = [];
  for (const [relPath, items] of groups) {
    const original = originals.get(relPath) ?? null;
    outcomes.push(settlePath(relPath, items, original, stamp));
  }
  return outcomes;
}

function settlePath(relPath: string, items: readonly Resolved[], original: string | null, stamp: string): PathOutcome {
  const opKinds = new Set(items.map((item) => item.change.opKind));
  if (opKinds.size > 1) {
    throw new AgentInitError(`${relPath}: cannot mix a whole-file change with a managed block.`);
  }
  const kind = items[0]?.change.opKind;
  if (kind === undefined) {
    throw new AgentInitError(`${relPath}: has no changes to apply.`);
  }
  if (kind === 'file') return settleFile(relPath, items, original, stamp);
  return settleBlocks(relPath, items, original, stamp);
}

function settleFile(relPath: string, items: readonly Resolved[], original: string | null, stamp: string): PathOutcome {
  let next = original;
  let mode: PathOutcome['mode'] = 'keep';
  let backup = false;
  const entries: ApplyReportEntry[] = [];
  const files: { key: string; sha256: string }[] = [];

  for (const item of items) {
    const action = actionFor(item);
    if (item.decision === 'skip') {
      entries.push(entry(item, action, backupPath(relPath, stamp, false)));
      const owned = item.change.ownedHash;
      if (owned !== undefined) files.push({ key: relPath, sha256: owned });
      continue;
    }
    if (item.change.kind === 'unchanged') {
      entries.push(entry(item, action, undefined));
      files.push({ key: relPath, sha256: contentHash(item.change.content ?? '') });
      continue;
    }
    if (item.decision === 'backup-replace') backup = original !== null;
    if (item.change.kind === 'delete-stale' || item.change.content === undefined) {
      next = null;
      mode = original === null ? 'keep' : 'delete';
      entries.push(entry(item, action, backupPath(relPath, stamp, backup)));
      continue;
    }
    next =
      item.change.kind === 'create' || original === null
        ? normalizeNewlines(item.change.content)
        : applyEndings(original, item.change.content);
    mode = next === original ? 'keep' : 'write';
    entries.push(entry(item, action, backupPath(relPath, stamp, backup)));
    files.push({ key: relPath, sha256: contentHash(item.change.content) });
  }

  return {
    relPath,
    backup: backup && original !== null ? { destRel: backupRel(relPath, stamp), body: original } : null,
    next,
    mode,
    entries,
    files,
  };
}

function settleBlocks(relPath: string, items: readonly Resolved[], original: string | null, stamp: string): PathOutcome {
  const replaceFile = items.some(
    (item) => item.decision === 'backup-replace' && item.change.content !== undefined,
  );
  const backup = items.some((item) => item.decision === 'backup-replace') && original !== null;
  let text = replaceFile ? '' : (original ?? '');
  const entries: ApplyReportEntry[] = [];
  const files: { key: string; sha256: string }[] = [];
  const relativeBackup = backupPath(relPath, stamp, backup);

  for (const item of items) {
    const change = item.change;
    const key = changeKey(change);
    const action = actionFor(item);
    if (item.decision === 'skip') {
      entries.push(entry(item, action, undefined));
      if (change.ownedHash !== undefined) files.push({ key, sha256: change.ownedHash });
      // A fresh file would drop every other block. Copy a skipped block back
      // so Skip still leaves that text in the rebuilt file.
      if (replaceFile && change.blockId !== undefined && original !== null) {
        text = retainSkippedBlock(text, original, change.blockId, relPath);
      }
      continue;
    }
    if (change.kind === 'unchanged') {
      entries.push(entry(item, 'unchanged', undefined));
      const inner = canonicalBlockInner(change.content ?? '');
      files.push({ key, sha256: contentHash(inner) });
      if (replaceFile && change.blockId !== undefined) {
        text = placeBlock(text, change.blockId, change.content ?? '', relPath, original);
      }
      continue;
    }
    if (change.kind === 'delete-stale' || change.content === undefined) {
      const blockId = change.blockId;
      if (blockId === undefined) {
        throw new AgentInitError(`${relPath}: a managed-block change needs a block id.`);
      }
      if (!replaceFile) text = withoutBlock(text, blockId, relPath);
      entries.push(entry(item, action, item.decision === 'backup-replace' ? relativeBackup : undefined));
      continue;
    }
    const blockId = change.blockId;
    if (blockId === undefined) {
      throw new AgentInitError(`${relPath}: a managed-block change needs a block id.`);
    }
    text = placeBlock(text, blockId, change.content, relPath, original);
    entries.push(entry(item, action, item.decision === 'backup-replace' ? relativeBackup : undefined));
    files.push({ key, sha256: contentHash(canonicalBlockInner(change.content)) });
  }

  let next: string | null = text;
  let mode: PathOutcome['mode'] = 'write';
  if (original !== null && original.length > 0 && text.length === 0) {
    next = null;
    mode = 'delete';
  } else if (next === original) {
    mode = 'keep';
  } else if (original === null && text.length === 0) {
    mode = 'keep';
    next = null;
  }

  return {
    relPath,
    backup: backup ? { destRel: backupRel(relPath, stamp), body: original } : null,
    next,
    mode,
    entries,
    files,
  };
}

function retainSkippedBlock(text: string, original: string, blockId: string, relPath: string): string {
  const existing = findBlocks(original, relPath).find((block) => block.id === blockId);
  if (existing === undefined) return text;
  return placeBlock(text, blockId, existing.inner, relPath, original);
}

function actionFor(item: Resolved): ApplyAction {
  if (item.decision === 'skip') return 'skipped';
  if (item.decision === 'adopt') return 'adopted';
  if (item.decision === 'backup-replace') {
    return item.change.content === undefined ? 'deleted' : 'backed-up';
  }
  if (item.change.kind === 'create') return 'created';
  if (item.change.kind === 'update') return 'updated';
  if (item.change.kind === 'delete-stale') return 'deleted';
  return 'unchanged';
}

function entry(item: Resolved, action: ApplyAction, backup: string | undefined): ApplyReportEntry {
  return {
    path: item.change.path,
    action,
    diff: action === 'unchanged' ? '' : item.diff,
    ...(item.change.blockId === undefined ? {} : { blockId: item.change.blockId }),
    ...(backup === undefined ? {} : { backupPath: backup }),
  };
}

function proposedFile(change: Change, original: string | null): string | null {
  if (change.kind === 'unchanged') return original;
  if (change.kind === 'delete-stale' || (change.kind === 'conflict-edited' && change.content === undefined)) {
    return removedShape(change, original);
  }
  if (change.content === undefined) return original;
  if (change.opKind === 'file') {
    if (original === null || change.kind === 'create') return normalizeNewlines(change.content);
    return applyEndings(original, change.content);
  }
  const blockId = change.blockId;
  if (blockId === undefined) return original;
  // Adopt keeps bytes outside the block. Replacing a conflict writes the block alone.
  if (change.kind === 'conflict-unmanaged') {
    return placeBlock(original ?? '', blockId, change.content, change.path, original);
  }
  if (change.kind === 'conflict-edited') return freshBlock(blockId, change.content, original);
  return placeBlock(original ?? '', blockId, change.content, change.path, original);
}

function removedShape(change: Change, original: string | null): string | null {
  if (change.opKind === 'file' || change.blockId === undefined || original === null) return null;
  const next = withoutBlock(original, change.blockId, change.path);
  return next.length === 0 ? null : next;
}

function placeBlock(
  text: string,
  blockId: string,
  content: string,
  relPath: string,
  original: string | null,
): string {
  if (text.length === 0) return freshBlock(blockId, content, original);
  return upsertBlock(text, blockId, content, relPath);
}

function freshBlock(blockId: string, content: string, original: string | null): string {
  const created = createWithBlock(blockId, content);
  if (original?.includes('\r\n')) return created.replaceAll('\n', '\r\n');
  return created;
}

function withoutBlock(text: string, blockId: string, relPath: string): string {
  if (text.length === 0) return text;
  const existing = findBlocks(text, relPath).some((block) => block.id === blockId);
  if (!existing) return text;
  return removeBlock(text, blockId, relPath);
}

function normalizeNewlines(content: string): string {
  return content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/** Keep the file's current ending style. New files stay LF. */
function applyEndings(current: string, content: string): string {
  const lf = normalizeNewlines(content);
  if (!current.includes('\r\n')) return lf;
  return lf.replaceAll('\n', '\r\n');
}

function unifiedDiff(relPath: string, before: string | null, after: string | null): string {
  const previous = before ?? '';
  const next = after ?? '';
  if (previous === next) return '';
  return createPatch(relPath, previous, next);
}

function backupRel(relPath: string, stamp: string): string {
  return `.agentinit/backups/${stamp}/${relPath}`;
}

function backupPath(relPath: string, stamp: string, include: boolean): string | undefined {
  if (!include) return undefined;
  return backupRel(relPath, stamp);
}

function backupStamp(now: Date): string {
  // Colons are illegal in Windows directory names. The injected clock keeps tests stable.
  return now.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.', '');
}

function manifestRecord(records: readonly { key: string; sha256: string }[]): Manifest['files'] {
  const files: Manifest['files'] = {};
  for (const record of records) files[record.key] = { sha256: record.sha256 };
  return files;
}

async function nextGitignore(root: string): Promise<string | null> {
  const current = await readProjectText(root, GITIGNORE_PATH);
  if (current === null) return `${BACKUPS_LINE}\n`;
  if (ignoresBackups(current)) return null;
  const ending = current.includes('\r\n') ? '\r\n' : '\n';
  const base = current.endsWith('\n') ? current : `${current}${ending}`;
  return `${base}${BACKUPS_LINE}${ending}`;
}

function ignoresBackups(text: string): boolean {
  return text.split(/\r?\n/u).some((line) => {
    const trimmed = line.trim();
    return trimmed === BACKUPS_LINE || trimmed === '/backups/';
  });
}

type WritePhase = 'backup' | 'file' | 'gitignore' | 'manifest';

interface PendingWrite {
  tmp: string;
  dest: string;
  relPath: string;
  phase: WritePhase;
  renamed: boolean;
}

async function commit(
  root: string,
  outcomes: readonly PathOutcome[],
  gitignore: string | null,
  manifestBody: string,
  beforeRename: ApplyOptions['beforeRename'],
): Promise<void> {
  const createdDirs: string[] = [];
  const pending: PendingWrite[] = [];
  const deletes: string[] = [];
  try {
    for (const outcome of outcomes) {
      if (outcome.backup !== null) {
        await stage(root, outcome.backup.destRel, outcome.backup.body, 'backup', pending, createdDirs);
      }
      if (outcome.mode === 'write' && outcome.next !== null) {
        await stage(root, outcome.relPath, outcome.next, 'file', pending, createdDirs);
      } else if (outcome.mode === 'delete') {
        deletes.push(outcome.relPath);
      }
    }
    if (gitignore !== null) {
      await stage(root, GITIGNORE_PATH, gitignore, 'gitignore', pending, createdDirs);
    }
    await stage(root, MANIFEST_PATH, manifestBody, 'manifest', pending, createdDirs);

    // Every temp exists before the first rename, so a failure here changes no target.
    await beforeRename?.();

    // The ignore rule is in the tree before backup files, so a crash cannot
    // leave a backup directory that Git would commit.
    for (const phase of ['gitignore', 'backup', 'file'] as const) {
      await renamePhase(pending, phase);
    }
    for (const relPath of deletes) {
      try {
        await rm(resolveProjectPath(root, relPath), { force: true });
      } catch (error) {
        throw asWriteError(error, relPath);
      }
    }
    await renamePhase(pending, 'manifest');
  } catch (error) {
    await cleanup(pending, createdDirs);
    throw asWriteError(error);
  }
}

async function stage(
  root: string,
  relPath: string,
  body: string,
  phase: WritePhase,
  pending: PendingWrite[],
  createdDirs: string[],
): Promise<void> {
  const dest = resolveProjectPath(root, relPath);
  await ensureParent(root, dest, createdDirs);
  const tmp = path.join(path.dirname(dest), `.agentinit-${randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, body, 'utf8');
  } catch (error) {
    throw asWriteError(error, relPath);
  }
  pending.push({ tmp, dest, relPath, phase, renamed: false });
}

async function renamePhase(pending: readonly PendingWrite[], phase: WritePhase): Promise<void> {
  for (const item of pending) {
    if (item.phase !== phase || item.renamed) continue;
    try {
      await rename(item.tmp, item.dest);
    } catch (error) {
      throw asWriteError(error, item.relPath);
    }
    item.renamed = true;
  }
}

async function ensureParent(root: string, dest: string, created: string[]): Promise<void> {
  const lexicalRoot = path.resolve(root);
  const parent = path.dirname(dest);
  const parentRel = path.relative(lexicalRoot, parent);
  if (parentRel.length > 0) {
    if (pathEscapes(lexicalRoot, parent)) {
      throw new AgentInitError('Refusing to write outside the project.');
    }
    // Refuse a symlink that leaves the project before mkdir follows it.
    const located = await inspectProjectPath(root, parentRel.split(path.sep).join('/'), 'write');
    if (located.exists && !located.directory) {
      throw new AgentInitError(`Cannot create ${parentRel.split(path.sep).join('/')}: a file is in the way.`, {
        hint: 'Move that file aside and run again.',
      });
    }
  }
  await mkdirChain(lexicalRoot, parent, created);
  const realRoot = await realpath(lexicalRoot);
  const realParent = await realpath(parent);
  if (pathEscapes(realRoot, realParent)) {
    throw new AgentInitError('Refusing to write outside the project.');
  }
}

async function mkdirChain(lexicalRoot: string, dir: string, created: string[]): Promise<void> {
  const relative = path.relative(lexicalRoot, dir);
  if (relative.length === 0) return;
  if (pathEscapes(lexicalRoot, dir)) {
    throw new AgentInitError('Refusing to write outside the project.');
  }
  let current = lexicalRoot;
  let rel = '';
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    rel = rel.length === 0 ? part : `${rel}/${part}`;
    const createdNow = await createDir(current, rel);
    if (createdNow) created.push(current);
    else await assertDirectory(current, rel);
  }
}

async function createDir(dir: string, rel: string): Promise<boolean> {
  try {
    // lstat so a symlink is not treated as missing and then created over.
    await lstat(dir);
    return false;
  } catch (error) {
    if (nodeErrorCode(error) !== 'ENOENT') throw asWriteError(error, rel);
    try {
      await mkdir(dir);
    } catch (mkdirError) {
      throw asWriteError(mkdirError, rel);
    }
    return true;
  }
}

async function assertDirectory(dir: string, rel: string): Promise<void> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(dir);
  } catch (error) {
    throw asWriteError(error, rel);
  }
  if (info.isDirectory()) return;
  throw new AgentInitError(`Cannot create ${rel}: a file is in the way.`, {
    hint: 'Move that file aside and run again.',
  });
}

async function cleanup(pending: readonly PendingWrite[], created: readonly string[]): Promise<void> {
  for (const item of pending) {
    if (item.renamed) continue;
    try {
      await rm(item.tmp, { force: true });
    } catch {
      // The original error is the one the caller needs.
    }
  }
  for (const dir of [...created].reverse()) {
    try {
      // rm() without recursive refuses directories. rmdir removes only an empty one.
      await rmdir(dir);
    } catch {
      // A directory that still holds user files stays.
    }
  }
}

function asWriteError(error: unknown, relPath?: string): unknown {
  if (error instanceof AgentInitError) return error;
  const code = nodeErrorCode(error);
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    const target = relPath ?? 'files';
    return new AgentInitError(`Cannot write ${target}: permission denied.`, {
      hint: 'Check the file permissions and try again.',
    });
  }
  return error;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
