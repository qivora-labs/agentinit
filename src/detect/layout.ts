import { readdirSync, statSync, type Dirent } from 'node:fs';
import * as path from 'node:path';
import { AgentInitError } from '../errors.js';

/**
 * Directories that are never part of the project layout.
 * Dot-folders are skipped too, which also covers `.next`.
 */
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.next', 'coverage']);

const FEATURE_ROOTS = ['features', 'modules'] as const;
const LAYER_NAMES = ['domain', 'application', 'infrastructure', 'presentation'] as const;
const ATOMIC_NAMES = ['atoms', 'molecules', 'organisms', 'templates'] as const;

/**
 * Scoring table. Weights are dyadic so they stay exact in IEEE floats.
 * 0.7 is the prompt line (PRD §3.3): a clear pattern is at least 0.75, and
 * the strongest pattern minus the weakest competing signal is 0.875 − 0.25 = 0.625.
 * One extra signal therefore always falls below 0.7.
 *
 * feature-based — direct children of top-level `features/` or `modules/`
 * (the larger count). Children have to sit at depth 2, so a nested
 * `app/features` folder is not a feature root.
 * - ≥ 3 children → 0.875
 * - 2 children   → 0.75   (threshold)
 * - 1 child      → 0.5    (partial)
 * - directory only → 0.25 (partial)
 *
 * layered — how many of domain, application, infrastructure, presentation
 * appear as the last segment of a listed path (`components/domain` counts).
 * - 4 → 0.875
 * - 3 → 0.75    (threshold)
 * - 2 → 0.5     (partial)
 * - 1 → 0.25    (partial)
 *
 * atomic-design — how many of atoms, molecules, organisms, templates appear.
 * `components/atoms` matches the registry fragment; a top-level `atoms/` matches too.
 * - 3 or 4 → 0.875
 * - 2      → 0.75  (threshold)
 * - 1      → 0.25  (partial)
 *
 * flat — used when nothing reaches its threshold. Smaller trees are a better
 * flat claim.
 * - ≤ 4 top-level and ≤ 6 nested → 0.875
 * - ≤ 8 top-level and ≤ 12 nested → 0.75
 * - larger → 0.5
 *
 * The winner's weight is reduced by every other positive weight. The result
 * is clamped to [0.125, 1] so a total cancellation stays positive and still
 * below 0.7. Equal qualifying weights keep the earlier id: feature-based,
 * then layered, then atomic-design.
 */
const LAYER_WEIGHT = [0, 0.25, 0.5, 0.75, 0.875] as const;
const ATOMIC_WEIGHT = [0, 0.25, 0.75, 0.875, 0.875] as const;
const FLAT_SMALL = 0.875;
const FLAT_MEDIUM = 0.75;
const FLAT_LARGE = 0.5;
const MIN_CONFIDENCE = 0.125;
const MAX_FOLDER_DEPTH = 2;
const FLAT_SMALL_TOP = 4;
const FLAT_SMALL_NESTED = 6;
const FLAT_MEDIUM_TOP = 8;
const FLAT_MEDIUM_NESTED = 12;

export type ArchitectureId = 'feature-based' | 'layered' | 'atomic-design' | 'flat';

export interface NextRouters {
  readonly app: boolean;
  readonly pages: boolean;
}

export interface ArchitectureInference {
  readonly id: ArchitectureId;
  readonly confidence: number;
}

interface Signal {
  readonly id: Exclude<ArchitectureId, 'flat'>;
  readonly weight: number;
  readonly qualifies: boolean;
}

/** `src` when `<root>/src` is a directory that contains a `.ts` or `.tsx` file. */
export function detectSrcDir(root: string): '' | 'src' {
  const src = path.join(root, 'src');
  if (!isDirectory(src)) return '';
  return containsSourceFile(src) ? 'src' : '';
}

/**
 * App Router and Pages Router directories. Both can be true.
 * Checks `<srcDir>/app` and `<srcDir>/pages`. When `srcDir` is `src`, a
 * root-level `app/` or `pages/` counts too, because Next.js allows either place.
 */
export function detectNextRouters(root: string, srcDir: '' | 'src'): NextRouters {
  const bases = srcDir === 'src' ? [path.join(root, 'src'), root] : [root];
  return {
    app: bases.some((base) => isDirectory(path.join(base, 'app'))),
    pages: bases.some((base) => isDirectory(path.join(base, 'pages'))),
  };
}

/**
 * Directories under `srcDir`, at most two levels down, relative to that
 * directory (not prefixed with `src/`). POSIX, sorted by code unit.
 * Skips `node_modules`, `dist`, `build`, `.next`, `coverage`, and dot-folders.
 */
export function listFolders(root: string, srcDir: '' | 'src'): string[] {
  const base = srcDir === 'src' ? path.join(root, 'src') : root;
  if (!isDirectory(base)) return [];
  const folders: string[] = [];
  collectFolders(base, '', 1, folders);
  folders.sort(comparePaths);
  return folders;
}

