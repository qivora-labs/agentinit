import type { Writable } from 'node:stream';
import { requireInteractiveOrYes, type RunContext } from '../context.js';
import { detectProject, type DetectionResult } from '../detect/index.js';
import { findExistingAgentFiles } from '../detect/existing-agents.js';
import { readPackageJson } from '../detect/packages.js';
import { findGitRoot } from '../detect/workspace.js';
import { AgentInitError } from '../errors.js';
import { CANCELLED, SUCCESS } from '../exit-codes.js';
import { applyChanges, type ApplyReportEntry } from '../io/apply.js';
import { computeChanges, type Change } from '../io/changes.js';
import { readManifest, type Manifest } from '../io/manifest.js';
import { buildPlan } from '../plan/build-plan.js';
import { ALWAYS_ON_TOKEN_LIMIT } from '../plan/tokens.js';
import type { Plan, PlanWarning } from '../plan/types.js';
import { loadRegistry, type Registry } from '../registry/load.js';
import type { ProjectFacts, ResolvedSelection, Selection } from '../registry/resolve.js';
import type { AgentTarget, Language, ProjectProfile } from '../types.js';
import { underRail } from '../ui/brand.js';
import { confirmGitRoot } from '../ui/git-root.js';
import { isNonInteractiveSetup, nonInteractiveSelection } from '../ui/defaults.js';
import {
  formatLowConfidence,
  formatRegistryNotice,
  formatWarning,
  type LowConfidenceNotice,
} from '../ui/format.js';
import type { Logger } from '../ui/logger.js';
import {
  existingNextSteps,
  formatGreenfieldNextSteps,
  formatNextSteps,
  greenfieldNextSteps,
} from '../ui/next-steps.js';
import { paintFileTree } from '../ui/paint.js';
import { createClackPrompter, type PromptSpinner, type Prompter } from '../ui/prompter.js';
import {
  formatAgentReport,
  formatDiffs,
  formatFileTree,
  formatTokenLine,
  resolveReportTarget,
  type ReportEntry,
  type ReportFile,
} from '../ui/report.js';
import {
  draftWithSavedSelections,
  formatSelectionChanges,
  selectionsMatchDetection,
  type SavedSelections,
} from '../ui/saved-selection.js';
import { changeExistingSetup, confirmDetected, confirmUpToDate } from '../ui/summary.js';
import { reviewPlan } from '../ui/review.js';
import type { Theme } from '../ui/theme.js';
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
const RULES_WRITTEN = 'Rules written.';
const DONE = 'Done.';
const WROTE_THE_RULES = 'Wrote the rules';

/**
 * detect → resolve → plan → apply.
 * `--dry-run` and an up-to-date tree return before any write, including `.agentinit/`.
 */
