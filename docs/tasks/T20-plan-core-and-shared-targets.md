# T20 · Plan Core, `AGENTS.md`, `ARCHITECTURE.md`

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M4 — Targets | T06, T07 | T21–T24 | §4.1, §4.4 (Budgets), §5.1, §5.2, §5.4 (`ARCHITECTURE.md`) | L |

## Goal
The pure planning layer: turn a profile + resolved fragments into `FileOp[]`, including the two shared outputs (`AGENTS.md` and `ARCHITECTURE.md`), and define the adapter interface the four agent targets plug into.

## Context
- PRD §5.1 (layered output model: always-on content **only** in `AGENTS.md`), §5.2 (output matrix), §5.4 (`ARCHITECTURE.md` is descriptive).
- Managed block **markers** are added by the IO layer (T25); here, managed-block ops carry `blockId` + inner content only.

## Scope
- `src/plan/types.ts`: `TargetContext` (profile, rendered fragments grouped by scope `always`/`glob`/`auto`/`manual`, rendered workflows, placeholder context) and `TargetAdapter = (ctx) => FileOp[]`.
- `src/plan/render.ts`: renders every fragment's body and globs with T07 for the profile.
- `src/plan/build-plan.ts`: `buildPlan(profile, resolved) → Plan { ops: FileOp[]; alwaysOnTokens: number; warnings }`:
  - Always runs the shared adapters; runs agent adapters for `profile.agents` (registered in a map so T21–T24 just add entries).
  - Sorts ops by path; fails on duplicate paths/blocks.
- `src/plan/tokens.ts`: `estimateTokens(text) = ceil(chars / 4)`; warning when always-on content > 1,500.
- `src/targets/agents-md.ts` → managed block `core` in `AGENTS.md`:
  - Title + one-line intro, short table of contents.
  - **Project commands** (existing mode only; only scripts that exist, via `{{scripts.*}}`).
  - **Architecture**: the architecture fragment's `## Summary` + link to `ARCHITECTURE.md`.
  - Remaining `scope: always` fragments by `order` (language rules, etc.).
- `src/targets/architecture-md.ts` → managed block `architecture` in `ARCHITECTURE.md`:
  - Existing mode: detected `folders` mapped to responsibilities using the fragment's `## Map`; folders not in the map are listed as "Other existing folders" without judgment.
  - "Conventions for new code" from the fragment's directives.
  - Greenfield mode: the planned layout from `## Map`.
  - Never instructs moving existing files.

## Out of scope
- Agent-specific outputs (T21–T24).
- Markers, hashing, writing (T25, T26).

## Implementation notes
- Use a small in-test registry (`tests/fixtures/registry-sample/`) and fixed profiles; snapshot outputs with `toMatchFileSnapshot` under `tests/__snapshots__/plan/`.
- Determinism: no dates or versions in generated content except fragment-provided text.

## Acceptance criteria
- [ ] `AGENTS.md` block contains always-on content once, in `order`, and no glob/auto/manual fragment text.
- [ ] Commands section lists only existing scripts with the right package manager; omitted in greenfield.
- [ ] `ARCHITECTURE.md` differs between existing (detected folders) and greenfield (planned layout) for the same architecture.
- [ ] Token estimate and > 1,500 warning are tested.
- [ ] Duplicate op paths throw.
- [ ] Output is identical across two runs (determinism test).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(plan): build file plan with agents.md and architecture.md outputs`

## Notes
_Record decisions and discovered gaps here._
