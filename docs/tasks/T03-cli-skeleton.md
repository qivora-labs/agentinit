# T03 · CLI Skeleton, Types, Errors

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M1 — Foundation | T01 | T04, T14–T17, T25 | §3.1, §3.5, §4.2, §4.3 | M |

## Goal
A testable CLI shell: commands `init`, `list`, and `doctor` are routed, global flags are parsed and validated, exit codes are consistent, and user-facing errors are readable.

## Context
- Read PRD §3.1 (commands, flags, exit codes) and §4.3 (types).
- Commands are stubs in this task; later tasks implement them.

## Scope
- `src/types.ts`: the types from PRD §4.3, exactly.
- `src/exit-codes.ts`: `SUCCESS = 0`, `ERROR = 1`, `DOCTOR_ISSUES = 2`, `CANCELLED = 130`.
- `src/errors.ts`: `AgentInitError` (`message`, `exitCode`, optional `hint`), plus `UnsupportedProjectError` and `NotInteractiveError` subclasses.
- `src/context.ts`: `RunContext` — `cwd` (absolute), `yes`, `dryRun`, `agents` (`AgentTarget[] | undefined`), `force`, `json`, `isInteractive` (`stdin.isTTY && stdout.isTTY && !yes`). Helper `requireInteractiveOrYes(ctx)` throws `NotInteractiveError` with a hint to pass `--yes`.
- `src/main.ts`: `run(argv: string[], io: { stdout, stderr, stdin }): Promise<number>` — parses with `cac`, builds `RunContext`, dispatches, maps errors to exit codes. Returns the exit code instead of calling `process.exit` (testable).
- `src/cli.ts`: shebang, calls `run(process.argv)`, sets `process.exitCode`. Handles `SIGINT` → exit code `130`.
- `src/commands/{init,list,doctor}.ts`: stubs that print "not implemented yet" and return `ERROR`.
- `src/ui/logger.ts`: `info`, `success`, `warn`, `error`, `step` with `picocolors`. In `--json` mode, human-readable logs go to stderr so stdout stays machine-readable.
- `src/ui/prompter.ts`: `Prompter` interface (`select`, `multiselect`, `confirm`, `note`, `spinner`), a `@clack/prompts` implementation, and a scripted fake (`createFakePrompter(answers)`) for tests. Cancelling (`isCancel`) throws `AgentInitError` with exit code `130`. Later tasks (T19, T26) use this interface; nothing prompts in this task.
- Flag validation: `--agents` accepts only `cursor,claude,windsurf,copilot` (comma-separated, deduplicated); unknown values → `AgentInitError` listing valid values. `--cwd` must exist and be a directory.
- Unknown errors: print a one-line message plus "This is a bug — please report it", and print the stack only when `DEBUG=agentinit`.

## Out of scope
- Any detection, registry, or file writing.
- Real prompt flows such as the wizard (T19) and conflict questions (T26).

## Implementation notes
- Keep `cli.ts` tiny; all logic lives in `main.ts` so tests call `run()` directly with fake streams.
- `cac` handles `--help` and `--version`; make sure `--version` still prints the version from T01.

## Acceptance criteria
- [x] `run(['--version'])` prints `0.0.0` and returns `0`.
- [x] `run(['--help'])` lists `init`, `list`, `doctor` and all global flags from PRD §3.1.
- [x] `run(['init', '--agents', 'cursor,foo'])` returns `1` and the message lists valid agents.
- [x] `run(['init', '--cwd', '/does/not/exist'])` returns `1` with a readable message.
- [x] `requireInteractiveOrYes` throws `NotInteractiveError` when not a TTY and `--yes` is absent.
- [x] An unexpected thrown `Error` returns `1` without a stack trace unless `DEBUG=agentinit`.
- [x] The fake prompter returns scripted answers in order and throws the cancel error when scripted to cancel.
- [x] `node dist/cli.js list` (built) prints the stub message and exits `1`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js --help
node dist/cli.js init --agents cursor,foo; echo "exit=$?"
```

## Commit
`feat(cli): add command routing, global flags, and error handling`

## Notes
- Parsing lives in `src/main.ts`. PRD §4.2's folder sketch still says `cli.ts` parses arguments; `ARCHITECTURE.md` and this task put that in `main.ts`. `cli.ts` only calls `run(process.argv)`, sets `process.exitCode`, and maps `SIGINT` to `130`. The PRD sketch was not changed.
- `cac` registers `--version` and shows it in help. Its own version line includes the runtime (`agentinit/0.0.0 darwin-arm64 node-v22...`). `run()` prints only the inlined package version so `--version` stays `0.0.0`, matching T01.
- A bare invocation (`agentinit` with no command) is routed to `init`, as in PRD §3.1. The stub still prints "not implemented yet" and returns `1`.
- `--cwd` is checked with `stat` in `main.ts` before dispatch. `context.ts` stays free of disk access. `ARCHITECTURE.md` allows that `stat` only. Filesystem errors from `stat` (`ENOENT`, `ENOTDIR`, and any other `code`, including `EACCES` and `ELOOP`) are user-facing `AgentInitError`s, so a bad path never prints the bug line. A path nested under a file is `ENOTDIR` on POSIX and `ENOENT` on Windows; parent paths are `stat`ed so both report "Not a directory".
- Command stubs do not call `requireInteractiveOrYes`. `list` and `doctor` must keep working when stdin is not a terminal. Later commands call the guard when they actually prompt.
- Logger streams: `info`, `success`, and `step` go to stdout; `warn` and `error` go to stderr. With `--json`, every human-readable line goes to stderr. Colors follow the destination stream's TTY, via `picocolors` `createColors`. `@types/node` does not put `isTTY` on `Readable`/`Writable`, so the check uses `'isTTY' in stream`.
- `--agents` is split on commas, trimmed, and deduped in first-seen order. Unknown names produce an `AgentInitError` whose message lists `cursor, claude, windsurf, copilot`.
- Unexpected throws print one line plus "This is a bug — please report it". The stack is written only when `process.env.DEBUG === 'agentinit'` (exact match). `AgentInitError`, including cac's `CACError` mapped onto it, never prints a stack.
- `createFakePrompter` takes tagged answers (`select`, `multiselect`, `confirm`, `cancel`) so a later script cannot consume a confirm as a select. Cancel rejects with `AgentInitError` and exit code `130`, same as clack's `isCancel`.
- A minor changeset records the command shell for the changelog. It does not publish.