export async function init(ctx: RunContext, logger: Logger, options: InitOptions = {}): Promise<number> {
  requireInteractiveOrYes(ctx);
  const registry = options.registryDir === undefined ? await loadRegistry() : await loadRegistry(options.registryDir);
  const prompts = prompterFor(options, logger.theme);
  const spin = canSpin(ctx, options.stdout);
  const { root, detection, manifest } = await settleProject(ctx, registry, prompts, spin);

  if (manifest !== null && canTakeUpToDateShortcut(detection, manifest)) {
    const savedSetup = setupFromManifest(ctx, detection, manifest);
    const savedPrepared = await prepareWrite(root, registry, detection, savedSetup, manifest, ctx, prompts);
    if (!hasWork(savedPrepared.changes)) {
      return handleUpToDateShortcut({
        ctx,
        logger,
        options,
        registry,
        detection,
        manifest,
        prompts,
        root,
        setup: savedSetup,
        prepared: savedPrepared,
        spin,
      });
    }
  }

  let setup = await chooseSetup(ctx, registry, detection, manifest, prompts, logger.theme);
  let prepared = await prepareWrite(root, registry, detection, setup, manifest, ctx, prompts);
  // The detection / "What changed" card already shows legacy warnings.
  const shownLegacyOnCard = ctx.isInteractive && detection.mode === 'existing';
  const notices = () =>
    noticeLines(registry, detection, prepared.resolved, setup.notices, {
      legacyWarnings: shownLegacyOnCard ? 'omit' : 'include',
    });
  const jsonNotices = () =>
    noticeLines(registry, detection, prepared.resolved, setup.notices, { legacyWarnings: 'include' });
  const greenfieldSteps = () =>
    prepared.profile.mode === 'greenfield' ? greenfieldNextSteps(prepared.profile.frameworks) : [];

  if (!hasWork(prepared.changes)) {
    return reportUpToDate(ctx, logger, options, prepared.plan, ctx.json ? jsonNotices() : notices());
  }

  if (ctx.isInteractive && !ctx.yes && !ctx.dryRun) {
    const reviewed = await runReviewLoop({
      ctx,
      logger,
      options,
      registry,
      detection,
      manifest,
      prompts,
      root,
      setup,
      prepared,
    });
    setup = reviewed.setup;
    prepared = reviewed.prepared;
    if (reviewed.kind === 'up-to-date') {
      return reportUpToDate(ctx, logger, options, prepared.plan, ctx.json ? jsonNotices() : notices());
    }
  }

  return applyPreparedWrite({
    ctx,
    logger,
    options,
    root,
    prepared,
    notices: ctx.json ? jsonNotices() : notices(),
    greenfieldSteps: greenfieldSteps(),
    prompts,
    spin,
  });
}

async function handleUpToDateShortcut(input: {
  readonly ctx: RunContext;
  readonly logger: Logger;
  readonly options: InitOptions;
  readonly registry: Registry;
  readonly detection: DetectionResult;
  readonly manifest: Manifest;
  readonly prompts: () => Prompter;
  readonly root: string;
  setup: Setup;
  prepared: PreparedWrite;
  readonly spin: boolean;
}): Promise<number> {
  const { ctx, logger, options, registry, detection, manifest, prompts, root, spin } = input;
  let { setup, prepared } = input;
  const allNotices = () =>
    noticeLines(registry, detection, prepared.resolved, setup.notices, { legacyWarnings: 'include' });

  if (!ctx.isInteractive || ctx.yes) {
    return reportUpToDate(ctx, logger, options, prepared.plan, allNotices());
  }

  for (const notice of allNotices()) logger.warn(notice);
  logger.success(formatUpToDateLine(prepared.plan, setup.agents));

  const choice = await confirmUpToDate(prompts());
  if (choice === 'done') {
    // Interactive path already printed the up-to-date line; only JSON still needs a payload.
    if (ctx.json) {
      return reportUpToDate(ctx, logger, options, prepared.plan, allNotices());
    }
    logger.close();
    return SUCCESS;
  }

  setup = await changeSetup(ctx, registry, detection, setup, prompts);
  prepared = await prepareWrite(root, registry, detection, setup, manifest, ctx, prompts);
  const notices = () =>
    noticeLines(registry, detection, prepared.resolved, setup.notices, { legacyWarnings: 'omit' });
  const greenfieldSteps = () =>
    prepared.profile.mode === 'greenfield' ? greenfieldNextSteps(prepared.profile.frameworks) : [];

  // Change setup always reaches the review card, even when nothing would write.
  if (!ctx.dryRun) {
    const reviewed = await runReviewLoop({
      ctx,
      logger,
      options,
      registry,
      detection,
      manifest,
      prompts,
      root,
      setup,
      prepared,
    });
    setup = reviewed.setup;
    prepared = reviewed.prepared;
    if (reviewed.kind === 'up-to-date') {
      return reportUpToDate(ctx, logger, options, prepared.plan, notices());
    }
  }

  if (!hasWork(prepared.changes)) {
    return reportUpToDate(ctx, logger, options, prepared.plan, notices());
  }

  return applyPreparedWrite({
    ctx,
    logger,
    options,
    root,
    prepared,
    notices: notices(),
    greenfieldSteps: greenfieldSteps(),
    prompts,
    spin,
  });
}

