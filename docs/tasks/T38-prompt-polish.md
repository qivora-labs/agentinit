# T38 · Prompt Polish

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T35 | T40 | §3.2 (wizard intro, step count, agent hints), §4.4 | M |

## Goal
Make every question quick to scan: real group headers, short hints that fit on one line, a visible step count, and agent options that say what they write.

## Context
- Group names repeat on every option: `State & Data · Zustand`, `Other · Other TypeScript project`. T19 prefixed groups onto labels because the adapter only used `select` and `multiselect`. Clack 1.8.1 exports `groupMultiselect`.
- Hints are full fragment descriptions and wrap past the rail at 72 and 100 columns (`React 19 actions and use, public Vite env vars, and lazy-loaded components.`).
- The greenfield wizard starts with no context and no step count. The agent picker has no hints.

## Scope
1. **Groups** (`src/ui/prompter.ts`, `src/ui/catalog.ts`):
   - Add `groupMultiselect` to the `Prompter` interface and the fake prompter. Library and customize-framework multiselects use it, with `selectableGroups: false`.
   - For the single-select framework question, keep one list. Show the group as a gray prefix only on the first option of each group, and pad the others so the labels line up. Drop the `Other ·` prefix from "Other TypeScript project".
2. **Short hints** (`src/ui/catalog.ts`): Clack already shows the hint only on the focused option; the problem is length. Limit hints to 48 visible characters. Add an optional `hint` field to fragment metadata (`src/registry/schema.ts`) and fill it for every framework, library, language, and architecture fragment. When `hint` is missing, fall back to the description cut at a word boundary with `…`. `registry:check` warns when `hint` is missing or too long. Add `hint` to the frontmatter table in PRD §4.4 in this task.
3. **Step count** (`src/ui/wizard.ts`, `src/ui/summary.ts` customize): prefix each message with a gray `2/5`. Compute the total from the steps that will run: the library step is skipped when no library is compatible, and the agent step is skipped with `--agents`.
4. **Wizard intro**: before the first question, print one rail line: `No package.json found. Setting up a new project.`
5. **Agent hints** (`src/ui/agents.ts`): hint each agent with the folder it writes: `.cursor/`, `.claude/ + CLAUDE.md`, `.windsurf/`, `.github/`. Show a gray line under the question: `AGENTS.md is always written.`
6. **Wording**: "Which framework is this project?" becomes "Which framework are you using?". Low-confidence architecture message becomes `Not sure about the architecture (0.55). Which one should we use?`.

## Out of scope
- Conflict prompts (T39) and the review card (T35).
- New fragments or changes to fragment rule content.

## Implementation notes
- The registry is content. Read `.cursor/rules/registry-content.mdc` before adding `hint` to fragment frontmatter. `hint` is display-only and must not change generated files; snapshot tests under `tests/__snapshots__/` must not change.
- `groupMultiselect` returns the same value array, so callers keep their types. Wrap it in the adapter so `sanitizeDisplayText` still applies to every label.
- Keep the PRD §3.2 group order.

## Acceptance criteria
- [x] The library multiselect shows each group name once, as a header (pty capture in the PR description).
- [x] No hint exceeds 48 visible characters; `registry:check` enforces it.
- [x] Greenfield shows `1/5` … `5/5`; with `--agents` it shows `1/4` … `4/4`; with no compatible library it skips that number.
- [x] Agent options show their folder hints.
- [x] Generated-file snapshots are unchanged.
- [x] Fake-prompter tests cover `groupMultiselect`, including cancel → exit `130`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm registry:check
mkdir -p /tmp/ai-t38 && node dist/cli.js init --dry-run --cwd /tmp/ai-t38
```

## Commit
`feat(ui): add group headers, short hints, and step counts to prompts`

## Notes
- Step totals use `n/total` (task AC), not the PRD’s “2 of 5” example wording.
- Before the framework/frameworks answer, the library step is counted when any offered framework or an agnostic library would unlock options; after the answer the total is recomputed exactly.
- `hint` lives on rule fragments only for `registry:check` warnings; workflows are unchecked. Display truncates via `pickerHint` when `hint` is absent.
- Gray step prefixes and AGENTS.md underlines are painted in the Clack adapter after sanitize, so fragment text cannot inject styles.
