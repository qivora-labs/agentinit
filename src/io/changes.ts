import { lstat, readFile, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { AgentInitError } from '../errors.js';
import type { AgentTarget, FileOp } from '../types.js';
import { contentHash } from './hash.js';
import { findBlocks } from './managed-block.js';
import type { Manifest } from './manifest.js';

export type ChangeKind =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'conflict-unmanaged'
  | 'conflict-edited'
  | 'delete-stale';

export interface Change {
  readonly kind: ChangeKind;
  /** Project-relative POSIX path. */
  readonly path: string;
  readonly opKind: 'file' | 'managed-block';
  readonly blockId?: string;
  readonly target?: AgentTarget | 'shared';
  /**
   * Desired bytes. Full file text for a file op, inner block text for a
   * managed block. Omitted when a stale owned entry has nothing to write.
   */
  readonly content?: string;
  /** Manifest hash when this path or block is already owned. */
  readonly ownedHash?: string;
}

interface PlanInput {
  readonly ops: readonly FileOp[];
}

/**
 * Read-only classification of a plan against the manifest and the files on disk.
 * Ownership is the manifest key (`path` or `path#blockId`), not the presence of markers.
 */
export async function computeChanges(
  root: string,
  plan: PlanInput,
  manifest: Manifest | null,
): Promise<Change[]> {
  const files = manifest?.files ?? {};
  const seen = new Set<string>();
  for (const op of plan.ops) {
    assertOp(op);
    const key = opKey(op);
    if (seen.has(key)) {
      throw new AgentInitError(`${key} is written more than once in the plan.`);
    }
    seen.add(key);
  }

  const paths = new Set<string>();
  for (const op of plan.ops) paths.add(op.path);
  for (const key of Object.keys(files)) paths.add(manifestKeyPath(key));

  const disk = new Map<string, string | null>();
  await Promise.all(
    [...paths].map(async (relPath) => {
      disk.set(relPath, await readProjectText(root, relPath));
    }),
  );

  const changes: Change[] = [];
  for (const op of plan.ops) {
    const current = disk.get(op.path) ?? null;
    const owned = files[opKey(op)]?.sha256;
    changes.push(classifyOp(op, current, owned));
  }

  const staleKeys = Object.keys(files)
    .filter((key) => !seen.has(key))
    .sort(comparePath);
  for (const key of staleKeys) {
    const owned = files[key]?.sha256;
    if (owned === undefined) continue;
    const stale = classifyStale(key, owned, disk.get(manifestKeyPath(key)) ?? null);
    if (stale !== null) changes.push(stale);
  }
  return changes;
}

/** Manifest key for a change. A block id is appended with `#`. */
export function changeKey(change: Pick<Change, 'path' | 'blockId'>): string {
  return change.blockId === undefined ? change.path : `${change.path}#${change.blockId}`;
}

/**
 * Classify every owned manifest entry for `remove --all`: unedited entries
 * become `delete-stale`; hand-edited ones become `conflict-edited`.
 */
export async function computeRemoveChanges(root: string, manifest: Manifest): Promise<Change[]> {
  return computeChanges(root, { ops: [] }, manifest);
}

/**
 * Inner text `upsertBlock` will store, in LF. Manifest hashes use this so a
 * missing trailing newline does not look like an edit on the next run.
 */
export function canonicalBlockInner(content: string): string {
  const lf = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  if (lf.length === 0 || lf.endsWith('\n')) return lf;
  return `${lf}\n`;
}

export function assertProjectRelative(relPath: string): void {
  if (
    relPath.length === 0 ||
    relPath.startsWith('/') ||
    /^[A-Za-z]:/u.test(relPath) ||
    relPath.includes('\\') ||
    relPath.includes('\0') ||
    relPath.includes('#')
  ) {
    throw new AgentInitError(`"${relPath}" is not a relative project path.`);
  }
  const segments = relPath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new AgentInitError(`"${relPath}" is not a relative project path.`);
  }
}

/** Absolute path for `relPath`, which must stay inside `root`. */
export function resolveProjectPath(root: string, relPath: string): string {
  assertProjectRelative(relPath);
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, relPath);
  if (pathEscapes(rootAbs, abs)) {
    throw new AgentInitError(`Refusing to use a path outside the project: ${relPath}.`);
  }
  return abs;
}