async function applyPreparedWrite(input: {
  readonly ctx: RunContext;
  readonly logger: Logger;
  readonly options: InitOptions;
  readonly root: string;
  readonly prepared: PreparedWrite;
  readonly notices: readonly string[];
  readonly greenfieldSteps: readonly string[];
  readonly prompts: () => Prompter;
  readonly spin: boolean;
}): Promise<number> {
  const { ctx, logger, options, root, prepared, notices, greenfieldSteps, prompts, spin } = input;
  const { profile, resolved, plan, changes } = prepared;
  const hadConflicts = needsConflictPrompt(changes);
  const writing = spin && !hadConflicts
    ? startSpin(prompts, ctx.dryRun ? 'Previewing changes' : 'Writing rules')
    : undefined;
  let applied;
  try {
    applied = await applyChanges(root, changes, {
      now: options.now ?? new Date(),
      manifest: manifestBody(profile, resolved),
      yes: ctx.yes,
      force: ctx.force,
      dryRun: ctx.dryRun,
      ...(!ctx.yes && !ctx.force ? { prompter: prompts() } : {}),
      ...(options.shouldStop === undefined ? {} : { shouldStop: options.shouldStop }),
      ...(options.onAtomicWrite === undefined ? {} : { onAtomicWrite: options.onAtomicWrite }),
    });
  } catch (error) {
    stopSpin(writing, error, ctx.dryRun ? 'Could not preview the changes' : 'Could not write the rules');
    throw error;
  }
  if (writing !== undefined) {
    writing.stop(ctx.dryRun ? 'Previewed the changes' : WROTE_THE_RULES);
  } else if (hadConflicts && !ctx.dryRun && ctx.isInteractive && logger.presented) {
    // No spinner (conflicts own the terminal, or tests capture stdout); match the success line.
    logger.success(WROTE_THE_RULES);
  }

  return reportApplied(ctx, logger, options, {
    plan,
    report: applied.report,
    notices,
    greenfieldSteps,
    agents: profile.agents,
    workflows: resolved.workflows.map((workflow) => ({
      id: workflow.meta.id,
      order: workflow.meta.order,
    })),
    mode: profile.mode,
  });
}

function canTakeUpToDateShortcut(detection: DetectionResult, manifest: Manifest): boolean {
  if (detection.mode === 'greenfield') return true;
  return selectionsMatchDetection(
    manifest.selections,
    detection.draft,
    manifest.mode === 'greenfield',
  );
}

function setupFromManifest(ctx: RunContext, detection: DetectionResult, manifest: Manifest): Setup {
  const saved = manifest.selections;
  if (detection.mode === 'greenfield') {
    return {
      selection: {
        language: saved.language,
        architecture: saved.architecture,
        frameworks: [...saved.frameworks],
        libraries: [...saved.libraries],
        origin: {},
      },
      agents: ctx.agents ?? [...saved.agents],
      notices: [],
    };
  }

  const draft = draftWithSavedSelections(detection.draft, saved);
  const agents = agentOverride(ctx, saved) ?? [...saved.agents];
  return {
    selection: {
      language: draft.language,
      architecture: draft.architecture.id,
      frameworks: [...draft.frameworks],
      libraries: [...draft.libraries],
      origin: {},
    },
    agents: [...agents],
    notices: [],
  };
}

function formatUpToDateLine(plan: Plan, agents: readonly AgentTarget[]): string {
  const files = plan.ops.length;
  const agentCount = agents.length;
  const fileWord = files === 1 ? 'file' : 'files';
  const agentWord = agentCount === 1 ? 'agent' : 'agents';
  return `Already up to date · ${String(files)} ${fileWord} for ${String(agentCount)} ${agentWord}`;
}

