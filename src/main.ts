import { cac, type CAC, type Command } from 'cac';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { doctor } from './commands/doctor.js';
import { init } from './commands/init.js';
import { list, type ListOptions } from './commands/list.js';
import type { Prompter } from './ui/prompter.js';
import { AGENT_TARGETS, createRunContext, parseAgents, type RunContext } from './context.js';
import { AgentInitError } from './errors.js';
import { ERROR, SUCCESS } from './exit-codes.js';
import { createLogger, type Logger } from './ui/logger.js';
// Inlined by tsdown. Reading package.json from disk would miss the packed binary.
import pkg from '../package.json' with { type: 'json' };

export interface CommandIo {
  stdout: Writable;
  stderr: Writable;
  stdin: Readable;
}

const BUG_REPORT_LINE = 'This is a bug — please report it';

const defaultIo: CommandIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
};

export interface RunOptions {
  /** Interactive tests inject a scripted prompter. The default is Clack. */
  readonly prompter?: Prompter;
  /** Backup timestamps. Tests pass a fixed clock. */
  readonly now?: Date;
  /** When true before rename, `init` deletes temp files and writes nothing. */
  readonly shouldStop?: () => boolean;
  /** True while temp files exist and the process must not exit yet. */
  readonly onAtomicWrite?: (active: boolean) => void;
}

export async function run(argv: string[], io: CommandIo = defaultIo, options: RunOptions = {}): Promise<number> {
  let json = false;
  try {
    const cli = createCli();
    const parsed = cli.parse(toCacArgv(argv), { run: false });
    json = parsed.options.json === true;

    if (parsed.options.help === true) {
      printHelp(cli, io.stdout);
      return SUCCESS;
    }
    if (parsed.options.version === true && cli.matchedCommand === undefined) {
      io.stdout.write(`${pkg.version}\n`);
      return SUCCESS;
    }
    if (cli.matchedCommand === undefined && cli.args[0] !== undefined) {
      throw new AgentInitError(`Unknown command "${cli.args[0]}".`);
    }

    assertKnownOptions(cli.matchedCommand ?? cli.globalCommand);
    const ctx = await buildContext(parsed.options, io);
    json = ctx.json;
    const commandName = cli.matchedCommand?.name ?? 'init';
    return await dispatch(commandName, ctx, createLogger(io, ctx.json), {
      stdout: io.stdout,
      category: commandName === 'list' ? readCategoryFlag(parsed.options.category) : undefined,
      prompter: options.prompter,
      now: options.now,
      shouldStop: options.shouldStop,
      onAtomicWrite: options.onAtomicWrite,
    });
  } catch (error) {
    return reportError(error, io, json);
  }
}

function createCli(): CAC {
  const cli = cac('agentinit');
  cli.usage('[command] [options]');
  cli.option('-y, --yes', 'Never prompt; use non-interactive defaults');
  cli.option('--dry-run', 'Print the planned file tree and diffs without writing');
  cli.option('--agents <list>', `Comma-separated agents: ${AGENT_TARGETS.join(', ')}`);
  cli.option('--cwd <path>', 'Run against another directory');
  cli.option('--force', 'Replace unmanaged and edited files after backing them up');
  cli.option('--json', 'Machine-readable output for list, doctor, and dry-run');
  cli.command('init', 'Bootstrap agent rules for this project');
  cli
    .command('list', 'Browse available fragments')
    .option('--category <name>', 'Only show fragments in one category');
  cli.command('doctor', 'Check that generated rules match the project');
  cli.help();
  cli.version(pkg.version);
  // Help and version are printed by run() so tests can capture the streams.
  cli.showHelpOnExit = false;
  cli.showVersionOnExit = false;
  return cli;
}

function toCacArgv(argv: readonly string[]): string[] {
  // cac drops argv[0] and argv[1] (the node binary and the script).
  if (isProcessArgv(argv)) return [...argv];
  return ['node', 'agentinit', ...argv];
}

function isProcessArgv(argv: readonly string[]): boolean {
  const executable = argv[0];
  if (executable === undefined || executable.startsWith('-')) return false;
  const base = path.basename(executable).toLowerCase();
  return base === 'node' || base === 'node.exe';
}

function assertKnownOptions(command: Command): void {
  try {
    command.checkUnknownOptions();
    command.checkOptionValue();
    command.checkRequiredArgs();
    command.checkUnusedArgs();
  } catch (error) {
    if (error instanceof Error && error.name === 'CACError') {
      throw new AgentInitError(error.message);
    }
    throw error;
  }
}

