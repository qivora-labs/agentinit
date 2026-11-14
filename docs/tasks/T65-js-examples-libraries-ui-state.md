# T65 · Content: JavaScript Examples for Tailwind, shadcn, TanStack Query, Zustand

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T62 | T70, T73 | §4.4, §10 | M |

## Goal
UI and state library fragments show correct JavaScript Contract examples beside their TypeScript ones.

## Context
Promoted from `backlog.md` J3 (content). Fragments: `tailwind`, `shadcn`, `tanstack-query`, `zustand`.

These are mostly `tsx`-oriented. Zustand and TanStack Query examples use generics and `satisfies`-style patterns today.

## Scope
1. For each of the four fragments under `registry/libraries/`:
   - Add a hand-written JavaScript Contract fence per T62.
   - Apply prose extension placeholders where needed.
   - Remove T62 temporary TypeScript-only markers.
   - Bump `version`, set `verifiedAt`, keep `sources` and `appliesTo` accurate.
2. Content Tasks checklist + human review.
3. `pnpm registry:check` and fix pinned tests.
4. Changeset as for T63/T64.

## Out of scope
- Zustand 4 version-split fragment (T73).
- Forms and testing libraries (T66).
- Changing `compatibleWith` lists.

## Implementation notes
- Tailwind may be CSS-heavy; still provide a JS/JSX usage sample if the Contract is component-oriented.
- shadcn guidance often assumes TypeScript paths; keep JS examples honest about what the CLI generates in JS projects.
- Do not strip types mechanically from the TS fence.

## Acceptance criteria
- [ ] All four fragments have JS + TS Contract variants.
- [ ] `pnpm registry:check` passes; Content Tasks checklist completed; human review in **Notes**.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): add javascript examples to ui and state library fragments`

## Notes
(Human review date and reviewer go here after merge readiness.)
