# T39 · Conflict Prompt & Dry-Run Display

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T35 | T40 | §3.1 (`--dry-run`), §6.3 | M |

## Goal
Make diffs readable: colored, without header noise, only where something already exists, and with plain-language file names.

## Context
- The conflict note for `CLAUDE.md` shows a raw unified diff: `Index:`, a row of `=`, `---`, `+++`, no color, and two trailing blank lines. The question names the file `CLAUDE.md#claude` and says "not managed by AgentInit".
- After a conflict answer, the report appears with no "Wrote the rules" heading, because the spinner is skipped when a conflict prompt is coming.
- `--dry-run` on `vite-react` prints 825 lines, mostly new files as all-`+` diffs, with no color.
- PRD §3.1 and §6.3 now define the target behavior.

## Scope
1. **Diff formatter** (`src/ui/diff.ts`, pure): `formatDiff(unified, theme) → string`.
   - Drop `Index:`, `===`, `---`, and `+++` lines and trailing blank lines.
   - Paint `+` lines green, `-` lines red, `@@` lines gray. Context lines stay plain.
   - Cap a single diff at 40 lines on a TTY, then print `… N more lines (run with --dry-run to see all)`. `--dry-run` itself shows the full diff.
2. **Prompter**: add `prompter.diff(unified, title)` to the `Prompter` interface. The Clack adapter formats with `formatDiff` and shows it in a note. The fake prompter records it. `src/io/apply.ts` calls `prompter.diff` instead of `prompter.note`, so `io/` still imports only the prompter interface.
3. **Conflict wording** (`src/io/apply.ts` `ask`):
   - A managed block reads `the agentinit section of CLAUDE.md`. A whole file reads its path.
   - `already exists and is not managed by AgentInit` becomes `CLAUDE.md already exists and agentinit doesn't manage it yet.`
   - Spell the product `agentinit` in every user-facing string in `src/`.
4. **After conflicts**: once the last conflict is answered, print the success step `Wrote the rules` before the report, so both paths look the same.
5. **Dry run** (`src/commands/init.ts`, `src/ui/report.ts` `formatDiffs`):
   - New files (`created` from nothing) are listed in the tree only, with no diff.
   - Files that already exist get a header row with the path in bold and the action in its color, then `formatDiff`.
   - End with `Dry run · N files would change. Nothing written.`
   - `--json` keeps the full `diff` field for every file, unchanged.

## Out of scope
- Conflict decisions, defaults, backups, or any write behavior (`.cursor/rules/io-safety.mdc` still applies).
- Preview entry point in the review card (T35 calls this formatter).

## Implementation notes
- Only `src/io/apply.ts` message strings and the `note` → `diff` call change in `io/`. Add a test that proves apply's file results are byte-identical before and after.
- `formatDiff` gets a plain theme on pipes, so non-TTY output only loses the header lines.

## Acceptance criteria
- [ ] Conflict note on `existing-claude-md` has no `Index:`, `===`, `---`, or `+++` lines and no trailing blank lines (snapshot).
- [ ] The question names the file without `#blockId` and spells `agentinit` in lowercase.
- [ ] A long diff is capped at 40 lines in the conflict prompt.
- [ ] `init --dry-run --yes` on `vite-react` prints fewer than 60 lines, and every created file still appears in the tree.
- [ ] `init --dry-run --yes --json` output is unchanged.
- [ ] No user-facing string in `src/` spells the product `AgentInit`. The `AgentInitError` class name stays.
- [ ] Safety e2e tests pass unchanged.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js init --dry-run --yes --cwd tests/fixtures/vite-react | wc -l
cp -r tests/fixtures/existing-claude-md /tmp/ai-t39 && node dist/cli.js init --cwd /tmp/ai-t39
```

## Commit
`feat(ui): format conflict and dry-run diffs`

## Notes
