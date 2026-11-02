import type { Writable } from 'node:stream';
import { requireInteractiveOrYes, type RunContext } from '../context.js';
import { detectProject, type DetectionResult } from '../detect/index.js';
import { findExistingAgentFiles } from '../detect/existing-agents.js';
import { readPackageJson } from '../detect/packages.js';
import { findGitRoot } from '../detect/workspace.js';
import { AgentInitError } from '../errors.js';
import { SUCCESS } from '../exit-codes.js';
import { applyChanges, type ApplyReportEntry } from '../io/apply.js';
import { computeChanges, type Change } from '../io/changes.js';
import { readManifest, type Manifest } from '../io/manifest.js';
import { buildPlan } from '../plan/build-plan.js';
import type { Plan, PlanWarning } from '../plan/types.js';
import { loadRegistry, type Registry } from '../registry/load.js';
import type { ProjectFacts, ResolvedSelection, Selection } from '../registry/resolve.js';
import type { AgentTarget, Language, ProjectProfile } from '../types.js';
import { confirmGitRoot } from '../ui/git-root.js';
import { isNonInteractiveSetup, nonInteractiveSelection } from '../ui/defaults.js';
import {
  formatLowConfidence,
  formatRegistryNotice,
  formatWarning,
  type LowConfidenceNotice,
} from '../ui/format.js';
import type { Logger } from '../ui/logger.js';
import { greenfieldNextSteps } from '../ui/next-steps.js';
import { createClackPrompter, type Prompter } from '../ui/prompter.js';
import { formatDiffs, formatFileTree, formatTokenLine, type ReportFile } from '../ui/report.js';
import { draftWithSavedSelections, formatSelectionChanges, type SavedSelections } from '../ui/saved-selection.js';
import { confirmDetected } from '../ui/summary.js';
import { runGreenfieldWizard, type GreenfieldInitial } from '../ui/wizard.js';
import { resolveWithConflicts } from './resolve-conflicts.js';
import pkg from '../../package.json' with { type: 'json' };

export interface InitOptions {
  readonly prompter?: Prompter;
  readonly stdout?: Writable;
  readonly now?: Date;
  readonly registryDir?: string;
  /** When true before rename, temps are removed and the project is unchanged. */
  readonly shouldStop?: () => boolean;
  /** True while temp files exist and the process must not exit yet. */
  readonly onAtomicWrite?: (active: boolean) => void;
}

interface Setup {
  readonly selection: Selection;
  readonly agents: readonly AgentTarget[];
  readonly notices: readonly LowConfidenceNotice[];
}

const UP_TO_DATE = 'Already up to date.';

/**
 * detect → resolve → plan → apply.
 * `--dry-run` and an up-to-date tree return before any write, including `.agentinit/`.
 */
export async function init(ctx: RunContext, logger: Logger, options: InitOptions = {}): Promise<number> {
  requireInteractiveOrYes(ctx);
  const registry = options.registryDir === undefined ? await loadRegistry() : await loadRegistry(options.registryDir);
  const prompts = prompterFor(options);
  const { root, detection, manifest } = await settleProject(ctx, registry, prompts);
  const setup = await chooseSetup(ctx, registry, detection, manifest, prompts);
  const profile = profileFor(root, detection, setup);
  const resolved = await resolveWithConflicts(
    registry,
    setup.selection,
    factsFor(detection),
    ctx.isInteractive,
    prompts,
  );
  const plan = buildPlan(profile, resolved);
  const changes = await computeChanges(root, plan, manifest);
  const notices = noticeLines(registry, detection, resolved, setup.notices);
  const nextSteps = profile.mode === 'greenfield' ? greenfieldNextSteps(profile.frameworks) : [];

  if (!hasWork(changes)) return reportUpToDate(ctx, logger, options, plan, notices);

  const applied = await applyChanges(root, changes, {
    now: options.now ?? new Date(),
    manifest: manifestBody(profile, resolved),
    yes: ctx.yes,
    force: ctx.force,
    dryRun: ctx.dryRun,
    ...(!ctx.yes && !ctx.force ? { prompter: prompts() } : {}),
    ...(options.shouldStop === undefined ? {} : { shouldStop: options.shouldStop }),
    ...(options.onAtomicWrite === undefined ? {} : { onAtomicWrite: options.onAtomicWrite }),
  });

  return reportApplied(ctx, logger, options, plan, applied.report, notices, nextSteps);
}

function prompterFor(options: InitOptions): () => Prompter {
  let current = options.prompter;
  return () => {
    current ??= createClackPrompter();
    return current;
  };
}

/**
 * A greenfield manifest still has no `package.json` after the first write.
 * Generated files are not ignorable, so `detectProject` would reject the
 * directory. Stay in greenfield until a scaffold adds `package.json`.
 */
