import { satisfies } from 'semver';
import { AgentInitError } from '../errors.js';
import type { FragmentCategory } from '../types.js';
import type { Registry } from './load.js';
import type { Fragment, RuleFragmentMeta } from './parse.js';

export interface ProjectFacts {
  /** Package name → resolved version. `null` means the package is present but its version is unknown. */
  packages: Readonly<Record<string, string | null>>;
  files: readonly string[];
}

export type SelectionOrigin = 'detected' | 'manual';

export interface Selection {
  language: string;
  architecture: string;
  /** Fragment ids. May be empty (PRD §3.6). */
  frameworks: readonly string[];
  libraries: readonly string[];
  /** How each selected id was chosen. Ids omitted here count as manual. */
  origin: Readonly<Record<string, SelectionOrigin>>;
}

export interface FragmentConflict {
  /** Lexicographically smaller id. */
  a: string;
  /** Lexicographically larger id. */
  b: string;
}

/**
 * Notices stay structured so the wizard (T19) and `doctor` (T28) can format them.
 * `unknown-version` is only emitted when the fragment is still suggested.
 */
export type RegistryNotice =
  | {
      kind: 'unsupported-version';
      package: string;
      version: string;
      fragmentId: string;
    }
  | {
      kind: 'unknown-version';
      package: string;
      fragmentId: string;
    }
  | {
      kind: 'required-by';
      fragmentId: string;
      requiredBy: string;
    }
  | {
      kind: 'incompatible';
      fragmentId: string;
    }
  | {
      kind: 'no-framework';
    };

export interface Suggestion {
  frameworks: string[];
  libraries: string[];
  notices: RegistryNotice[];
}

export interface ResolvedSelection {
  /** Rule fragments, sorted by `order` then `id`. Workflows are returned separately. */
  fragments: Fragment[];
  workflows: Fragment[];
  notices: RegistryNotice[];
  conflicts: FragmentConflict[];
}

interface Expanded {
  fragments: Fragment[];
  /** Fragments pulled in by `requires`, in the order they were added. */
  added: readonly { fragmentId: string; requiredBy: string }[];
  /** `unsupported-version` notices for required fragments that were left out. */
  skipped: readonly RegistryNotice[];
  requiredBy: ReadonlyMap<string, string>;
}

/**
 * Suggest framework and library fragments from detected packages and marker files.
 * Both Next.js fragments can be returned together; router filtering happens later.
 */
export function suggestFragments(registry: Registry, facts: ProjectFacts): Suggestion {
  const files = new Set(facts.files);
  const frameworks: string[] = [];
  const libraries: string[] = [];
  const notices: RegistryNotice[] = [];

  for (const fragment of registry.fragments) {
    const meta = detectableMeta(fragment);
    if (meta === undefined || !matchesDetect(meta, facts.packages, files)) continue;

    const versionNotices = versionNoticesFor(meta, facts.packages);
    const unsupported = versionNotices.filter((notice) => notice.kind === 'unsupported-version');
    if (unsupported.length > 0) {
      notices.push(...unsupported);
      continue;
    }

    notices.push(...versionNotices);
    if (meta.category === 'framework') frameworks.push(meta.id);
    else libraries.push(meta.id);
  }

  return { frameworks, libraries, notices };
}

/**
 * Turn a selection into the fragments to compile.
 * Conflicts are reported, not removed: prompting happens in the wizard.
 * A required fragment is omitted when `facts` names a version outside its
 * `appliesTo` range. Ids in the selection itself are kept.
 */
export function resolveSelection(
  registry: Registry,
  selection: Selection,
  facts?: ProjectFacts,
): ResolvedSelection {
  const packages = facts?.packages;
  const roots = selectionRoots(registry, selection);
  const expanded = expandRequires(registry, roots, new Set(), packages);
  const frameworkIds = expanded.fragments
    .filter((fragment) => fragment.meta.category === 'framework')
    .map((fragment) => fragment.meta.id);

  const dropped = new Set<string>();
  for (const fragment of expanded.fragments) {
    const meta = ruleMeta(fragment);
    if (meta === undefined) continue;
    if (meta.category !== 'library') continue;
    if (!isLibraryCompatible(meta, frameworkIds)) dropped.add(meta.id);
  }

  const resolved = expandRequires(
    registry,
    roots.filter((fragment) => !dropped.has(fragment.meta.id)),
    dropped,
    packages,
  );

  const notices: RegistryNotice[] = resolved.added.map((entry) => ({
    kind: 'required-by',
    fragmentId: entry.fragmentId,
    requiredBy: entry.requiredBy,
  }));
  notices.push(...resolved.skipped);

  if (!resolved.fragments.some((fragment) => fragment.meta.category === 'framework')) {
    notices.push({ kind: 'no-framework' });
  }

  for (const fragment of expanded.fragments) {
    if (dropped.has(fragment.meta.id)) {
      notices.push({ kind: 'incompatible', fragmentId: fragment.meta.id });
    }
  }

  return {
    fragments: resolved.fragments,
    workflows: registry.byCategory('workflow'),
    notices,
    conflicts: findConflicts(resolved.fragments, selection.origin, resolved.requiredBy),
  };
}

