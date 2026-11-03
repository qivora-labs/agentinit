# T37 · Re-run, `doctor`, `list` & Flag Errors

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T34, T36 | T40 | §3.1 (terminal presentation), §3.4, §3.5, §6.5 | M |

## Goal
Respect a returning user's time: an up-to-date re-run says so before asking anything, `doctor` and `list` drop the big banner and show what they checked, and flag typos get a suggestion.

## Context
- Today a re-run with no changes shows "No package changes since the last run", still asks "Use this configuration, or customize?", then prints "Already up to date."
- `doctor` prints the 13-line banner and then only `└  No issues found.` With issues, the report has no icons.
- `--agents cursr` prints `Unknown agent "cursr"` with no suggestion.
- Decision: `init` keeps the full wordmark on every run. `list` and `doctor` get a one-line header (PRD §3.1). `--help` keeps the wordmark.

## Scope
1. **Up-to-date re-run** (`src/commands/init.ts`, `src/ui/summary.ts`): with a manifest, compute the plan from the saved selections before asking anything. When detection matches the saved selections and `computeChanges` has no work:
   - Print `Already up to date · N files for M agents` with the success icon. Notices and warnings still print.
   - Ask *Done* (default) · *Change setup*. *Done* closes the frame. *Change setup* goes to the customize prompts, then the review card (T35).
   - `--yes` answers *Done* (PRD §3.5). Non-interactive output stays `Already up to date.`
   When something changed, keep today's "What changed" note and question.
2. **Compact header** (`src/ui/brand.ts`, `src/ui/logger.ts`): `formatHeader(theme, command)` returns one line, `agentinit` in the terminal foreground and the command in gray, followed by a blank rail line. `logger.open()` takes the command name. `init` and `--help` keep `formatBanner`. `list` and `doctor` use `formatHeader`. Non-Unicode terminals get the same line with ASCII glyphs.
3. **`doctor` checklist** (`src/doctor/checks.ts`, `src/commands/doctor.ts`): on a TTY, list each check from PRD §6.5 with the success or error icon and a short name: manifest, managed files, detected packages, package versions, token budget, legacy files. Failing checks keep their issue lines and `Fix:` command under them. Close with `No issues found.` or `N issues found.` in the error tone. `--json` and pipe output are unchanged.
4. **Did you mean** (`src/context.ts` `parseAgents`, `src/commands/list.ts` category check): suggest the closest valid value when the edit distance is ≤ 2. Add a small pure Levenshtein helper in `src/ui/` or next to `parseAgents`. Keep the list of valid values in the message.
5. `legacy-agent-file` warnings print once per run: in the detection card, not again at the end. The JSON `notices` list is unchanged.

## Out of scope
- New `doctor` checks or exit-code changes.
- Fuzzy suggestions for `add` / `remove` (v0.2).

## Implementation notes
- `doctor/checks.ts` is pure (`.cursor/rules/pure-modules.mdc`). The checklist is data (`{ id, label, ok }[]`) built there. Painting stays in `src/ui/paint.ts`.
- The up-to-date check must use the same plan `init` would write, so the shortcut can never hide a pending change. Add a test that edits one managed file and confirms the shortcut is not taken.

## Acceptance criteria
- [ ] Interactive re-run on an up-to-date `next15-src` prints the up-to-date line before any prompt, and Enter exits `0` with nothing written.
- [ ] *Change setup* from the up-to-date prompt reaches the review card.
- [ ] A hand-edited managed file skips the shortcut and goes through the normal flow.
- [ ] `doctor` and `list` on a TTY print the one-line header and no wordmark. `init` and `--help` still print the wordmark.
- [ ] Healthy `doctor` on a TTY lists six passing checks. A failing check shows its issue and fix.
- [ ] `doctor --json` and `list --json` output are unchanged.
- [ ] `--agents cursr` suggests `cursor`. `--agents xyz` lists the valid values with no suggestion.
- [ ] `.cursorrules` warning appears once per interactive run.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
cp -r tests/fixtures/next15-src /tmp/ai-t37 && node dist/cli.js init --yes --cwd /tmp/ai-t37
node dist/cli.js init --cwd /tmp/ai-t37     # expect the up-to-date line first
node dist/cli.js doctor --cwd /tmp/ai-t37
node dist/cli.js init --agents cursr --cwd /tmp/ai-t37   # expect "Did you mean"
```

## Commit
`feat(ui): shorten re-runs and polish doctor, list, and flag errors`

## Notes