async function settleProject(
  ctx: RunContext,
  registry: Registry,
  prompts: () => Prompter,
): Promise<{ root: string; detection: DetectionResult; manifest: Manifest | null }> {
  let root = ctx.cwd;
  let manifest = await readManifest(root);
  let detection = detectForInit(root, registry, manifest);

  if (
    ctx.isInteractive &&
    !ctx.yes &&
    detection.mode === 'existing' &&
    detection.belowGitRoot &&
    detection.gitRoot !== null
  ) {
    const choice = await confirmGitRoot(prompts(), { cwd: root, gitRoot: detection.gitRoot });
    if (choice === 'use-git-root') {
      root = detection.gitRoot;
      manifest = await readManifest(root);
      detection = detectForInit(root, registry, manifest);
    }
  }

  return { root, detection, manifest };
}

function detectForInit(root: string, registry: Registry, manifest: Manifest | null): DetectionResult {
  if (manifest?.mode === 'greenfield' && readPackageJson(root) === null) {
    return {
      mode: 'greenfield',
      gitRoot: findGitRoot(root),
      existingAgentFiles: findExistingAgentFiles(root),
    };
  }
  return detectProject(root, registry);
}

async function chooseSetup(
  ctx: RunContext,
  registry: Registry,
  detection: DetectionResult,
  manifest: Manifest | null,
  prompts: () => Prompter,
): Promise<Setup> {
  if (detection.mode === 'greenfield') {
    if (ctx.yes) {
      const rejected = nonInteractiveSelection({ kind: 'greenfield' });
      if (!isNonInteractiveSetup(rejected)) throw rejected;
    }
    const initial = manifest === null ? undefined : greenfieldInitial(manifest.selections);
    const wizard = await runGreenfieldWizard(prompts(), registry, {
      ...(ctx.agents === undefined ? {} : { agents: ctx.agents }),
      ...(initial === undefined ? {} : { initial }),
    });
    return { ...wizard, notices: [] };
  }

  const saved = manifest?.selections;
  const fromGreenfield = manifest?.mode === 'greenfield';
  const draft = saved === undefined ? detection.draft : draftWithSavedSelections(detection.draft, saved);
  const agents = agentOverride(ctx, saved);

  if (ctx.yes) {
    const selected = nonInteractiveSelection(
      { kind: 'existing', draft, belowGitRoot: detection.belowGitRoot },
      agents === undefined ? {} : { agents },
    );
    if (!isNonInteractiveSetup(selected)) throw selected;
    return { selection: selected.selection, agents: selected.agents, notices: selected.notices };
  }

  const confirmed = await confirmDetected(prompts(), draft, registry, {
    notices: detection.notices,
    warnings: detection.warnings,
    ...(agents === undefined ? {} : { agents }),
    ...(saved === undefined
      ? {}
      : {
          summary: formatSelectionChanges({
            saved,
            draft: detection.draft,
            registry,
            fromGreenfield,
          }),
          title: 'What changed',
        }),
  });
  return { ...confirmed, notices: [] };
}

function agentOverride(
  ctx: RunContext,
  saved: SavedSelections | undefined,
): readonly AgentTarget[] | undefined {
  if (ctx.agents !== undefined) return ctx.agents;
  return saved?.agents;
}

function greenfieldInitial(saved: SavedSelections): GreenfieldInitial {
  return {
    language: saved.language,
    architecture: saved.architecture,
    frameworks: saved.frameworks,
    libraries: saved.libraries,
    agents: saved.agents,
  };
}

function profileFor(root: string, detection: DetectionResult, setup: Setup): ProjectProfile {
  const language = asLanguage(setup.selection.language);
  const agents = [...setup.agents];
  if (detection.mode === 'greenfield') {
    return {
      root,
      mode: 'greenfield',
      packageManager: null,
      // No source tree yet. `src/` matches the recommended feature-based root
      // and the `{{src}}` prefix in architecture maps.
      srcDir: 'src',
      language,
      packages: {},
      scripts: {},
      frameworks: [...setup.selection.frameworks],
      libraries: [...setup.selection.libraries],
      architecture: { id: setup.selection.architecture, confidence: 1 },
      folders: [],
      agents,
      existingAgentFiles: [...detection.existingAgentFiles],
      isMonorepo: false,
    };
  }

  const draft = detection.draft;
  return {
    root: draft.root,
    mode: 'existing',
    packageManager: draft.packageManager,
    srcDir: draft.srcDir,
    language,
    packages: draft.packages,
    scripts: draft.scripts,
    frameworks: [...setup.selection.frameworks],
    libraries: [...setup.selection.libraries],
    architecture: { id: setup.selection.architecture, confidence: draft.architecture.confidence },
    folders: draft.folders,
    agents,
    existingAgentFiles: draft.existingAgentFiles,
    isMonorepo: draft.isMonorepo,
  };
}