/** True when `candidate` is outside `rootAbs` after a lexical or realpath resolution. */
export function pathEscapes(rootAbs: string, candidate: string): boolean {
  const relative = path.relative(rootAbs, candidate);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

export interface ProjectPathInfo {
  /** Lexical absolute path. Symlinks are checked, not rewritten. */
  readonly abs: string;
  /** False when the path, or a parent that is not a symlink, is absent. */
  readonly exists: boolean;
  readonly directory: boolean;
}

/**
 * Resolves symlinks one component at a time. A broken symlink, or a target
 * outside the project, throws before the caller reads or creates anything.
 * `exists` is false for a path that was never there.
 */
export async function inspectProjectPath(
  root: string,
  relPath: string,
  purpose: 'read' | 'write',
): Promise<ProjectPathInfo> {
  const abs = resolveProjectPath(root, relPath);
  const rootAbs = path.resolve(root);
  let realRoot: string;
  try {
    realRoot = await realpath(rootAbs);
  } catch (error) {
    throw toAccessError(error, relPath, purpose);
  }

  const segments = relPath.split('/');
  let cursor = rootAbs;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) continue;
    cursor = path.join(cursor, segment);
    const last = index === segments.length - 1;
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (nodeErrorCode(error) === 'ENOENT') return { abs, exists: false, directory: false };
      throw toAccessError(error, relPath, purpose);
    }
    if (info.isSymbolicLink()) {
      const target = await symlinkTarget(cursor, realRoot, relPath, purpose);
      const directory = target.directory;
      if (!last && !directory) throw parentFileError(relPath, purpose);
      if (last) return { abs, exists: true, directory };
      continue;
    }
    if (!last && !info.isDirectory()) throw parentFileError(relPath, purpose);
    if (last) return { abs, exists: true, directory: info.isDirectory() };
  }
  return { abs, exists: false, directory: false };
}

/** `null` when the file is absent. A directory, a bad symlink, or a permission error is reported. */
export async function readProjectText(root: string, relPath: string): Promise<string | null> {
  const located = await inspectProjectPath(root, relPath, 'read');
  if (!located.exists) return null;
  if (located.directory) {
    throw new AgentInitError(`${relPath} is a directory.`, {
      hint: 'Choose a file path.',
    });
  }
  try {
    return await readFile(located.abs, 'utf8');
  } catch (error) {
    const code = nodeErrorCode(error);
    if (code === 'ENOENT') return null;
    if (code === 'EISDIR') {
      throw new AgentInitError(`${relPath} is a directory.`, {
        hint: 'Choose a file path.',
      });
    }
    if (code === 'ENOTDIR') throw parentFileError(relPath, 'read');
    throw toAccessError(error, relPath, 'read');
  }
}

async function symlinkTarget(
  linkPath: string,
  realRoot: string,
  relPath: string,
  purpose: 'read' | 'write',
): Promise<{ directory: boolean }> {
  let target: string;
  try {
    target = await realpath(linkPath);
  } catch (error) {
    const code = nodeErrorCode(error);
    if (code === 'ENOENT' || code === 'ELOOP') {
      throw new AgentInitError(`Refusing to use ${relPath}: it is a broken symlink.`);
    }
    throw toAccessError(error, relPath, purpose);
  }
  if (pathEscapes(realRoot, target)) {
    throw new AgentInitError(`Refusing to use a path outside the project: ${relPath}.`);
  }
  try {
    const info = await lstat(target);
    return { directory: info.isDirectory() };
  } catch (error) {
    throw toAccessError(error, relPath, purpose);
  }
}

function parentFileError(relPath: string, purpose: 'read' | 'write'): AgentInitError {
  if (purpose === 'write') {
    return new AgentInitError(`Cannot create ${relPath}: a file is in the way.`, {
      hint: 'Move that file aside and run again.',
    });
  }
  return new AgentInitError(`Cannot read ${relPath}: a parent path is a file.`, {
    hint: 'Move that file aside and run again.',
  });
}

function toAccessError(error: unknown, relPath: string, purpose: 'read' | 'write'): Error {
  const code = nodeErrorCode(error);
  if (code === 'EACCES' || code === 'EPERM') {
    return new AgentInitError(`Cannot ${purpose} ${relPath}: permission denied.`, {
      hint: 'Check the file permissions and try again.',
    });
  }
  if (error instanceof Error) return error;
  return new AgentInitError(`Cannot ${purpose} ${relPath}.`);
}

