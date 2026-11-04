# T35 · Review Before Write

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T34 | T38, T39, T40 | §3.2 step 6, §3.3 step 6, §3.5 | L |

## Goal
Show what `init` is about to do before it writes anything, and let the user write, preview, or change the setup from one card.

## Context
- Today interactive `init` writes 24 files straight after the agent picker. PRD §3.2 step 6 has always been called "Review & Write", but the review only happened after writing.
- Clack has no "back" navigation. *Change setup* on this card is how the user goes back.
- Decision: `--yes` skips the review and writes directly (PRD §3.5). `--dry-run` also skips it, because it already prints the preview and writes nothing.

## Scope
1. `src/ui/review.ts`: `reviewPlan(prompter, input) → 'write' | 'preview' | 'change'`.
   - The card is a `prompter.note` titled `Ready to write N files`, with the same per-agent rows as the T34 report (reuse `formatAgentReport`'s row builder), the context-cost line, and, when present, `K existing files need your decision` (count of `conflict-unmanaged` and `conflict-edited` changes).
   - Then a select: *Write files* (default) · *Preview changes* · *Change setup*.
   - When nothing would change, the card is not shown (the up-to-date path handles it, T37).
2. *Preview changes*: print the dry-run output (full tree and diffs, using T39's format once it lands), then show the card again. The preview must not prompt for conflicts. Run `applyChanges` with `dryRun: true` and the `--yes` file defaults, and label conflicting files `(you decide next)` in the preview.
3. *Change setup*:
   - Existing project: run the customize prompts, then agent selection, with the current answers preselected. Recompute the plan and changes, then show the card again.
   - Greenfield: run the wizard again with the current answers as `GreenfieldInitial`.
   - `--agents` still skips the agent prompt.
4. `src/commands/init.ts`: insert the review loop between `computeChanges` and `applyChanges` when `ctx.isInteractive && !ctx.yes && !ctx.dryRun`. Conflict prompts (§6.3) still happen during apply, after *Write files*.
5. The write spinner starts only after *Write files*.

## Out of scope
- The grouped report itself (T34) and diff colors (T39).
- Any change to conflict decisions or the apply engine's safety rules.

## Implementation notes
- Keep the loop in `init.ts` short: a `while` over `reviewPlan`, with recompute in a helper. If the loop grows, move it to `src/commands/review-loop.ts`.
- `src/io/` must not import `src/ui/` beyond the prompter interface. Counting conflicts uses `Change.kind` in `init.ts` or `ui/review.ts`, not inside `io/`.
- Cancelling at the card exits `130` and writes nothing.
- Add a `FakeAnswer` script for each branch: write, preview then write, change then write.

## Acceptance criteria
- [x] Interactive `init` on `next15-src` shows the card before any file exists on disk.
- [x] *Write files* writes the same files as today.
- [x] *Preview changes* prints the tree, writes nothing (including `.agentinit/`), asks no conflict question, and returns to the card.
- [x] *Change setup* on an existing project can drop a library, and the next card shows the smaller count.
- [x] *Change setup* on greenfield preselects the earlier answers.
- [x] `--yes` and `--dry-run` never show the card.
- [x] The conflict count matches the number of conflict prompts that follow on `existing-claude-md`.
- [x] Cancel at the card exits `130` with nothing written.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
cp -r tests/fixtures/existing-claude-md /tmp/ai-t35 && node dist/cli.js init --cwd /tmp/ai-t35
```

## Commit
`feat(cli): review the plan before writing in interactive init`

## Notes
- `agentReportParts` extracted from `formatAgentReport` so the review card reuses the same rows.
- `GreenfieldInitial.agents` only preselects; skipping the agent prompt is `GreenfieldOptions.agents` (`--agents` or a greenfield manifest re-run in `chooseSetup`).
- Preview runs `applyChanges` with `dryRun: true` and `yes: true`, then relabels conflict paths as `you decide next`.