async function buildContext(options: CAC['options'], io: CommandIo): Promise<RunContext> {
  return createRunContext({
    cwd: await resolveCwd(options.cwd),
    yes: options.yes === true,
    dryRun: options.dryRun === true,
    agents: readAgents(options.agents),
    force: options.force === true,
    json: options.json === true,
    stdinIsTTY: isTerminal(io.stdin),
    stdoutIsTTY: isTerminal(io.stdout),
  });
}

async function resolveCwd(value: unknown): Promise<string> {
  if (value === undefined) return path.resolve(process.cwd());
  if (typeof value !== 'string' || value.length === 0) {
    throw new AgentInitError('Flag --cwd requires a directory path.');
  }
  const resolved = path.resolve(value);
  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      throw new AgentInitError(notADirectory(resolved));
    }
    return resolved;
  } catch (error) {
    if (error instanceof AgentInitError) throw error;
    const code = nodeErrorCode(error);
    // A user path can fail stat for reasons other than a missing leaf
    // (ENOTDIR, EACCES, ELOOP). Those are input errors, not defects.
    if (code !== undefined) throw new AgentInitError(await cwdStatMessage(code, resolved));
    throw error;
  }
}

async function cwdStatMessage(code: string, resolved: string): Promise<string> {
  // Windows reports ENOENT when an ancestor is a file. POSIX reports ENOTDIR
  // for that path, so walk parents and use the same message on both.
  if (code === 'ENOENT' && (await ancestorIsFile(resolved))) return notADirectory(resolved);
  if (code === 'ENOENT') return `Directory not found: ${resolved}`;
  if (code === 'ENOTDIR') return notADirectory(resolved);
  return `Cannot access directory: ${resolved}`;
}

function notADirectory(resolved: string): string {
  return `Not a directory: ${resolved}`;
}

async function ancestorIsFile(resolved: string): Promise<boolean> {
  let parent = path.dirname(resolved);
  while (parent !== resolved) {
    try {
      const info = await stat(parent);
      return !info.isDirectory();
    } catch (error) {
      const code = nodeErrorCode(error);
      if (code === 'ENOTDIR') return true;
      if (code !== 'ENOENT') return false;
    }
    resolved = parent;
    parent = path.dirname(parent);
  }
  return false;
}

function readAgents(value: unknown): RunContext['agents'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new AgentInitError(
      `Flag --agents requires a comma-separated list. Valid values: ${AGENT_TARGETS.join(', ')}.`,
    );
  }
  return parseAgents(value);
}

async function dispatch(
  name: string,
  ctx: RunContext,
  logger: Logger,
  io: {
    stdout: CommandIo['stdout'];
    category: string | undefined;
    prompter: Prompter | undefined;
    now: Date | undefined;
    shouldStop: (() => boolean) | undefined;
    onAtomicWrite: ((active: boolean) => void) | undefined;
  },
): Promise<number> {
  switch (name) {
    case 'init':
      return await init(ctx, logger, {
        stdout: io.stdout,
        ...(io.prompter === undefined ? {} : { prompter: io.prompter }),
        ...(io.now === undefined ? {} : { now: io.now }),
        ...(io.shouldStop === undefined ? {} : { shouldStop: io.shouldStop }),
        ...(io.onAtomicWrite === undefined ? {} : { onAtomicWrite: io.onAtomicWrite }),
      });
    case 'list':
      return await list(ctx, logger, listOptions(io));
    case 'doctor':
      return await doctor(ctx, logger, { stdout: io.stdout });
    default:
      throw new AgentInitError(`Unknown command "${name}".`);
  }
}

function listOptions(io: { stdout: CommandIo['stdout']; category: string | undefined }): ListOptions {
  const options: ListOptions = { stdout: io.stdout };
  if (io.category !== undefined) options.category = io.category;
  return options;
}

function readCategoryFlag(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new AgentInitError('Flag --category requires a category name.');
  }
  return value;
}

function printHelp(cli: CAC, stdout: Writable): void {
  const original = console.info;
  console.info = (...args: unknown[]) => {
    stdout.write(`${args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ')}\n`);
  };
  try {
    cli.outputHelp();
  } finally {
    console.info = original;
  }
}

function reportError(error: unknown, io: CommandIo, json: boolean): number {
  const logger = createLogger(io, json);
  if (error instanceof AgentInitError) {
    logger.error(error.message);
    if (error.hint !== undefined) logger.error(error.hint);
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : 'Unexpected failure';
  logger.error(message);
  logger.error(BUG_REPORT_LINE);
  if (process.env.DEBUG === 'agentinit' && error instanceof Error && error.stack !== undefined) {
    io.stderr.write(`${error.stack}\n`);
  }
  return ERROR;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function isTerminal(stream: object): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}