function classifyOp(op: FileOp, current: string | null, owned: string | undefined): Change {
  if (op.kind === 'managed-block') return classifyBlock(op, current, owned);
  return classifyFile(op, current, owned);
}

function classifyFile(op: FileOp, current: string | null, owned: string | undefined): Change {
  if (current === null) return planChange('create', op);
  if (owned === undefined) return planChange('conflict-unmanaged', op);
  const currentHash = contentHash(current);
  if (currentHash === contentHash(op.content)) return planChange('unchanged', op, owned);
  if (currentHash === owned) return planChange('update', op, owned);
  return planChange('conflict-edited', op, owned);
}

function classifyBlock(op: FileOp, current: string | null, owned: string | undefined): Change {
  const blockId = op.blockId;
  if (blockId === undefined) {
    throw new AgentInitError(`${op.path}: managed-block operations need a block id.`);
  }
  if (current === null) return planChange('create', op);
  const blocks = findBlocks(current, op.path);
  const existing = blocks.find((block) => block.id === blockId);
  const desired = contentHash(canonicalBlockInner(op.content));
  if (existing === undefined) {
    // A missing owned block was removed by hand. That is an edit, so --yes skips it.
    if (owned === undefined) return planChange('conflict-unmanaged', op);
    return planChange('conflict-edited', op, owned);
  }
  const innerHash = contentHash(existing.inner);
  if (innerHash === desired) return planChange('unchanged', op, owned);
  // Markers we did not record still hold someone else's text. Do not adopt over it.
  if (owned === undefined || innerHash !== owned) return planChange('conflict-edited', op, owned);
  return planChange('update', op, owned);
}

function classifyStale(key: string, owned: string, current: string | null): Change | null {
  const { path: relPath, blockId } = splitManifestKey(key);
  if (current === null) return null;
  if (blockId === undefined) {
    if (contentHash(current) === owned) return staleChange('delete-stale', relPath, 'file', owned);
    return staleChange('conflict-edited', relPath, 'file', owned);
  }
  const blocks = findBlocks(current, relPath);
  const existing = blocks.find((block) => block.id === blockId);
  if (existing === undefined) return null;
  if (contentHash(existing.inner) === owned) {
    return staleChange('delete-stale', relPath, 'managed-block', owned, blockId);
  }
  return staleChange('conflict-edited', relPath, 'managed-block', owned, blockId);
}

function planChange(kind: ChangeKind, op: FileOp, owned?: string): Change {
  return {
    kind,
    path: op.path,
    opKind: op.kind,
    target: op.target,
    content: op.content,
    ...(op.blockId === undefined ? {} : { blockId: op.blockId }),
    ...(owned === undefined ? {} : { ownedHash: owned }),
  };
}

function staleChange(
  kind: 'delete-stale' | 'conflict-edited',
  relPath: string,
  opKind: 'file' | 'managed-block',
  owned: string,
  blockId?: string,
): Change {
  return {
    kind,
    path: relPath,
    opKind,
    ownedHash: owned,
    ...(blockId === undefined ? {} : { blockId }),
  };
}

function assertOp(op: FileOp): void {
  assertProjectRelative(op.path);
  if (op.kind === 'managed-block' && (op.blockId === undefined || op.blockId.length === 0)) {
    throw new AgentInitError(`${op.path}: managed-block operations need a block id.`);
  }
  if (op.kind === 'file' && op.blockId !== undefined) {
    throw new AgentInitError(`${op.path}: file operations cannot include a block id.`);
  }
}

function opKey(op: FileOp): string {
  if (op.kind === 'file') return op.path;
  const blockId = op.blockId;
  if (blockId === undefined) {
    throw new AgentInitError(`${op.path}: managed-block operations need a block id.`);
  }
  return `${op.path}#${blockId}`;
}

function manifestKeyPath(key: string): string {
  return splitManifestKey(key).path;
}

function splitManifestKey(key: string): { path: string; blockId?: string } {
  const hash = key.indexOf('#');
  if (hash === -1) return { path: key };
  return { path: key.slice(0, hash), blockId: key.slice(hash + 1) };
}

function comparePath(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
