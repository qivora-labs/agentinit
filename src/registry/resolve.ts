import { satisfies } from 'semver';
import { compareText } from '../compare-text.js';
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
 * `unknown-version` with `included: true` means the fragment stayed in the
 * suggestion. `included: false` means version-split siblings could not be
 * disambiguated, so none of them were suggested.
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
      included: boolean;
    }
  | {
      kind: 'required-by';
      fragmentId: string;
      requiredBy: string;
    }
  | {
      kind: 'incompatible';
      fragmentId: string;
      /**
       * `no-framework` when nothing was selected; `different-framework` when a
       * framework was selected but is outside this library's `compatibleWith`.
       */
      cause: 'no-framework' | 'different-framework';
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
 * Both Next.js router fragments can be returned together; router filtering happens later.
 * Version-split siblings that share detect packages and globs are omitted when the
 * version is unknown — guessing the current major would apply the wrong rules.
 * An `unsupported-version` notice is emitted once per package when no fragment for
 * that package matched.
 */
export function suggestFragments(registry: Registry, facts: ProjectFacts): Suggestion {
  const files = new Set(facts.files);
  const matched: Fragment[] = [];
  const unsupportedByPackage = new Map<string, RegistryNotice>();

  for (const fragment of registry.fragments) {
    const meta = detectableMeta(fragment);
    if (meta === undefined || !matchesDetect(meta, facts.packages, files)) continue;

    const versionNotices = versionNoticesFor(meta, facts.packages);
    const unsupported = versionNotices.filter((notice) => notice.kind === 'unsupported-version');
    if (unsupported.length > 0) {
      for (const notice of unsupported) {
        if (!unsupportedByPackage.has(notice.package)) {
          unsupportedByPackage.set(notice.package, notice);
        }
      }
      continue;
    }

    matched.push(fragment);
  }

  const { kept, ambiguousNotices } = collapseVersionSiblings(matched);
  const frameworks: string[] = [];
  const libraries: string[] = [];
  const notices: RegistryNotice[] = [...ambiguousNotices];
  const matchedPackages = new Set<string>();

  for (const fragment of kept) {
    const meta = detectableMeta(fragment);
    if (meta === undefined) continue;
    for (const name of meta.detect?.packages ?? []) matchedPackages.add(name);
    for (const notice of versionNoticesFor(meta, facts.packages)) notices.push(notice);
    if (meta.category === 'framework') frameworks.push(meta.id);
    else libraries.push(meta.id);
  }

  for (const [name, notice] of unsupportedByPackage) {
    if (matchedPackages.has(name)) continue;
    notices.push(notice);
  }

  return { frameworks, libraries, notices };
}

/**
 * Keep libraries whose `compatibleWith` lists a selected framework (or that have
 * no `compatibleWith`). Emit an `incompatible` notice for each dropped id.
 */
export function filterCompatibleLibraries(
  registry: Registry,
  libraryIds: readonly string[],
  frameworkIds: readonly string[],
): { libraries: string[]; notices: RegistryNotice[] } {
  const libraries: string[] = [];
  const notices: RegistryNotice[] = [];
  const cause = frameworkIds.length === 0 ? 'no-framework' : 'different-framework';

  for (const id of libraryIds) {
    const meta = ruleMeta(registry.byId.get(id));
    if (meta?.category !== 'library') {
      libraries.push(id);
      continue;
    }
    if (isLibraryCompatible(meta, frameworkIds)) {
      libraries.push(id);
      continue;
    }
    notices.push({ kind: 'incompatible', fragmentId: id, cause });
  }

  return { libraries, notices };
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

  const incompatibleCause = frameworkIds.length === 0 ? 'no-framework' : 'different-framework';
  for (const fragment of expanded.fragments) {
    if (dropped.has(fragment.meta.id)) {
      notices.push({
        kind: 'incompatible',
        fragmentId: fragment.meta.id,
        cause: incompatibleCause,
      });
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
      unknown.push({ kind: 'unknown-version', package: name, fragmentId: meta.id, included: true });
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
 * Version-split siblings share detect packages and globs (e.g. `express` /
 * `express-4`). When more than one matched because the version was unknown,
 * omit them all — preferring the current-major id would mis-label older majors.
 */
function collapseVersionSiblings(fragments: readonly Fragment[]): {
  kept: Fragment[];
  ambiguousNotices: RegistryNotice[];
} {
  const groups = new Map<string, Fragment[]>();
  const order: string[] = [];

  for (const fragment of fragments) {
    const meta = ruleMeta(fragment);
    if (meta?.category !== 'framework') {
      const key = `solo:${fragment.meta.id}`;
      groups.set(key, [fragment]);
      order.push(key);
      continue;
    }
    const key = versionSiblingKey(meta);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [fragment]);
      order.push(key);
    } else {
      existing.push(fragment);
    }
  }

  const kept: Fragment[] = [];
  const ambiguousNotices: RegistryNotice[] = [];
  for (const key of order) {
    const group = groups.get(key);
    if (group === undefined) continue;
    if (group.length === 1) {
      const only = group[0];
      if (only !== undefined) kept.push(only);
      continue;
    }
    const representative = preferCurrentMajor(group);
    const meta = ruleMeta(representative);
    for (const name of meta?.detect?.packages ?? []) {
      ambiguousNotices.push({
        kind: 'unknown-version',
        package: name,
        fragmentId: representative.meta.id,
        included: false,
      });
    }
  }
  return { kept, ambiguousNotices };
}

function versionSiblingKey(meta: RuleFragmentMeta): string {
  const packages = [...(meta.detect?.packages ?? [])].sort(compareText).join('\0');
  const globs = [...(meta.globs ?? [])].sort(compareText).join('\0');
  return `${packages}\0${globs}`;
}

/** Prefer `express` over `express-4` when naming an ambiguous sibling group. */
function preferCurrentMajor(fragments: readonly Fragment[]): Fragment {
  const current = fragments.find((fragment) => !/-\d+$/u.test(fragment.meta.id));
  if (current !== undefined) return current;
  const sorted = [...fragments].sort((left, right) => compareText(left.meta.id, right.meta.id));
  const first = sorted[0];
  if (first === undefined) {
    throw new AgentInitError('preferCurrentMajor requires at least one fragment.');
  }
  return first;
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

function ruleMeta(fragment: Fragment | undefined): RuleFragmentMeta | undefined {
  if (fragment === undefined || fragment.meta.category === 'workflow') return undefined;
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