interface PreparedWrite {
  readonly profile: ProjectProfile;
  readonly resolved: ResolvedSelection;
  readonly plan: Plan;
  readonly changes: readonly Change[];
}

async function prepareWrite(
  root: string,
  registry: Registry,
  detection: DetectionResult,
  setup: Setup,
  manifest: Manifest | null,
  ctx: RunContext,
  prompts: () => Prompter,
): Promise<PreparedWrite> {
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
  return { profile, resolved, plan, changes };
}

type ReviewLoopResult =
  | { readonly kind: 'write'; readonly setup: Setup; readonly prepared: PreparedWrite }
  | { readonly kind: 'up-to-date'; readonly setup: Setup; readonly prepared: PreparedWrite };

async function runReviewLoop(input: {
  readonly ctx: RunContext;
  readonly logger: Logger;
  readonly options: InitOptions;
  readonly registry: Registry;
  readonly detection: DetectionResult;
  readonly manifest: Manifest | null;
  readonly prompts: () => Prompter;
  readonly root: string;
  setup: Setup;
  prepared: PreparedWrite;
}): Promise<ReviewLoopResult> {
  let { setup, prepared } = input;
  const { ctx, logger, options, registry, detection, manifest, prompts, root } = input;

  for (;;) {
    const choice = await reviewPlan(prompts(), {
      plan: prepared.plan,
      changes: prepared.changes,
      theme: logger.theme,
      tokenLimit: ALWAYS_ON_TOKEN_LIMIT,
      columns: logger.columns,
    });

    if (choice === 'write') return { kind: 'write', setup, prepared };

    if (choice === 'preview') {
      await previewChanges(root, prepared, options, logger);
      continue;
    }

    setup = await changeSetup(ctx, registry, detection, setup, prompts);
    prepared = await prepareWrite(root, registry, detection, setup, manifest, ctx, prompts);
    if (!hasWork(prepared.changes)) return { kind: 'up-to-date', setup, prepared };
  }
}

async function previewChanges(
  root: string,
  prepared: PreparedWrite,
  options: InitOptions,
  logger: Logger,
): Promise<void> {
  const { profile, resolved, changes } = prepared;
  const conflictPaths = new Set(
    changes
      .filter((change) => change.kind === 'conflict-unmanaged' || change.kind === 'conflict-edited')
      .map((change) => change.path),
  );
  // `--yes` defaults so conflicts are not prompted; the label replaces the action.
  const applied = await applyChanges(root, changes, {
    now: options.now ?? new Date(),
    manifest: manifestBody(profile, resolved),
    yes: true,
    dryRun: true,
  });
  const files = applied.report.map((entry) => ({
    path: entry.path,
    action: conflictPaths.has(entry.path) ? 'you decide next' : entry.action,
    diff: entry.diff,
  }));
  // Same framed dry-run block as printTtyReport: tree + diffs under the rail.
  const blocks: string[] = [];
  const tree = formatFileTree(files);
  if (tree.length > 0) blocks.push(paintFileTree(tree, logger.theme));
  const diffs = formatDiffs(files, logger.theme);
  if (diffs.length > 0) blocks.push(diffs);
  if (blocks.length > 0) {
    logger.info(underRail(blocks.join('\n'), logger.theme, logger.columns));
  }
}

async function changeSetup(
  ctx: RunContext,
  registry: Registry,
  detection: DetectionResult,
  current: Setup,
  prompts: () => Prompter,
): Promise<Setup> {
  if (detection.mode === 'greenfield') {
    const wizard = await runGreenfieldWizard(prompts(), registry, {
      ...(ctx.agents === undefined ? {} : { agents: ctx.agents }),
      initial: {
        language: current.selection.language,
        architecture: current.selection.architecture,
        frameworks: current.selection.frameworks,
        libraries: current.selection.libraries,
        agents: current.agents,
      },
    });
    return { ...wizard, notices: current.notices };
  }

  const agents = ctx.agents;
  const changed = await changeExistingSetup(
    prompts(),
    detection.draft,
    registry,
    { selection: current.selection, agents: current.agents },
    agents === undefined ? {} : { agents },
  );
  return { ...changed, notices: current.notices };
}