/** Registry architecture id and a confidence score. See the scoring table above. */
export function inferArchitecture(folders: readonly string[]): ArchitectureInference {
  const signals = [featureSignal(folders), layerSignal(folders), atomicSignal(folders)];
  const winner = qualifyingSignal(signals);
  if (winner === undefined) {
    return {
      id: 'flat',
      confidence: clampConfidence(flatWeight(folders) - competingWeight(signals, undefined)),
    };
  }
  return {
    id: winner.id,
    confidence: clampConfidence(winner.weight - competingWeight(signals, winner.id)),
  };
}

function featureSignal(folders: readonly string[]): Signal {
  let children = 0;
  let present = false;
  for (const name of FEATURE_ROOTS) {
    const count = directChildCount(folders, name);
    if (count > children) children = count;
    if (count > 0 || folders.includes(name)) present = true;
  }
  return {
    id: 'feature-based',
    weight: featureWeight(children, present),
    qualifies: children >= 2,
  };
}

function layerSignal(folders: readonly string[]): Signal {
  const count = countNames(folders, LAYER_NAMES);
  return {
    id: 'layered',
    weight: weightAt(LAYER_WEIGHT, count),
    qualifies: count >= 3,
  };
}

function atomicSignal(folders: readonly string[]): Signal {
  const count = countNames(folders, ATOMIC_NAMES);
  return {
    id: 'atomic-design',
    weight: weightAt(ATOMIC_WEIGHT, count),
    qualifies: count >= 2,
  };
}

function qualifyingSignal(signals: readonly Signal[]): Signal | undefined {
  let winner: Signal | undefined;
  for (const signal of signals) {
    if (!signal.qualifies) continue;
    if (winner === undefined || signal.weight > winner.weight) winner = signal;
  }
  return winner;
}

function competingWeight(signals: readonly Signal[], winner: Signal['id'] | undefined): number {
  let total = 0;
  for (const signal of signals) {
    if (signal.id === winner) continue;
    total += signal.weight;
  }
  return total;
}

/** ≥ 2 children is the feature-based threshold. More children score higher. */
function featureWeight(children: number, present: boolean): number {
  if (!present) return 0;
  if (children >= 3) return 0.875;
  if (children === 2) return 0.75;
  if (children === 1) return 0.5;
  return 0.25;
}

function flatWeight(folders: readonly string[]): number {
  let topLevel = 0;
  let nested = 0;
  for (const folder of folders) {
    if (folder.includes('/')) nested += 1;
    else topLevel += 1;
  }
  if (topLevel <= FLAT_SMALL_TOP && nested <= FLAT_SMALL_NESTED) return FLAT_SMALL;
  if (topLevel <= FLAT_MEDIUM_TOP && nested <= FLAT_MEDIUM_NESTED) return FLAT_MEDIUM;
  return FLAT_LARGE;
}

function clampConfidence(value: number): number {
  if (value < MIN_CONFIDENCE) return MIN_CONFIDENCE;
  if (value > 1) return 1;
  return value;
}

function weightAt(weights: readonly number[], count: number): number {
  return weights[count] ?? 0;
}

function directChildCount(folders: readonly string[], name: string): number {
  const prefix = `${name}/`;
  let count = 0;
  for (const folder of folders) {
    if (!folder.startsWith(prefix)) continue;
    const rest = folder.slice(prefix.length);
    if (rest.length > 0 && !rest.includes('/')) count += 1;
  }
  return count;
}

function countNames(folders: readonly string[], names: readonly string[]): number {
  const present = new Set<string>();
  for (const folder of folders) present.add(baseName(folder));
  let count = 0;
  for (const name of names) {
    if (present.has(name)) count += 1;
  }
  return count;
}

function baseName(folder: string): string {
  const slash = folder.lastIndexOf('/');
  return slash === -1 ? folder : folder.slice(slash + 1);
}

function collectFolders(directory: string, relative: string, depth: number, folders: string[]): void {
  for (const entry of readDirectory(directory)) {
    // Symlinks are not directories here, so a link cannot cycle the walk.
    if (!entry.isDirectory() || isSkippedDirectory(entry.name)) continue;
    const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
    folders.push(next);
    if (depth < MAX_FOLDER_DEPTH) {
      collectFolders(path.join(directory, entry.name), next, depth + 1, folders);
    }
  }
}

function containsSourceFile(directory: string): boolean {
  for (const entry of readDirectory(directory)) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (containsSourceFile(fullPath)) return true;
      continue;
    }
    if (entry.isFile() && isTypeScriptFile(entry.name)) return true;
  }
  return false;
}

function isTypeScriptFile(name: string): boolean {
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

function isSkippedDirectory(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRECTORIES.has(name);
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function readDirectory(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return [];
    throw new AgentInitError(`Cannot read ${directory}.`);
  }
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
