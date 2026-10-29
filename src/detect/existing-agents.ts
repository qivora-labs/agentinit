import { statSync } from 'node:fs';
import * as path from 'node:path';
import type { AgentTarget } from '../types.js';

interface AgentCandidate {
  readonly path: string;
  readonly kind: 'file' | 'directory';
}

/**
 * Order is the scan order. Directory entries must be directories; file entries
 * must be files. Returned paths are these POSIX literals, not `path.join`
 * output, so the result stays POSIX on Windows.
 */
const AGENT_CANDIDATES: readonly AgentCandidate[] = [
  { path: 'AGENTS.md', kind: 'file' },
  { path: 'CLAUDE.md', kind: 'file' },
  { path: '.claude', kind: 'directory' },
  { path: '.cursor', kind: 'directory' },
  { path: '.cursorrules', kind: 'file' },
  { path: '.windsurfrules', kind: 'file' },
  { path: '.windsurf', kind: 'directory' },
  { path: '.devin', kind: 'directory' },
  { path: '.github/copilot-instructions.md', kind: 'file' },
  { path: '.github/instructions', kind: 'directory' },
];

const LEGACY_FILES = ['.cursorrules', '.windsurfrules'] as const;

/**
 * `.devin/` is Windsurf's directory in Devin Desktop. `AGENTS.md` is shared,
 * so it is listed here but does not preselect an agent.
 */
const PRESELECT: readonly (readonly [AgentTarget, readonly string[]])[] = [
  ['cursor', ['.cursor', '.cursorrules']],
  ['claude', ['CLAUDE.md', '.claude']],
  ['windsurf', ['.windsurf', '.windsurfrules', '.devin']],
  ['copilot', ['.github/copilot-instructions.md', '.github/instructions']],
];

/** POSIX paths, in scan order, for agent files and directories that exist. */
export function findExistingAgentFiles(root: string): string[] {
  return AGENT_CANDIDATES.filter((candidate) => exists(root, candidate)).map(
    (candidate) => candidate.path,
  );
}

/**
 * Agents whose config is already present. An empty list means "all four";
 * the caller applies that default (PRD §3.5). `AGENTS.md` matches nothing.
 * Paths are matched after normalizing `./`, backslashes, and a trailing slash.
 */
export function preselectAgents(files: readonly string[]): AgentTarget[] {
  const present = new Set(files.map(normalizeRelativePath));
  const selected: AgentTarget[] = [];
  for (const [agent, markers] of PRESELECT) {
    if (markers.some((marker) => present.has(marker))) selected.push(agent);
  }
  return selected;
}

/** Legacy single-file rules, used for warnings and `doctor`. */
export function findLegacyFiles(root: string): string[] {
  return LEGACY_FILES.filter((relativePath) => isFile(path.join(root, relativePath)));
}

function exists(root: string, candidate: AgentCandidate): boolean {
  const target = path.join(root, candidate.path);
  return candidate.kind === 'directory' ? isDirectory(target) : isFile(target);
}

function normalizeRelativePath(file: string): string {
  const slashes = stripTrailingSlashes(file.replaceAll('\\', '/'));
  return path.posix.normalize(slashes);
}

function stripTrailingSlashes(file: string): string {
  let end = file.length;
  while (end > 0 && file[end - 1] === '/') end -= 1;
  return file.slice(0, end);
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(directory: string): boolean {
  try {
    return statSync(directory).isDirectory();
  } catch {
    return false;
  }
}