function detectableMeta(fragment: Fragment): RuleFragmentMeta | undefined {
  const meta = ruleMeta(fragment);
  if (meta === undefined) return undefined;
  if (meta.category !== 'framework' && meta.category !== 'library') return undefined;
  if (meta.detect === undefined) return undefined;
  return meta;
}

function matchesDetect(
  meta: RuleFragmentMeta,
  packages: ProjectFacts['packages'],
  files: ReadonlySet<string>,
): boolean {
  const detect = meta.detect;
  if (detect === undefined) return false;
  for (const name of detect.packages ?? []) {
    if (!Object.hasOwn(packages, name)) return false;
  }
  for (const file of detect.files ?? []) {
    if (!files.has(file)) return false;
  }
  return true;
}

/**
 * A null version does not reject the fragment: the package was detected, but
 * the range could not be checked. An out-of-range version rejects it.
 */
function versionNoticesFor(meta: RuleFragmentMeta, packages: ProjectFacts['packages']): RegistryNotice[] {
  const appliesTo = meta.appliesTo ?? {};
  const names = [...new Set([...(meta.detect?.packages ?? []), ...Object.keys(appliesTo)])].sort(compareText);
  const unsupported: RegistryNotice[] = [];
  const unknown: RegistryNotice[] = [];

  for (const name of names) {
    const version = packageVersion(packages, name);
    if (version === undefined) continue;
    if (version === null) {
      unknown.push({ kind: 'unknown-version', package: name, fragmentId: meta.id });
      continue;
    }
    const range = appliesTo[name];
    // `>=15` does not match 15.0.0-canary.1 unless prereleases are included.
    if (range !== undefined && !satisfies(version, range, { includePrerelease: true })) {
      unsupported.push({ kind: 'unsupported-version', package: name, version, fragmentId: meta.id });
    }
  }

  return unsupported.length > 0 ? unsupported : unknown;
}

function packageVersion(packages: ProjectFacts['packages'], name: string): string | null | undefined {
  if (!Object.hasOwn(packages, name)) return undefined;
  const version = packages[name];
  return typeof version === 'string' ? version : null;
}

function selectionRoots(registry: Registry, selection: Selection): Fragment[] {
  const language = requireFragment(registry, selection.language, 'language');
  const architecture = requireFragment(registry, selection.architecture, 'architecture');
  const frameworks = selection.frameworks.map((id) => requireFragment(registry, id, 'framework'));
  const libraries = selection.libraries.map((id) => requireFragment(registry, id, 'library'));
  return dedupeFragments([language, architecture, ...frameworks, ...libraries]);
}

function requireFragment(registry: Registry, id: string, category: FragmentCategory): Fragment {
  const fragment = registry.byId.get(id);
  if (fragment === undefined) {
    throw new AgentInitError(`Unknown fragment "${id}".`);
  }
  if (fragment.meta.category !== category) {
    throw new AgentInitError(`Fragment "${id}" is a ${fragment.meta.category}, not a ${category}.`);
  }
  return fragment;
}

/**
 * `blocked` fragments are skipped and do not contribute their own `requires`.
 * A dependency that is already included is not added again.
 * A known version outside `appliesTo` omits the dependency and its own
 * `requires`. A missing fact set, a missing package, or a null version does not.
 */
