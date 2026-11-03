# T34 · Grouped `init` Report & Next Steps

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T27 | T35, T37, T40 | §3.1 (terminal presentation), §3.3 step 8 | M |

## Goal
Make the end of `init` the best screen in the session: a short per-agent summary of what was written, a token line a new user understands, and next steps that tell them how to use what was just made.

## Context
- A UX review (2026-11-04) found that the report is the weakest moment. On `next15-src` it prints 24 tree lines that each end in `(created)`, then `Always-on tokens: 830`, then `Rules written.` An existing project gets no next steps. The tree starts at column 0, so its `├──` lines blur into Clack's rail.
- Decision: on a TTY the report is grouped by agent. The full tree stays for `--dry-run`, for "Preview changes" (T35), and for non-TTY streams, so pipes, CI logs, and the README example keep their current shape.
- Every `FileOp` already carries `target: AgentTarget | 'shared'` (`src/types.ts`).

## Scope
1. `src/ui/report.ts`: a pure `formatAgentReport(entries, theme)` that takes report entries with a `target` field and returns:
   - A heading: `Wrote N files for M agents` (dry run: `Would write N files for M agents`). Count only entries whose action is not `unchanged`.
   - One row per agent in `AGENT_TARGETS` order, with aligned columns: agent label, `N files`, and the common folder (`.cursor/`, `.claude/`, `.windsurf/`, `.github/`). Agents with nothing changed are omitted.
   - A `Shared` row that lists shared files by name (`AGENTS.md  ARCHITECTURE.md`).
   - When an action is not `created`, show the breakdown in the row in gray (for example `5 files · 2 updated, 1 adopted`). `skipped` and `backed-up` use the warning color, as in `paintFileTree`.
2. Carry `target` into the report. `ApplyReportEntry` comes from `Change`. Look up each path's target from `plan.ops`. A deleted path is not in the plan, so group it under the agent whose folder prefix matches it, or under `Removed` if none does.
3. `formatTokenLine`: on a TTY, `Context cost  ~830 tokens loaded in every chat (budget 1,500)`. Over budget keeps the warning tone and says `over the 1,500 token budget`. Non-TTY output keeps the current `Always-on tokens: N` line unchanged.
4. `src/ui/next-steps.ts`: add `existingNextSteps(agents, workflows)` returning three steps:
   1. `Review the changes   git diff`
   2. `Try a workflow       /new-feature` (the first resolved workflow by `order`, then id; omit this step when no workflow was resolved)
   3. `Check for drift      npx @agentinit/cli doctor`
   Render them as one numbered block inside the frame, with the command part in cyan. Existing-project next steps are TTY-only. Greenfield steps keep their current content and still print on pipes (PRD §3.2 step 7); on a TTY they use the same numbered block, with the generator command highlighted.
5. `src/commands/init.ts`: on a TTY, print the grouped report, token line, notices, and next steps inside the frame, then close with `Done.`. The non-TTY path, `--json`, and `--dry-run` keep printing the tree. Keep `init.ts` as orchestration only.
6. Every line of the report stays inside the Clack rail (`│  ` prefix). Fix the tree path too: when the tree is printed on a TTY, indent it under the rail so `├──` no longer looks like part of the frame.
7. Update the README "Example output" with the TTY report and keep the `--yes` pipe tree as a second example.

## Out of scope
- The review card before writing (T35).
- Diff formatting (T39).
- Width fitting for very narrow terminals (T40).

## Implementation notes
- The report formatter is pure and takes `Theme`, like `paintFileTree`. No `process` reads.
- Pluralize correctly: `1 file`, `2 files`, `1 agent`.
- Column alignment uses visible width (strip color before measuring). Reuse the helper from T36 if it has landed; otherwise add one to `src/ui/` and let T36 reuse it.
- The closing line is chrome. Pipes keep `Rules written.` omitted, as today.

## Acceptance criteria
- [ ] TTY report for `next15-src` with all four agents is ≤ 12 lines, from the heading to `Done.` (snapshot).
- [ ] Rows appear in `AGENT_TARGETS` order and only for agents with changed files.
- [ ] `--agents cursor` followed by `--agents claude` groups the deleted Cursor files correctly.
- [ ] Mixed actions (created, updated, adopted, skipped) show the breakdown text and colors.
- [ ] Non-TTY `init --yes` output is byte-for-byte unchanged (existing e2e tests still pass without snapshot updates).
- [ ] `--json` output is unchanged.
- [ ] Existing-project next steps appear on a TTY and not on a pipe. Greenfield next steps appear on both.
- [ ] Over-budget token line uses the warning tone and names the budget.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
cp -r tests/fixtures/next15-src /tmp/ai-t34 && node dist/cli.js init --cwd /tmp/ai-t34
node dist/cli.js init --yes --cwd /tmp/ai-t34 | cat   # pipe output keeps the tree
```

## Commit
`feat(ui): group the init report by agent and add next steps`

## Notes
