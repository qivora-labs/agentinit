import { satisfies } from 'semver';
import { compareText } from '../compare-text.js';
import type { PlanWarning } from '../plan/types.js';

/** Same command `init` prints for users who have not generated rules yet. */
export const INIT_FIX = 'npx @agentinit/cli init';

export const EDITED_FIX =
  'Move your text outside the agentinit markers, then run `npx @agentinit/cli init`, or exclude the fragment with *Customize*.';

export const NO_ISSUES = 'No issues found.';

export const DOCTOR_ISSUE_KINDS = [
  'not-initialized',
  'missing',
  'edited',
  'outdated',
  'unmanaged',
  'stale',
  'unselected',
  'package-removed',
  'unsupported-version',
  'always-on-tokens',
  'legacy-file',
] as const;

export type DoctorIssueKind = (typeof DOCTOR_ISSUE_KINDS)[number];

export type DoctorSeverity = 'error' | 'warning';

export interface DoctorIssue {
  readonly kind: DoctorIssueKind;
  readonly severity: DoctorSeverity;
  /** Project-relative path, or `path#blockId` for one managed block. */
  readonly path?: string;
  readonly message: string;
  readonly fix: string;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly issues: readonly DoctorIssue[];
}

export const DOCTOR_CHECK_IDS = [
  'manifest',
  'managed-files',
  'detected-packages',
  'package-versions',
  'token-budget',
  'legacy-files',
] as const;

export type DoctorCheckId = (typeof DOCTOR_CHECK_IDS)[number];

/** TTY checklist row from PRD §6.5. Painting stays in `ui/`. */
export interface DoctorCheck {
  readonly id: DoctorCheckId;
  readonly label: string;
  readonly ok: boolean;
  readonly issues: readonly DoctorIssue[];
}

const CHECK_LABEL: Record<DoctorCheckId, string> = {
  manifest: 'manifest',
  'managed-files': 'managed files',
  'detected-packages': 'detected packages',
  'package-versions': 'package versions',
  'token-budget': 'token budget',
  'legacy-files': 'legacy files',
};

const CHECK_FOR_KIND: Record<DoctorIssueKind, DoctorCheckId> = {
  'not-initialized': 'manifest',
  missing: 'managed-files',
  edited: 'managed-files',
  outdated: 'managed-files',
  unmanaged: 'managed-files',
  stale: 'managed-files',
  unselected: 'detected-packages',
  'package-removed': 'package-versions',
  'unsupported-version': 'package-versions',
  'always-on-tokens': 'token-budget',
  'legacy-file': 'legacy-files',
};

/**
 * Severity per issue kind (PRD §6.5). A new kind must pick a severity —
 * the `never` branch fails the typecheck until it does.
 */
const SEVERITY_FOR_KIND = {
  'not-initialized': 'error',
  missing: 'error',
  edited: 'error',
  outdated: 'error',
  unmanaged: 'error',
  stale: 'error',
  unselected: 'error',
  'package-removed': 'error',
  'unsupported-version': 'error',
  'always-on-tokens': 'warning',
  'legacy-file': 'warning',
} as const satisfies Record<DoctorIssueKind, DoctorSeverity>;

function severityFor(kind: DoctorIssueKind): DoctorSeverity {
  switch (kind) {
    case 'not-initialized':
    case 'missing':
    case 'edited':
    case 'outdated':
    case 'unmanaged':
    case 'stale':
    case 'unselected':
    case 'package-removed':
    case 'unsupported-version':
    case 'always-on-tokens':
    case 'legacy-file':
      return SEVERITY_FOR_KIND[kind];
    default: {
      const unexpected: never = kind;
      throw new Error(`Unhandled doctor issue kind: ${String(unexpected)}`);
    }
  }
}

/**
 * A slice of `Change` from `computeChanges`. This module cannot import `io/`.
 * `blockMissing` is set by the command: a removed owned block is classified
 * as `conflict-edited`, and doctor reports that case as missing.
 */
export interface DriftChange {
  readonly kind:
    | 'create'
    | 'update'
    | 'unchanged'
    | 'conflict-unmanaged'
    | 'conflict-edited'
    | 'delete-stale';
  readonly path: string;
  readonly blockId?: string;
  readonly blockMissing?: boolean;
}

export interface NamedFragment {
  readonly id: string;
  readonly name: string;
}

/** A selected framework or library, reduced to the fields the package checks need. */
export interface CheckedFragment {
  readonly id: string;
  readonly name: string;
  readonly packages: readonly string[];
  readonly appliesTo: Readonly<Record<string, string>>;
}

export interface DoctorInput {
  readonly initialized: boolean;
  readonly changes: readonly DriftChange[];
  readonly unselected: readonly NamedFragment[];
  readonly fragments: readonly CheckedFragment[];
  readonly packages: Readonly<Record<string, string | null>>;
  readonly warnings: readonly PlanWarning[];
  readonly legacyFiles: readonly string[];
}