function factsFor(detection: DetectionResult): ProjectFacts {
  if (detection.mode === 'greenfield') return { packages: {}, files: [] };
  const packages: Record<string, string | null> = { ...detection.draft.packages };
  return { packages, files: [] };
}

function manifestBody(profile: ProjectProfile, resolved: ResolvedSelection): Omit<Manifest, 'files'> {
  return {
    cliVersion: pkg.version,
    mode: profile.mode,
    selections: {
      language: profile.language,
      frameworks: [...profile.frameworks],
      libraries: [...profile.libraries],
      architecture: profile.architecture.id,
      agents: [...profile.agents],
    },
    fragments: fragmentVersions(resolved),
  };
}

function fragmentVersions(resolved: ResolvedSelection): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const fragment of resolved.fragments) {
    versions[fragment.meta.id] = fragment.meta.version;
  }
  return versions;
}

function hasWork(changes: readonly Change[]): boolean {
  return changes.some((change) => change.kind !== 'unchanged');
}

function noticeLines(
  registry: Registry,
  detection: DetectionResult,
  resolved: ResolvedSelection,
  lowConfidence: readonly LowConfidenceNotice[],
): string[] {
  const lines: string[] = [];
  if (detection.mode === 'existing') {
    for (const notice of detection.notices) lines.push(formatRegistryNotice(notice, registry));
    for (const warning of detection.warnings) lines.push(formatWarning(warning));
  }
  for (const notice of resolved.notices) lines.push(formatRegistryNotice(notice, registry));
  for (const notice of lowConfidence) lines.push(formatLowConfidence(notice, registry));
  return unique(lines);
}

function unique(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }
  return result;
}

function reportUpToDate(
  ctx: RunContext,
  logger: Logger,
  options: InitOptions,
  plan: Plan,
  notices: readonly string[],
): number {
  if (ctx.json) {
    writeStdout(options, `${JSON.stringify(reportPayload(ctx, plan, [], notices, []), null, 2)}\n`);
    return SUCCESS;
  }
  logger.info(UP_TO_DATE);
  for (const notice of notices) logger.warn(notice);
  return SUCCESS;
}

function reportApplied(
  ctx: RunContext,
  logger: Logger,
  options: InitOptions,
  plan: Plan,
  report: readonly ApplyReportEntry[],
  notices: readonly string[],
  nextSteps: readonly string[],
): number {
  const files = report.map(reportFile);
  if (ctx.json) {
    writeStdout(options, `${JSON.stringify(reportPayload(ctx, plan, files, notices, nextSteps), null, 2)}\n`);
    return SUCCESS;
  }

  const tree = formatFileTree(files);
  if (tree.length > 0) logger.info(tree);
  const over = tokenBudget(plan.warnings);
  const tokens = formatTokenLine(plan.alwaysOnTokens, over);
  if (over === undefined) logger.info(tokens);
  else logger.warn(tokens);
  if (ctx.dryRun) {
    const diffs = formatDiffs(files);
    if (diffs.length > 0) logger.info(diffs);
  }
  for (const notice of notices) logger.warn(notice);
  for (const step of nextSteps) logger.info(step);
  return SUCCESS;
}

function reportFile(entry: ApplyReportEntry): ReportFile {
  return { path: entry.path, action: entry.action, diff: entry.diff };
}

function tokenBudget(warnings: readonly PlanWarning[]): { tokens: number; limit: number } | undefined {
  const warning = warnings[0];
  if (warning === undefined) return undefined;
  return { tokens: warning.tokens, limit: warning.limit };
}

function reportPayload(
  ctx: RunContext,
  plan: Plan,
  files: readonly ReportFile[],
  notices: readonly string[],
  nextSteps: readonly string[],
): {
  upToDate: boolean;
  dryRun: boolean;
  alwaysOnTokens: number;
  warnings: readonly PlanWarning[];
  notices: readonly string[];
  nextSteps: readonly string[];
  files: readonly ReportFile[];
} {
  return {
    upToDate: !files.some((file) => file.action !== 'unchanged'),
    dryRun: ctx.dryRun,
    alwaysOnTokens: plan.alwaysOnTokens,
    warnings: plan.warnings,
    notices,
    nextSteps,
    files,
  };
}

function writeStdout(options: InitOptions, text: string): void {
  if (options.stdout === undefined) {
    throw new AgentInitError('Cannot write command output.');
  }
  options.stdout.write(text);
}

function asLanguage(value: string): Language {
  if (value === 'typescript-strict' || value === 'typescript') return value;
  throw new AgentInitError(`Unknown language "${value}".`);
}
