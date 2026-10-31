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
- [x] `AGENTS.md` block contains always-on content once, in `order`, and no glob/auto/manual fragment text.
- [x] Commands section lists only existing scripts with the right package manager; omitted in greenfield.
- [x] `ARCHITECTURE.md` differs between existing (detected folders) and greenfield (planned layout) for the same architecture.
- [x] Token estimate and > 1,500 warning are tested.
- [x] Duplicate op paths throw.
- [x] Output is identical across two runs (determinism test).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(plan): build file plan with agents.md and architecture.md outputs`

## Notes
- Project commands are every `package.json` script, sorted by name, expanded the same way as `{{scripts.*}}` (`npm run`, `pnpm`, `yarn`, `bun run`). The section is omitted in greenfield, when the package manager is null, or when nothing renders. A line in a fragment that names a missing script is still dropped by T07.
- Always-on fragments other than the architecture follow commands and the architecture summary, in `order` then `id`. Their ATX headings are nested one level under the fragment name so the table of contents points at that fragment. A heading that is already level 6 stays level 6, because seven hashes are not a heading. Headings inside fences are left alone. The contents links use GitHub's heading anchors: Unicode lowercase, punctuation and emoji removed, spaces turned into hyphens.
- `## Map` rows map a detected folder when the segment counts are equal and every segment matches. `<name>` matches one segment. A parent row does not match a nested folder, and the earlier row wins when two equal-length rows match. Other detected folders are listed under "Other existing folders" with no instruction to move them. Layout says nothing was detected only when the folder list is empty; otherwise it says none of the detected folders match a map row. A map that is not a table is copied as the planned layout, and every detected folder is unmatched. Greenfield ignores `profile.folders`.
- Always-on tokens are `ceil(characters / 4)` of the `AGENTS.md` `core` block. The warning is only when that count is greater than 1,500.
- Two ops with the same path throw, and so do two managed blocks that share a `blockId`.
- `agentAdapters` is the map T21–T24 fill in. A selected agent with no entry adds no files. `buildPlan` is not called from the CLI yet (T27).
- `tests/fixtures/registry-sample/architectures/layered.md` now has a path table in `## Map` so planning tests can map folders. Frontmatter is unchanged.
- PRD §4.2's tree and the repo `ARCHITECTURE.md` folder map do not list `plan/types.ts`, `render.ts`, `tokens.ts`, or `markdown.ts`. Those files follow this task; the PRD was not edited.