function prompterFor(options: InitOptions, theme: Theme): () => Prompter {
  let current = options.prompter;
  return () => {
    // Match logger.theme (injected stdout), not process.stdout alone.
    current ??= createClackPrompter(theme);
    return current;
  };
}

/**
 * Clack's spinner writes to the real terminal, not the injected stream.
 * A captured TTY in tests must not start it.
 */
function canSpin(ctx: RunContext, stdout: InitOptions['stdout']): boolean {
  return ctx.isInteractive && !ctx.json && stdout === process.stdout;
}

function needsConflictPrompt(changes: readonly Change[]): boolean {
  for (const change of changes) {
    if (change.kind === 'conflict-unmanaged' || change.kind === 'conflict-edited') return true;
  }
  return false;
}

function startSpin(prompts: () => Prompter, message: string): PromptSpinner {
  const spinner = prompts().spinner();
  spinner.start(message);
  return spinner;
}

function stopSpin(spinner: PromptSpinner | undefined, error: unknown, failure: string): void {
  if (spinner === undefined) return;
  if (error instanceof AgentInitError && error.exitCode === CANCELLED) {
    spinner.cancel('Interrupted.');
    return;
  }
  spinner.error(failure);
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
  spin: boolean,
): Promise<{ root: string; detection: DetectionResult; manifest: Manifest | null }> {
  let root = ctx.cwd;
  const first = await readProject(root, registry, prompts, spin);
  let manifest = first.manifest;
  let detection = first.detection;

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
      const next = await readProject(root, registry, prompts, spin);
      manifest = next.manifest;
      detection = next.detection;
    }
  }

  return { root, detection, manifest };
}