function expandRequires(
  registry: Registry,
  roots: readonly Fragment[],
  blocked: ReadonlySet<string>,
  packages?: ProjectFacts['packages'],
): Expanded {
  const included = new Map<string, Fragment>();
  const requiredBy = new Map<string, string>();
  const queued = new Set<string>();
  const added: { fragmentId: string; requiredBy: string }[] = [];
  const skipped: RegistryNotice[] = [];

  let wave: Fragment[] = [];
  for (const root of roots) {
    if (blocked.has(root.meta.id) || queued.has(root.meta.id)) continue;
    queued.add(root.meta.id);
    included.set(root.meta.id, root);
    wave.push(root);
  }
  wave.sort(compareFragments);

  while (wave.length > 0) {
    const next: Fragment[] = [];
    for (const current of wave) {
      const requires = ruleMeta(current)?.requires;
      if (requires === undefined) continue;

      const dependencies: Fragment[] = [];
      for (const id of requires) {
        if (blocked.has(id) || queued.has(id)) continue;
        const dependency = registry.byId.get(id);
        if (dependency === undefined) {
          throw new AgentInitError(`Unknown fragment "${id}" required by "${current.meta.id}".`);
        }
        dependencies.push(dependency);
      }
      dependencies.sort(compareFragments);

      for (const dependency of dependencies) {
        queued.add(dependency.meta.id);
        if (dependency.meta.category === 'workflow') continue;
        const meta = ruleMeta(dependency);
        if (meta !== undefined && packages !== undefined) {
          const unsupported = versionNoticesFor(meta, packages).filter(
            (notice) => notice.kind === 'unsupported-version',
          );
          if (unsupported.length > 0) {
            skipped.push(...unsupported);
            continue;
          }
        }
        included.set(dependency.meta.id, dependency);
        requiredBy.set(dependency.meta.id, current.meta.id);
        added.push({ fragmentId: dependency.meta.id, requiredBy: current.meta.id });
        next.push(dependency);
      }
    }
    next.sort(compareFragments);
    wave = next;
  }

  return {
    fragments: [...included.values()].sort(compareFragments),
    added,
    skipped,
    requiredBy,
  };
}

function isLibraryCompatible(meta: RuleFragmentMeta, frameworkIds: readonly string[]): boolean {
  const compatibleWith = meta.compatibleWith;
  if (compatibleWith === undefined) return true;
  return compatibleWith.some((id) => frameworkIds.includes(id));
}

/**
 * Detected pairs are kept and not listed. A pair is reported only when at
 * least one side was chosen manually (PRD §3.5). Required fragments inherit
 * the origin of the fragment that pulled them in.
 */
function findConflicts(
  fragments: readonly Fragment[],
  origin: Selection['origin'],
  requiredBy: ReadonlyMap<string, string>,
): FragmentConflict[] {
  const ids = new Set(fragments.map((fragment) => fragment.meta.id));
  const seen = new Set<string>();
  const conflicts: FragmentConflict[] = [];

  for (const fragment of fragments) {
    const conflictsWith = ruleMeta(fragment)?.conflictsWith;
    if (conflictsWith === undefined) continue;
    for (const otherId of conflictsWith) {
      if (otherId === fragment.meta.id || !ids.has(otherId)) continue;
      const ordered = orderPair(fragment.meta.id, otherId);
      const key = `${ordered.a}\0${ordered.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const left = originOf(ordered.a, origin, requiredBy);
      const right = originOf(ordered.b, origin, requiredBy);
      if (left === 'manual' || right === 'manual') conflicts.push(ordered);
    }
  }

  conflicts.sort((left, right) => compareText(left.a, right.a) || compareText(left.b, right.b));
  return conflicts;
}

function originOf(
  id: string,
  origin: Selection['origin'],
  requiredBy: ReadonlyMap<string, string>,
): SelectionOrigin {
  const seen = new Set<string>();
  let current: string | undefined = id;
  while (current !== undefined && !seen.has(current)) {
    const explicit = origin[current];
    if (explicit !== undefined) return explicit;
    seen.add(current);
    current = requiredBy.get(current);
  }
  return 'manual';
}

function orderPair(left: string, right: string): FragmentConflict {
  return compareText(left, right) <= 0 ? { a: left, b: right } : { a: right, b: left };
}

function ruleMeta(fragment: Fragment): RuleFragmentMeta | undefined {
  if (fragment.meta.category === 'workflow') return undefined;
  return fragment.meta;
}

function dedupeFragments(fragments: readonly Fragment[]): Fragment[] {
  const seen = new Set<string>();
  const unique: Fragment[] = [];
  for (const fragment of fragments) {
    if (seen.has(fragment.meta.id)) continue;
    seen.add(fragment.meta.id);
    unique.push(fragment);
  }
  return unique;
}

function compareFragments(left: Fragment, right: Fragment): number {
  if (left.meta.order !== right.meta.order) return left.meta.order - right.meta.order;
  return compareText(left.meta.id, right.meta.id);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