const GROUP_TITLE: Record<DoctorIssueKind, string> = {
  'not-initialized': 'Not initialized',
  missing: 'Missing',
  edited: 'Edited',
  outdated: 'Out of date',
  unmanaged: 'Unmanaged',
  stale: 'Stale',
  unselected: 'Not selected',
  'package-removed': 'Package removed',
  'unsupported-version': 'Unsupported version',
  'always-on-tokens': 'Always-on budget',
  'legacy-file': 'Legacy files',
};

/**
 * A project with no supported framework is not an issue (PRD §3.6).
 * An empty framework list is simply omitted; nothing here turns that into an issue.
 * Without a manifest, later checks are skipped so every detected package is not reported.
 */
export function collectDoctorIssues(input: DoctorInput): DoctorIssue[] {
  if (!input.initialized) return [notInitializedIssue()];
  return [
    ...checkChanges(input.changes),
    ...checkUnselected(input.unselected),
    ...checkFragmentPackages(input.fragments, input.packages),
    ...checkAlwaysOn(input.warnings),
    ...checkLegacy(input.legacyFiles),
  ];
}

/** `ok` is true when there are no error-severity issues (warnings are fine). */
export function doctorReport(issues: readonly DoctorIssue[]): DoctorReport {
  return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
}

export function countBySeverity(issues: readonly DoctorIssue[]): {
  readonly errors: number;
  readonly warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/**
 * Six checks from PRD §6.5. Issues are grouped under the check they fail;
 * a check with no matching issue is a pass.
 * Without a manifest, later checks never ran — list only the failed manifest row.
 */
export function doctorChecklist(issues: readonly DoctorIssue[]): DoctorCheck[] {
  const notInitialized = issues.filter((issue) => issue.kind === 'not-initialized');
  if (notInitialized.length > 0) {
    return [
      {
        id: 'manifest',
        label: CHECK_LABEL.manifest,
        ok: false,
        issues: notInitialized,
      },
    ];
  }

  const byCheck = new Map<DoctorCheckId, DoctorIssue[]>();
  for (const id of DOCTOR_CHECK_IDS) byCheck.set(id, []);
  for (const issue of issues) {
    const bucket = byCheck.get(CHECK_FOR_KIND[issue.kind]);
    if (bucket === undefined) continue;
    bucket.push(issue);
  }
  return DOCTOR_CHECK_IDS.map((id) => {
    const checkIssues = byCheck.get(id) ?? [];
    return {
      id,
      label: CHECK_LABEL[id],
      ok: checkIssues.length === 0,
      issues: checkIssues,
    };
  });
}

export function issuesFoundMessage(errors: number, warnings: number): string {
  const parts: string[] = [];
  if (errors === 1) parts.push('1 error');
  else if (errors > 1) parts.push(`${String(errors)} errors`);
  if (warnings === 1) parts.push('1 warning');
  else if (warnings > 1) parts.push(`${String(warnings)} warnings`);
  if (parts.length === 0) return NO_ISSUES;
  return `${parts.join(', ')} found.`;
}

/** Groups issues by kind, in first-seen order, with a fix command on every issue. */
export function formatDoctorReport(issues: readonly DoctorIssue[]): string {
  if (issues.length === 0) return NO_ISSUES;
  const groups: { title: string; issues: DoctorIssue[] }[] = [];
  const index = new Map<DoctorIssueKind, number>();
  for (const issue of issues) {
    let slot = index.get(issue.kind);
    if (slot === undefined) {
      slot = groups.length;
      index.set(issue.kind, slot);
      groups.push({ title: GROUP_TITLE[issue.kind], issues: [] });
    }
    const group = groups[slot];
    if (group === undefined) continue;
    group.issues.push(issue);
  }
  return groups.map(formatGroup).join('\n\n');
}

export function notInitializedIssue(): DoctorIssue {
  return issue('not-initialized', { message: 'Not initialized', fix: INIT_FIX });
}

export function checkChanges(changes: readonly DriftChange[]): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  for (const change of changes) {
    const next = issueForChange(change);
    if (next !== undefined) issues.push(next);
  }
  return issues;
}

export function checkUnselected(fragments: readonly NamedFragment[]): DoctorIssue[] {
  return fragments.map((fragment) =>
    issue('unselected', {
      message: `${fragment.name} (${fragment.id}) matches this project and is not selected.`,
      fix: INIT_FIX,
    }),
  );
}

/**
 * `null` means the package is installed but its version is unknown. That is not
 * "outside appliesTo": the range could not be checked.
 */
export function checkFragmentPackages(
  fragments: readonly CheckedFragment[],
  installed: Readonly<Record<string, string | null>>,
): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  for (const fragment of fragments) {
    const seen = new Set<string>();
    for (const packageName of fragment.packages) {
      seen.add(packageName);
      const next = packageIssue(fragment, packageName, installed);
      if (next !== undefined) issues.push(next);
    }
    const extras = Object.keys(fragment.appliesTo)
      .filter((packageName) => !seen.has(packageName))
      .sort(compareText);
    for (const packageName of extras) {
      const next = versionIssue(fragment, packageName, installed);
      if (next !== undefined) issues.push(next);
    }
  }
  return issues;
}

