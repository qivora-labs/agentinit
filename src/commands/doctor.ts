import type { Writable } from 'node:stream';
import type { RunContext } from '../context.js';
import { detectProject, type DetectionResult } from '../detect/index.js';
import { findExistingAgentFiles, findLegacyFiles } from '../detect/existing-agents.js';
import { readPackageJson, resolveVersions } from '../detect/packages.js';
import { findGitRoot } from '../detect/workspace.js';
import {
  collectDoctorIssues,
  countBySeverity,
  doctorChecklist,
  doctorReport,
  formatDoctorReport,
  issuesFoundMessage,
  NO_ISSUES,
  type CheckedFragment,
  type DoctorIssue,
  type DriftChange,
  type NamedFragment,
} from '../doctor/checks.js';
import { AgentInitError } from '../errors.js';
import { DOCTOR_ISSUES, SUCCESS } from '../exit-codes.js';
import { computeChanges, readProjectText, type Change } from '../io/changes.js';
import { findBlocks } from '../io/managed-block.js';
import { readManifest, type Manifest } from '../io/manifest.js';
import { buildPlan } from '../plan/build-plan.js';
import { loadRegistry, type Registry } from '../registry/load.js';
import {
  resolveSelection,
  type ProjectFacts,
  type ResolvedSelection,
  type Selection,
} from '../registry/resolve.js';
import type { ProjectProfile } from '../types.js';
import { underRail } from '../ui/brand.js';
import type { Logger } from '../ui/logger.js';
import { paintDoctorChecks, paintDoctorReport } from '../ui/paint.js';
// Inlined by tsdown — same source `init` uses for the manifest `cliVersion`.
import pkg from '../../package.json' with { type: 'json' };

export interface DoctorOptions {
  readonly stdout?: Writable;
  readonly registryDir?: string;
}

/**
 * detect → resolve → plan → read-only `computeChanges`.
 * Never writes, including when the manifest is absent.
 * `--agents` is ignored: the manifest is the saved selection.
 */
export async function doctor(ctx: RunContext, logger: Logger, options: DoctorOptions = {}): Promise<number> {
  const registry = options.registryDir === undefined ? await loadRegistry() : await loadRegistry(options.registryDir);
  const root = ctx.cwd;
  const manifest = await readManifest(root);
  const issues =
    manifest === null
      ? collectDoctorIssues(uninitializedInput(root, registry))
      : await issuesForManifest(root, registry, manifest);

  const report = doctorReport(issues);
  const { errors, warnings } = countBySeverity(issues);
  if (ctx.json) writeStdout(options, `${JSON.stringify(report, null, 2)}\n`);
  else if (logger.theme.tty) {
    const checks = doctorChecklist(issues);
    logger.info(underRail(paintDoctorChecks(checks, logger.theme), logger.theme, logger.columns));
    if (errors === 0 && warnings === 0) logger.close(NO_ISSUES);
    else if (errors === 0) logger.close(issuesFoundMessage(errors, warnings), { tone: 'warn' });
    else logger.close(issuesFoundMessage(errors, warnings), { tone: 'error' });
  } else if (errors === 0 && warnings === 0) {
    logger.close(NO_ISSUES);
  } else {
    logger.info(paintDoctorReport(formatDoctorReport(issues), logger.theme));
    logger.close();
  }
  return report.ok ? SUCCESS : DOCTOR_ISSUES;
}

/**
 * Validate the directory before reporting "Not initialized", so an unsupported
 * project still exits `1`. Other checks need a saved selection.
 */
function uninitializedInput(root: string, registry: Registry) {
  detectProject(root, registry);
  return {
    initialized: false as const,
    changes: [],
    unselected: [],
    fragments: [],
    packages: {},
    warnings: [],
    legacyFiles: [],
    cliVersions: { running: pkg.version, manifest: pkg.version },
  };
}

async function issuesForManifest(root: string, registry: Registry, manifest: Manifest): Promise<DoctorIssue[]> {
  const detection = detectForDoctor(root, registry, manifest);
  const selection = selectionFrom(manifest);
  const resolved = resolveSelection(registry, selection, factsFor(detection));
  const plan = buildPlan(profileFor(root, detection, manifest), resolved, {
    includeWorkflows: manifest.selections.workflows,
  });
  const changes = await driftChanges(root, await computeChanges(root, plan, manifest));
  const existing = detection.mode === 'existing';
  return collectDoctorIssues({
    initialized: true,
    changes,
    unselected: existing ? unselectedFragments(registry, detection, manifest) : [],
    fragments: existing ? checkedFragments(resolved) : [],
    packages: existing ? installedPackages(root) : {},
    warnings: plan.warnings,
    legacyFiles: findLegacyFiles(root),
    cliVersions: { running: pkg.version, manifest: manifest.cliVersion },
  });
}