async function readProject(
  root: string,
  registry: Registry,
  prompts: () => Prompter,
  spin: boolean,
): Promise<{ detection: DetectionResult; manifest: Manifest | null }> {
  const reading = spin ? startSpin(prompts, 'Reading the project') : undefined;
  try {
    const manifest = await readManifest(root);
    const detection = detectForInit(root, registry, manifest);
    reading?.stop('Read the project');
    return { detection, manifest };
  } catch (error) {
    stopSpin(reading, error, 'Could not read the project');
    throw error;
  }
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
  theme: Theme,
): Promise<Setup> {
  if (detection.mode === 'greenfield') {
    if (ctx.yes) {
      const rejected = nonInteractiveSelection({ kind: 'greenfield' });
      if (!isNonInteractiveSetup(rejected)) throw rejected;
    }
    const initial = manifest === null ? undefined : greenfieldInitial(manifest.selections);
    // Manifest agents skip the prompt (same as `--agents`); Change setup only preselects.
    const skipAgents = ctx.agents ?? initial?.agents;
    const wizard = await runGreenfieldWizard(prompts(), registry, {
      ...(skipAgents === undefined ? {} : { agents: skipAgents }),
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
    theme,
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
            theme,
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
      name: null,
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
    name: draft.name,
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
  options: { readonly legacyWarnings: 'include' | 'omit' } = { legacyWarnings: 'include' },
): string[] {
  const lines: string[] = [];
  if (detection.mode === 'existing') {
    for (const notice of detection.notices) lines.push(formatRegistryNotice(notice, registry));
    for (const warning of detection.warnings) {
      if (options.legacyWarnings === 'omit' && warning.kind === 'legacy-agent-file') continue;
      lines.push(formatWarning(warning));
    }
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
  for (const notice of notices) logger.warn(notice);
  logger.close(UP_TO_DATE);
  return SUCCESS;
}

interface AppliedReportInput {
  readonly plan: Plan;
  readonly report: readonly ApplyReportEntry[];
  readonly notices: readonly string[];
  readonly greenfieldSteps: readonly string[];
  readonly agents: readonly AgentTarget[];
  readonly workflows: readonly { readonly id: string; readonly order: number }[];
  readonly mode: ProjectProfile['mode'];
}

function reportApplied(
  ctx: RunContext,
  logger: Logger,
  options: InitOptions,
  input: AppliedReportInput,
): number {
  const { plan, report, notices, greenfieldSteps, agents, workflows, mode } = input;
  const files = report.map(reportFile);
  if (ctx.json) {
    writeStdout(
      options,
      `${JSON.stringify(reportPayload(ctx, plan, files, notices, greenfieldSteps), null, 2)}\n`,
    );
    return SUCCESS;
  }

  if (logger.theme.tty) {
    printTtyReport(ctx, logger, plan, report, notices, greenfieldSteps, agents, workflows, mode);
    return SUCCESS;
  }

  const tree = formatFileTree(files);
  if (tree.length > 0) logger.info(paintFileTree(tree, logger.theme));
  const over = tokenBudget(plan.warnings);
  const tokens = formatTokenLine(plan.alwaysOnTokens, over);
  if (over === undefined) logger.info(tokens);
  else logger.warn(tokens);
  if (ctx.dryRun) {
    const diffs = formatDiffs(files, logger.theme);
    if (diffs.length > 0) logger.info(diffs);
  }
  for (const notice of notices) logger.warn(notice);
  for (const step of greenfieldSteps) logger.step(step);
  logger.close(ctx.dryRun ? dryRunDone(files) : RULES_WRITTEN, { ttyOnly: true });
  return SUCCESS;
}

function printTtyReport(
  ctx: RunContext,
  logger: Logger,
  plan: Plan,
  report: readonly ApplyReportEntry[],
  notices: readonly string[],
  greenfieldSteps: readonly string[],
  agents: readonly AgentTarget[],
  workflows: readonly { readonly id: string; readonly order: number }[],
  mode: ProjectProfile['mode'],
): void {
  const theme = logger.theme;
  const files = report.map(reportFile);
  const blocks: string[] = [];

  // Dry-run and preview keep the full tree; a normal write uses the grouped report.
  if (ctx.dryRun) {
    const tree = formatFileTree(files);
    if (tree.length > 0) blocks.push(paintFileTree(tree, theme));
  } else {
    const entries = reportEntries(report, plan);
    blocks.push(formatAgentReport(entries, theme, { columns: logger.columns }));
  }

  const over = tokenBudget(plan.warnings);
  const tokens = formatTokenLine(plan.alwaysOnTokens, over, {
    theme,
    limit: ALWAYS_ON_TOKEN_LIMIT,
  });
  blocks.push(tokens);

  if (ctx.dryRun) {
    const diffs = formatDiffs(files, theme);
    if (diffs.length > 0) blocks.push(diffs);
  }

  for (const notice of notices) blocks.push(theme.warn(notice));

  if (mode === 'greenfield' && greenfieldSteps.length > 0) {
    blocks.push(formatGreenfieldNextSteps(greenfieldSteps, theme));
  } else if (mode === 'existing') {
    const steps = existingNextSteps(agents, workflows);
    if (steps.length > 0) blocks.push(formatNextSteps(steps, theme));
  }

  logger.info(underRail(blocks.join('\n'), theme, logger.columns));
  logger.close(ctx.dryRun ? dryRunDone(files) : DONE, { ttyOnly: true });
}

function dryRunDone(files: readonly ReportFile[]): string {
  const count = files.filter((file) => file.action !== 'unchanged' && file.action !== 'skipped').length;
  return `Dry run · ${String(count)} files would change. Nothing written.`;
}

function reportEntries(report: readonly ApplyReportEntry[], plan: Plan): ReportEntry[] {
  const targetsByPath = new Map<string, AgentTarget | 'shared'>();
  for (const op of plan.ops) targetsByPath.set(op.path, op.target);
  return report.map((entry) => ({
    path: entry.path,
    action: entry.action,
    target: resolveReportTarget(entry.path, targetsByPath),
  }));
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