export function checkAlwaysOn(warnings: readonly PlanWarning[]): DoctorIssue[] {
  return warnings.map((warning) => {
    const tokens = tokenCount(warning.tokens);
    const limit = tokenCount(warning.limit);
    return issue('always-on-tokens', {
      message: `Always-on content is ${tokens} tokens, over the ${limit} token budget.`,
      fix: `Reduce always-on rules below ${limit} tokens.`,
    });
  });
}

export function checkLegacy(paths: readonly string[]): DoctorIssue[] {
  return paths.map((filePath) =>
    issue('legacy-file', {
      path: filePath,
      message: `${filePath} still loads alongside the new rules.`,
      fix: `Remove ${filePath} if you no longer need it.`,
    }),
  );
}

function issue(
  kind: DoctorIssueKind,
  fields: { readonly message: string; readonly fix: string; readonly path?: string },
): DoctorIssue {
  return {
    kind,
    severity: severityFor(kind),
    message: fields.message,
    fix: fields.fix,
    ...(fields.path === undefined ? {} : { path: fields.path }),
  };
}

function issueForChange(change: DriftChange): DoctorIssue | undefined {
  if (change.blockMissing === true) return missingBlock(change);
  switch (change.kind) {
    case 'unchanged':
      return undefined;
    case 'create':
      return missingFile(change);
    case 'conflict-edited':
      return edited(change);
    case 'update':
      return drifted(change, 'outdated', 'does not match the generated rules');
    case 'conflict-unmanaged':
      return drifted(change, 'unmanaged', 'is not managed');
    case 'delete-stale':
      return drifted(change, 'stale', 'is no longer generated');
  }
}

function missingFile(change: DriftChange): DoctorIssue {
  return issue('missing', {
    path: location(change),
    message: `${change.path} is missing.`,
    fix: INIT_FIX,
  });
}

function missingBlock(change: DriftChange): DoctorIssue {
  const blockId = change.blockId ?? 'unknown';
  return issue('missing', {
    path: location(change),
    message: `${change.path} is missing managed block "${blockId}".`,
    fix: INIT_FIX,
  });
}

function edited(change: DriftChange): DoctorIssue {
  const blockId = change.blockId;
  const message =
    blockId === undefined
      ? `${change.path} was edited by hand.`
      : `${change.path} managed block "${blockId}" was edited by hand.`;
  return issue('edited', { path: location(change), message, fix: EDITED_FIX });
}

function drifted(change: DriftChange, kind: DoctorIssueKind, detail: string): DoctorIssue {
  const blockId = change.blockId;
  const message =
    blockId === undefined ? `${change.path} ${detail}.` : `${change.path} managed block "${blockId}" ${detail}.`;
  return issue(kind, { path: location(change), message, fix: INIT_FIX });
}

function location(change: DriftChange): string {
  return change.blockId === undefined ? change.path : `${change.path}#${change.blockId}`;
}

function packageIssue(
  fragment: CheckedFragment,
  packageName: string,
  installed: Readonly<Record<string, string | null>>,
): DoctorIssue | undefined {
  if (!Object.hasOwn(installed, packageName)) return packageRemoved(fragment, packageName);
  return versionIssue(fragment, packageName, installed);
}

function versionIssue(
  fragment: CheckedFragment,
  packageName: string,
  installed: Readonly<Record<string, string | null>>,
): DoctorIssue | undefined {
  if (!Object.hasOwn(installed, packageName)) return undefined;
  const version = installed[packageName];
  if (version === null || version === undefined) return undefined;
  const range = fragment.appliesTo[packageName];
  if (range === undefined) return undefined;
  if (satisfies(version, range, { includePrerelease: true })) return undefined;
  return issue('unsupported-version', {
    message: `${fragment.name} (${fragment.id}) is selected, but ${packageName}@${version} is outside ${range}.`,
    fix: INIT_FIX,
  });
}

function packageRemoved(fragment: CheckedFragment, packageName: string): DoctorIssue {
  return issue('package-removed', {
    message: `${fragment.name} (${fragment.id}) is selected, but ${packageName} is not in the project.`,
    fix: INIT_FIX,
  });
}

function formatGroup(group: { title: string; issues: readonly DoctorIssue[] }): string {
  const lines = [group.title];
  for (const next of group.issues) {
    // The not-initialized message is the group title. Print that phrase once.
    const repeated = next.message === group.title;
    if (!repeated) lines.push(`  ${next.message}`);
    lines.push(`${repeated ? '  ' : '    '}Fix: ${next.fix}`);
  }
  return lines.join('\n');
}

function tokenCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
