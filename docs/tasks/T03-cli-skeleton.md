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
- [ ] `run(['--version'])` prints `0.0.0` and returns `0`.
- [ ] `run(['--help'])` lists `init`, `list`, `doctor` and all global flags from PRD §3.1.
- [ ] `run(['init', '--agents', 'cursor,foo'])` returns `1` and the message lists valid agents.
- [ ] `run(['init', '--cwd', '/does/not/exist'])` returns `1` with a readable message.
- [ ] `requireInteractiveOrYes` throws `NotInteractiveError` when not a TTY and `--yes` is absent.
- [ ] An unexpected thrown `Error` returns `1` without a stack trace unless `DEBUG=agentinit`.
- [ ] The fake prompter returns scripted answers in order and throws the cancel error when scripted to cancel.
- [ ] `node dist/cli.js list` (built) prints the stub message and exits `1`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js --help
node dist/cli.js init --agents cursor,foo; echo "exit=$?"
```

## Commit
`feat(cli): add command routing, global flags, and error handling`

## Notes
_Record decisions and discovered gaps here._