/**
 * A greenfield manifest still has no `package.json` after the first write.
 * Generated files are not ignorable, so `detectProject` would reject the directory.
 */
function detectForDoctor(root: string, registry: Registry, manifest: Manifest): DetectionResult {
  if (manifest.mode === 'greenfield' && readPackageJson(root) === null) {
    return {
      mode: 'greenfield',
      gitRoot: findGitRoot(root),
      existingAgentFiles: findExistingAgentFiles(root),
    };
  }
  return detectProject(root, registry);
}

function selectionFrom(manifest: Manifest): Selection {
  const selections = manifest.selections;
  return {
    language: selections.language,
    architecture: selections.architecture,
    frameworks: [...selections.frameworks],
    libraries: [...selections.libraries],
    origin: {},
  };
}

function profileFor(root: string, detection: DetectionResult, manifest: Manifest): ProjectProfile {
  const selections = manifest.selections;
  const frameworks = [...selections.frameworks];
  const libraries = [...selections.libraries];
  const agents = [...selections.agents];
  if (detection.mode === 'greenfield') {
    return {
      root,
      mode: 'greenfield',
      name: null,
      packageManager: null,
      srcDir: 'src',
      language: selections.language,
      packages: {},
      scripts: {},
      frameworks,
      libraries,
      architecture: { id: selections.architecture, confidence: 1 },
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
    language: selections.language,
    packages: draft.packages,
    scripts: draft.scripts,
    frameworks,
    libraries,
    architecture: { id: selections.architecture, confidence: draft.architecture.confidence },
    folders: draft.folders,
    agents,
    existingAgentFiles: draft.existingAgentFiles,
    isMonorepo: draft.isMonorepo,
  };
}

function factsFor(detection: DetectionResult): ProjectFacts {
  if (detection.mode === 'greenfield') return { packages: {}, files: [] };
  return { packages: { ...detection.draft.packages }, files: [] };
}

function installedPackages(root: string): Record<string, string | null> {
  const pkg = readPackageJson(root);
  if (pkg === null) return {};
  return resolveVersions(root, pkg);
}

function unselectedFragments(registry: Registry, detection: DetectionResult, manifest: Manifest): NamedFragment[] {
  if (detection.mode !== 'existing') return [];
  const selected = new Set([...manifest.selections.frameworks, ...manifest.selections.libraries]);
  const excluded = new Set(manifest.selections.excluded);
  const detected = [...detection.draft.frameworks, ...detection.draft.libraries];
  const fragments: NamedFragment[] = [];
  for (const id of detected) {
    if (selected.has(id) || excluded.has(id)) continue;
    const meta = registry.byId.get(id)?.meta;
    fragments.push({ id, name: meta?.name ?? id });
  }
  return fragments;
}

/**
 * Package checks follow the fragments `buildPlan` compiles. A `requires`
 * dependency is included even when the manifest selection does not list it.
 */
function checkedFragments(resolved: ResolvedSelection): CheckedFragment[] {
  const checked: CheckedFragment[] = [];
  for (const fragment of resolved.fragments) {
    const meta = fragment.meta;
    if (meta.category !== 'framework' && meta.category !== 'library') continue;
    checked.push({
      id: meta.id,
      name: meta.name,
      packages: meta.detect?.packages ?? [],
      appliesTo: meta.appliesTo ?? {},
    });
  }
  return checked;
}

async function driftChanges(root: string, changes: readonly Change[]): Promise<DriftChange[]> {
  const drifted: DriftChange[] = [];
  for (const change of changes) {
    const blockMissing = await isMissingBlock(root, change);
    drifted.push({
      kind: change.kind,
      path: change.path,
      ...(change.blockId === undefined ? {} : { blockId: change.blockId }),
      ...(blockMissing ? { blockMissing: true } : {}),
    });
  }
  return drifted;
}

/**
 * `computeChanges` reports a removed owned block as `conflict-edited`.
 * The file is still there; the block id is not.
 */
async function isMissingBlock(root: string, change: Change): Promise<boolean> {
  if (change.kind !== 'conflict-edited' || change.blockId === undefined) return false;
  const text = await readProjectText(root, change.path);
  if (text === null) return true;
  return !findBlocks(text, change.path).some((block) => block.id === change.blockId);
}

function writeStdout(options: DoctorOptions, text: string): void {
  if (options.stdout === undefined) {
    throw new AgentInitError('Cannot write command output.');
  }
  options.stdout.write(text);
}
