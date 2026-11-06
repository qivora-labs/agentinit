# T47 · Dogfood Output Matches This Repository

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | T43, T44, T45 | T48 | §5.4 (`ARCHITECTURE.md`), §7 M6 (dogfood) | M |

## Goal
This repository is the public showcase. The managed blocks agentinit writes here must describe this repository accurately and must not contradict the hand-written sections around them.

## Context
- `.agentinit/manifest.json` selects `architecture: layered`. The managed `core` block in `AGENTS.md` tells agents to "Put business rules in `src/domain/`" and "use cases in `src/application/`". This repo has no such folders, and the hand-written section above the block describes a `detect → resolve → plan → apply` layout.
- The managed block in `ARCHITECTURE.md` says "None of the detected folders match a row in the architecture map" and lists every `src/` folder under "Other existing folders".
- `doctor` reports "No issues found", because it checks drift, not accuracy.
- T32 Notes already flagged that `flat` reads poorly here (it steers to `components/` and `hooks/`). None of the four bundled architectures (`flat`, `feature-based`, `layered`, `atomic-design`) describes a CLI or library organized by pipeline stage.

## Decisions (owner, before starting)
Pick one and record it under **Notes**:
- **A — new architecture fragment** `modular` (Modular / By Concern): one top-level folder per concern under `{{src}}`, shared contracts at the `{{src}}` root, no import cycles, and dependency direction declared in `ARCHITECTURE.md`. Manual selection only; detection is unchanged in this task. It also fits many Express, NestJS, and CLI projects. Recommended.
- **B — keep the bundled set**, pick the least-wrong architecture, and rewrite the hand-written sections so they don't contradict it.

## Scope
1. If **A**: author `registry/architectures/modular.md` following `docs/workflows/write-fragment.md` and `.cursor/rules/registry-content.mdc` (`## Summary` ≤ 10 lines, `## Map`, Boundary, Directives, Contract, and `sources` of established guidance). Add it to PRD §4.2 and to the wizard's architecture list (§3.2 step 4) as a non-recommended option.
2. Re-run `node dist/cli.js init` on this repo, choosing the decided architecture. Review the diff: hand-written content stays byte-for-byte outside markers (PRD §6.1).
3. Remove contradictions and duplication between the hand-written sections and the managed blocks in `AGENTS.md`, `CLAUDE.md`, and `ARCHITECTURE.md`:
   - `CLAUDE.md` imports `@AGENTS.md` twice (once hand-written, once in the block). Keep one.
   - The hand-written "Commands" list and the generated "Project commands" list overlap. Keep the hand-written one for repo-only scripts (`registry:check`, `check:package`, `smoke`) and avoid repeating the generated ones.
4. Confirm the `doctor` CI step passes.

## Out of scope
- Detecting `modular` automatically (backlog).
- Changing what `doctor` checks.

## Implementation notes
- Edits to hand-written sections must stay outside the markers, or `doctor` reports `edited`.
- If T44's framework Map sections have landed, `ARCHITECTURE.md` for this repo is still built only from the architecture's Map, because the repo has no framework.

## Acceptance criteria
- [x] Decision recorded under **Notes**.
- [x] The managed `AGENTS.md` block names only folders and conventions that exist or apply in this repo.
- [x] The managed `ARCHITECTURE.md` block maps most `src/` folders, and nothing in it contradicts the hand-written section.
- [x] `CLAUDE.md` imports `AGENTS.md` once.
- [x] `node dist/cli.js doctor` exits `0`, and CI is green.
- [x] If **A**: `pnpm registry:check` passes, and a human reviewed the fragment. (`registry:check` clean; human review pending at PR)

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm registry:check
node dist/cli.js init
node dist/cli.js doctor
git diff AGENTS.md CLAUDE.md ARCHITECTURE.md
```

## Commit
`chore: regenerate dogfood rules to match the repository layout`
(If A adds a fragment, commit it first: `feat(registry): add modular architecture fragment`.)

## Notes
- **Decision A** (owner, 2026-11-06): new `modular` architecture fragment; detection unchanged.
- Authored `registry/architectures/modular.md` (sources: NestJS modules, Express routing, Express FAQ). Added to PRD §3.2 step 4 and §4.2; wizard `ARCHITECTURE_ORDER` lists it after `flat` without a recommended hint.
- Re-ran `init --yes` with manifest `architecture: modular`. Managed `ARCHITECTURE.md` maps all eight `src/*` concern folders; hand-written pipeline/dependency section kept outside markers.
- Hand-written `AGENTS.md` Commands trimmed to `check:package`, `registry:check`, `smoke`. `CLAUDE.md` keeps a single `@AGENTS.md` (in the managed block).
- `pnpm registry:check` passes (0 errors, 0 warnings). Fragment needs a human content review before merge.
- README architecture table still lists the old four; left for T48 docs accuracy.
