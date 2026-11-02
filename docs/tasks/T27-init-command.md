# T27 · `init` Command End to End

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M5 — Safe IO & Doctor | T19, T21, T22, T23, T24, T26 | T29, T30, T31 | §3.2–§3.5, §4.1, §6 | L |

## Goal
Wire detection, UI, resolution, planning, and apply into a working `init`, including idempotent re-runs.

## Context
- PRD §3.4 defines re-run behavior; §3.2 step 7 the greenfield "next step" hint.
- All building blocks exist; this task is orchestration, reporting, and end-to-end tests.

## Scope
`src/commands/init.ts`:
1. Build `RunContext`; load the registry; read the manifest (if any).
2. Detect the project.
3. Get a `Selection`:
   - Interactive: greenfield wizard or detection summary. With a manifest, its selections are the defaults and the summary shows only **what changed** (new/removed packages, version changes, layout changes).
   - `--yes`: `nonInteractiveSelection`, with manifest selections taking precedence over fresh suggestions where they don't conflict with detection.
   - A greenfield manifest + a now-existing `package.json` → existing mode, keeping architecture and agents.
4. `resolveSelection` (+ conflict prompt), build the profile, `buildPlan`, `computeChanges`.
5. Nothing to do → print "Already up to date." and exit `0` without writing.
6. `--dry-run`: print the planned tree and diffs (or JSON with `--json`) and exit `0`.
7. Apply; print the report as a file tree, the always-on token estimate (+ warning if over budget), notices (unsupported versions, legacy files), and next steps (greenfield: the framework generator command for the selected framework and a reminder to re-run).

## Out of scope
- `doctor` (T28) and v0.2 commands.

## Implementation notes
- Keep `init.ts` as orchestration only; any logic that grows beyond a few lines belongs in the module that owns it.
- End-to-end tests copy a fixture into a temp dir and call `run(['init', '--yes', '--cwd', dir])`.

## Acceptance criteria
- [x] `init --yes` on `next15-src` writes the expected tree for all four agents (snapshot of paths + contents).
- [x] Running it a second time writes nothing and prints "Already up to date."
- [x] Adding a supported package to the fixture and re-running adds only the new fragment's files.
- [x] `init --yes --dry-run` writes nothing (including `.agentinit/`) and prints diffs; `--json` output parses.
- [x] Greenfield `init --yes` exits `1`; interactive greenfield (fake prompter) writes rules + `ARCHITECTURE.md` and prints the generator hint.
- [x] Greenfield manifest followed by a scaffolded `package.json` switches to existing mode without re-asking architecture or agents.
- [x] `--agents cursor` writes only shared + Cursor files; switching to `--agents claude` deletes unedited Cursor files.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
cp -r tests/fixtures/next15-src /tmp/ai-demo && node dist/cli.js init --yes --cwd /tmp/ai-demo
node dist/cli.js init --yes --cwd /tmp/ai-demo   # expect "Already up to date."
```

## Commit
`feat(cli): implement init with idempotent re-runs`

## Notes
- Saved selections replace fresh suggestions only where detection does not contradict them. Language, architecture, and agents stay as saved (`--agents` still wins). Framework and library membership follows detection, so a new package is added and a removed package is dropped. Saved architecture is given confidence `1` so a later `--yes` run does not replace it with `flat`.
- The manifest does not store package versions or layout. A re-run summary lists added and removed framework and library ids. Layout is included only when a greenfield manifest meets a new `package.json`. Version changes are not shown. The summary also includes unsupported-version notices and legacy-file warnings. An up-to-date re-run still prints those lines, including on `--json` `notices`.
- With a manifest, agent selection is not asked again, including a greenfield re-run. `--agents` replaces that list.
- A greenfield manifest and no `package.json` stays greenfield even after rules exist, because those files are not ignorable and `detectProject` would otherwise reject the directory. `--yes` on greenfield still exits `1`.
- `--json` writes the init report to stdout (dry-run and a real run). The logger sends other init text to stderr in json mode.
- `fragments` in the manifest records resolved rule fragments. Workflows are not selections; their files are still hashed.
- Greenfield has no package manager yet, so generator hints use pnpm, as in PRD §3.2. Express uses `npx express-generator`. `next15-src` only has `src/app`, so layout inference is `flat` with confidence above `0.7`, and `--yes` keeps that inference.
