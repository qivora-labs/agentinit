# T75 · Effectiveness Eval on a JavaScript Fixture

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M13 — 0.2 release gate | T70 | T76 | §8.3 | M |

## Goal
Before shipping 0.2, record a rule-effectiveness eval on a JavaScript fixture that meets the PRD §8.3 gate (≥ 4 of 5 tasks with fewer violations with rules than without).

## Context
Promoted from `backlog.md` J6. The v0.1 eval in `docs/evals/` ran only on TypeScript `next15-src`. Several checklist items are return-type / `any` checks from `typescript-strict`. A JavaScript eval needs checklist items that can occur in JavaScript (module system, no type syntax in `.js`, library patterns).

This task is **human-led** (same as T33). An agent prepares materials; the owner runs or supervises the matrix and signs go/no-go.

## Decisions (owner, before starting)
Record under **Notes** and in `docs/evals/`.
1. **Task subset.** Recommended: run **all five** task prompts, adapted to a JS Next.js (or JS Vite) fixture, so the gate stays comparable. Alternative: a subset of three library-focused tasks if App Router JS setup is too heavy — only with owner approval.
2. **TypeScript cells.** Recommended: **do not** re-run the full TypeScript matrix for 0.2 unless fragments that affect TS output changed in a way that invalidates v0.1 scores. Carry forward `results-v0.1.md` as the TS baseline; this file is `results-v0.2.md` for JavaScript (and any re-run TS cells).
3. **Runners.** Keep the v0.1 stand-in pair unless the owner upgrades both agents for this release (`docs/evals/README.md`).

## Scope
1. **Fixture setup** docs: extend or add a JavaScript eval fixture procedure in `docs/evals/README.md` (packages, seeds without TypeScript syntax where the task is JS).
2. **Checklist**: add or adapt items for module system, no TypeScript syntax in `.js` / `.jsx`, and library rules that apply. Remove or mark N/A return-type items for pure JS runs.
3. **Tasks**: adjust `docs/evals/tasks.md` prompts or add a JS appendix so paste-ready prompts match the JS fixture paths.
4. **Results**: create `docs/evals/results-v0.2.md` from the template; fill runs; owner signs go/no-go.
5. PRD §8.3: note that minors include a JavaScript cell from 0.2 on.

## Out of scope
- Automating the harness (P3.4 / v0.5+).
- Changing production registry content except fixing a fragment that fails the gate (then re-run affected cells).

## Implementation notes
- Same procedure as T33: fresh sessions, no mid-run steering, score only created/edited files.
- If the gate fails, revise fragments or seeds, re-run affected cells, and record an addendum — do not ship 0.2.

## Acceptance criteria
- [ ] Decisions recorded under **Notes**.
- [ ] JS eval materials exist (README, checklist, prompts).
- [ ] `results-v0.2.md` filled; ≥ 4 of 5 tasks pass; owner signed go (or documented no-go blocking T76).

## Verify
Manual: complete the eval matrix and owner review. No `pnpm test` requirement beyond ensuring the eval fixture still `init`s:
```bash
pnpm build
# init --yes on the JS eval workdir as documented
```

## Commit
`docs(evals): add javascript effectiveness eval for 0.2`

## Notes
(Owner sign-off date and pass count.)
