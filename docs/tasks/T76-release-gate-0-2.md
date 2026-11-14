# T76 · 0.2 Release Gate and Docs

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M13 — 0.2 release gate | T70, T72, T73, T74, T75 | Publish `0.2.0` | §7, §8.3, §9 | M |

## Goal
`release/0.2` is ready to merge to `main` and publish `@agentinit/cli@0.2.0`: compatibility re-verified, checklist updated, eval signed, and changesets coherent.

## Context
Final gate for the minor. Mirrors T48's role for 0.1.0, scoped to 0.2. Work lands on `release/0.2` first; this task's last steps merge to `main` and follow the Version Packages flow.

## Scope
1. **Status**: every M11–M13 task (T59–T75) is `done` in `docs/tasks/README.md`.
2. **Eval**: T75 is go; link `docs/evals/results-v0.2.md` from the release checklist.
3. **Compatibility**: re-verify every minimum in `docs/compatibility.md` against vendor docs; update **Last verified** dates.
4. **Release checklist**: add a **0.2.0** section to `docs/release-checklist.md` (or a sibling) covering: all 0.2 tasks done, JS eval go, compatibility re-verify, merge `main` into `release/0.2`, open PR `release/0.2` → `main`, Version Packages → `0.2.0`, provenance, smoke `npx @agentinit/cli@0.2.0 --version`.
5. **Changelog / changesets**: on `release/0.2`, confirm `pnpm changeset status` proposes `0.2.0` with user-facing notes covering JavaScript support, older majors, doctor language / unselected behavior, and BREAKING CHANGE for JS exit code.
6. **Dogfood**: re-run `init` on this repository if needed; `doctor` clean on `release/0.2`.
7. **Merge sequence** (owner-operated, documented in the checklist):
   - Merge latest `main` into `release/0.2`.
   - Open PR to `main`; CI green.
   - Merge; let Release workflow open/update Version Packages; publish.
8. PRD §7: mark v0.2 items done or point at shipped behavior.

## Out of scope
- Implementing missing features from earlier tasks.
- Zod 3 / Jest / Tailwind v3.
- Creating `release/0.2` (owner operation in backlog; must exist before task PRs).

## Implementation notes
- This planning PR merges to `main` before `release/0.2` is cut; T76 assumes that branch exists.
- Do not publish from a private repo without provenance (same rules as 0.1.0 checklist).
- Prefer one final docs PR on `release/0.2` rather than mixing with feature work.

## Acceptance criteria
- [ ] T59–T75 marked `done`.
- [ ] T75 go recorded; compatibility dates updated.
- [ ] `docs/release-checklist.md` has a 0.2 path an owner can follow.
- [ ] `pnpm changeset status` on the release branch proposes `0.2.0` with accurate notes.
- [ ] Checklist items for merge/publish are ready for the owner (may remain unchecked until publish day).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm registry:check && pnpm check:package && pnpm smoke
pnpm changeset status
node dist/cli.js doctor
```

## Commit
`docs: add 0.2 release gate and refresh compatibility`

## Notes
(Record merge PR URL and npm version when published.)
