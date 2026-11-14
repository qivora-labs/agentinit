# T66 · Content: JavaScript Examples for RHF + Zod, Vitest, Playwright

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T62 | T70, T74 | §4.4, §10 | M |

## Goal
Forms and testing library fragments show correct JavaScript Contract examples, and TypeScript-only directives (such as `z.infer`) are marked so they drop from JavaScript output.

## Context
Promoted from `backlog.md` J3 (content). Fragments: `react-hook-form-zod`, `vitest`, `playwright`.

`react-hook-form-zod` is 109 lines and uses `z.infer`, `z.input`, `z.output`, and generics in Directives and Contract. It is the main consumer of T62's TypeScript-only directive marker. `vitest` has 23 globs (expansion is T61); the Contract still needs a JS sample.

## Scope
1. For each of the three fragments:
   - Add a hand-written JavaScript Contract fence per T62.
   - Mark TypeScript-only directive lines (especially `z.infer` / typed `useForm` generics) so JavaScript output keeps runtime guidance only.
   - Apply prose extension placeholders where test file names appear.
   - Bump `version`, set `verifiedAt`, keep `sources` / `appliesTo`.
2. Content Tasks checklist + human review.
3. `pnpm registry:check` and fix pinned tests.
4. Changeset as for sibling content tasks.

## Out of scope
- Vitest 2 range changes (T74).
- Zod 3 coverage (explicitly out of 0.2.0).
- Architecture / framework examples.

## Implementation notes
- Prefer shortening shared prose over duplicating long Contracts if the per-variant budget is tight; do not drop required directives.
- Playwright examples often use TypeScript fixtures; write a JS-equivalent that still demonstrates locators and assertions from the cited docs.
- Confirm the JS RHF + Zod example works with Zod 4 APIs already required by `appliesTo`.

## Acceptance criteria
- [ ] All three fragments have JS + TS Contract variants; TypeScript-only lines are marked and omitted for JavaScript profiles in tests.
- [ ] `pnpm registry:check` passes; Content Tasks checklist completed; human review in **Notes**.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): add javascript examples to forms and testing fragments`

## Notes
(Human review date and reviewer go here after merge readiness.)
