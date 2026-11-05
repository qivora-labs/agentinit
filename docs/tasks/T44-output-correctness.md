# T44 · Generated Output & Prompt Correctness

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | — | T47 | §3.3 step 4, §4.4 (placeholders), §5.4 (`ARCHITECTURE.md`), §6.3 | L |

## Goal
Fix the visible defects found in the pre-launch review: a gap in workflow step numbers, a wrong conflict question, and an `ARCHITECTURE.md` that says nothing useful for a typical framework app.

## Context
- **Step numbering.** `registry/workflows/new-feature.md` has steps 1–7. Steps 5 and 7 use `{{scripts.typecheck}}` and `{{scripts.test}}`. `renderBody` in `src/plan/placeholders.ts` drops lines whose script is missing but doesn't renumber, so a project with only `lint` gets steps `1, 2, 3, 4, 6`.
- **Conflict question.** `src/io/apply.ts` asks "`${label}` already exists and agentinit doesn't manage it yet." For a managed block, `conflictLabel` returns "the agentinit section of CLAUDE.md", so the question claims the *section* exists. It is the *file* that exists, and the section is new (see `tests/__snapshots__/e2e/screens/conflict-prompt-120.txt`).
- **`ARCHITECTURE.md` for framework apps.** On `next15-src` (`src/app` only), the file says "None of the detected folders match a row in the architecture map" and lists `src/app` under "Other existing folders". Architecture maps only cover generic folders (`components/`, `hooks/`, …). Framework folders such as `app/`, `pages/`, `routes/`, and `middleware/` are never described.
- **"likely" without evidence.** `inferArchitecture` in `src/detect/layout.ts` gives `flat` a high confidence from folder count alone (`flatWeight`), so the summary shows "Flat / Minimal — likely" even when none of flat's folders exist.

## Scope
1. **Renumber ordered lists** (`src/plan/placeholders.ts`): after dropping lines, renumber each ordered list that lost an item. A list is consecutive `N.` items at the same indent, outside fenced code. Keep the first item's number. Leave lists that lost nothing untouched.
2. **Conflict wording** (`src/io/apply.ts`):
   - Unmanaged shared file (managed block): "`CLAUDE.md` already exists and has no agentinit section yet. What should we do?"
   - Unmanaged non-shared file: "`.cursor/commands/new-feature.md` already exists and agentinit didn't create it. What should we do?"
   - Edited prompts keep "the agentinit section of `CLAUDE.md`" where the section really exists.
   - Update PRD §6.3 if its wording changes.
3. **Framework folder map**:
   - Framework fragments may contain an optional `## Map` section, in the same table format as architecture fragments.
   - `check-registry` accepts it for `framework` fragments and validates the table shape.
   - `src/targets/architecture-md.ts` merges the selected frameworks' Map rows with the architecture's rows when matching detected folders.
   - Add Map sections to `nextjs-app-router`, `nextjs-pages-router`, `express`, `fastify`, and `react-vite`, plus the T42 fragments if they have landed. Rows describe only what each folder holds (route segments, API routes, routers, plugins). No new directives.
4. **Empty layout text** (`src/targets/architecture-md.ts`): when nothing maps, replace "None of the detected folders match a row in the architecture map" with a sentence telling the agent to follow the conventions below for new code, and list the existing folders.
5. **Honest confidence** (`src/detect/layout.ts`): `flat` reaches the "likely" threshold (≥ 0.7) only when at least one of its Map folders exists under `srcDir`. Otherwise it stays below 0.7, so the low-confidence path in PRD §3.3 step 4 applies: interactive mode asks, and `--yes` defaults to `flat` with a notice.
6. Update unit tests, plan snapshots, e2e tree snapshots, and screen snapshots.

## Out of scope
- New architecture fragments (T47 may add one).
- Duplicate H1 headings when adopting an existing `AGENTS.md` (backlog, Phase 1).

## Implementation notes
- `plan/` and `targets/` are pure (`.cursor/rules/pure-modules.mdc`). Folder lists arrive through `ProjectProfile.folders`.
- Map content is registry content: follow `.cursor/rules/registry-content.mdc` and bump each edited fragment's `version` (patch).
- Changing step 5 changes interactive flow for small projects. Check `tests/e2e/screens.test.ts` cases that rely on "likely".

## Acceptance criteria
- [ ] `/new-feature` on `next15-src` (only `build`, `dev`, `lint`) is numbered 1–5 with no gaps. Lists that dropped nothing are unchanged.
- [ ] The `existing-claude-md` conflict question names `CLAUDE.md` as existing and says it has no agentinit section yet. The screen snapshots are updated.
- [ ] `ARCHITECTURE.md` for `next15-src` maps `src/app` with a responsibility. For `express-ts` it maps `src/routes` and `src/middleware`.
- [ ] A project whose only folder is `src/app` doesn't show "likely". `--yes` prints the low-confidence notice.
- [ ] `pnpm registry:check` accepts framework Map sections and rejects a malformed one.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm registry:check && pnpm test:screens
cp -r tests/fixtures/next15-src /tmp/ai-t44 && node dist/cli.js init --yes --cwd /tmp/ai-t44
cat /tmp/ai-t44/ARCHITECTURE.md /tmp/ai-t44/.cursor/commands/new-feature.md
```

## Commit
`fix(plan): renumber workflow steps and map framework folders`

## Notes
