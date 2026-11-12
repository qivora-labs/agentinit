import type { Writable } from 'node:stream';
import { assessCliCompat, cliCompatNotice } from '../cli-compat.js';
import { requireInteractiveOrYes, type RunContext } from '../context.js';
import { INIT_FIX } from '../doctor/checks.js';
import { AgentInitError } from '../errors.js';
import { SUCCESS } from '../exit-codes.js';
import { applyRemoveAll, type ApplyReportEntry } from '../io/apply.js';
import { computeRemoveChanges } from '../io/changes.js';
import { readManifest } from '../io/manifest.js';
import type { Logger } from '../ui/logger.js';
import { paintFileTree } from '../ui/paint.js';
import { createClackPrompter, type Prompter } from '../ui/prompter.js';
import { formatDiffs, formatFileTree, type ReportFile } from '../ui/report.js';
import pkg from '../../package.json' with { type: 'json' };

export interface RemoveOptions {
  readonly all?: boolean;
  readonly ids?: readonly string[];
  readonly prompter?: Prompter;
  readonly stdout?: Writable;
  readonly now?: Date;
  /** Fixed backup folder suffix for tests (see `ApplyOptions.backupSuffix`). */
  readonly backupSuffix?: string;
  readonly shouldStop?: () => boolean;
  readonly onAtomicWrite?: (active: boolean) => void;
}

const REMOVED = 'Removed agentinit files.';
const ONLY_ALL = 'Only `remove --all` is available in this version.';

/**
 * Tear down every owned file and managed block. v0.1 only supports `--all`;
 * per-id remove is v0.3.
 */
export async function remove(ctx: RunContext, logger: Logger, options: RemoveOptions = {}): Promise<number> {
  requireInteractiveOrYes(ctx);
  if (options.all !== true) {
    throw new AgentInitError(ONLY_ALL);
  }
  if (options.ids !== undefined && options.ids.length > 0) {
    throw new AgentInitError(ONLY_ALL);
  }

  const root = ctx.cwd;
  const manifest = await readManifest(root);
  if (manifest === null) {
    throw new AgentInitError('Not initialized.', { hint: INIT_FIX });
  }

  const compat = assessCliCompat(pkg.version, manifest.cliVersion);
  if (compat.kind === 'behind' && !ctx.force) {
    // Still emit the version notice before exiting so mixed-version CI logs stay consistent.
    logger.warn(compat.notice);
    throw new AgentInitError(compat.message);
  }
  const versionNotice = cliCompatNotice(compat);
  const notices = versionNotice === undefined ? [] : [versionNotice];

  const changes = await computeRemoveChanges(root, manifest);
  const applied = await applyRemoveAll(root, changes, {
    now: options.now ?? new Date(),
    ...(options.backupSuffix === undefined ? {} : { backupSuffix: options.backupSuffix }),
    yes: ctx.yes,
    force: ctx.force,
    dryRun: ctx.dryRun,
    ...(!ctx.yes && !ctx.force ? { prompter: prompterFor(options, logger) } : {}),
    ...(options.shouldStop === undefined ? {} : { shouldStop: options.shouldStop }),
    ...(options.onAtomicWrite === undefined ? {} : { onAtomicWrite: options.onAtomicWrite }),
  });

  return reportRemove(ctx, logger, options, applied.report, applied.backupsPath, notices);
}

function reportRemove(
  ctx: RunContext,
  logger: Logger,
  options: RemoveOptions,
  report: readonly ApplyReportEntry[],
  backupsPath: string | undefined,
  notices: readonly string[],
): number {
  const files = report.map(reportFile);
  if (ctx.json) {
    writeStdout(
      options,
      `${JSON.stringify({ files, dryRun: ctx.dryRun, backupsPath: backupsPath ?? null, notices }, null, 2)}\n`,
    );
    return SUCCESS;
  }

  for (const notice of notices) logger.warn(notice);
  const tree = formatFileTree(files);
  if (tree.length > 0) logger.info(paintFileTree(tree, logger.theme));
  if (ctx.dryRun) {
    const diffs = formatDiffs(files, logger.theme);
    if (diffs.length > 0) logger.info(diffs);
  }
  for (const entry of report) {
    if (entry.action === 'skipped') {
      logger.warn(`Kept ${entry.blockId === undefined ? entry.path : `the agentinit section of ${entry.path}`} (edited).`);
    }
  }
  if (backupsPath !== undefined) {
    logger.info(`Kept backups at ${backupsPath}`);
  }
  logger.close(ctx.dryRun ? dryRunDone(files) : REMOVED, { ttyOnly: true });
  return SUCCESS;
}

function reportFile(entry: ApplyReportEntry): ReportFile {
  return {
    path: entry.path,
    action: entry.action,
    diff: entry.diff,
    ...(entry.blockId === undefined ? {} : { blockId: entry.blockId }),
  };
}

function dryRunDone(files: readonly ReportFile[]): string {
  const count = files.filter((file) => file.action !== 'unchanged' && file.action !== 'skipped').length;
  const noun = count === 1 ? 'change' : 'changes';
  return `Would apply ${String(count)} ${noun}.`;
}

function prompterFor(options: RemoveOptions, logger: Logger): Prompter {
  if (options.prompter !== undefined) return options.prompter;
  return createClackPrompter(logger.theme);
}

function writeStdout(options: RemoveOptions, text: string): void {
  if (options.stdout === undefined) {
    throw new AgentInitError('Cannot write command output.');
  }
  options.stdout.write(text);
}
