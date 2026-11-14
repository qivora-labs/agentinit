# T72 · Older Majors: React 18 / Vite 5

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M12 — Older majors | T62, T64, T71 | T76 | §4.2, §8.2, §9 | L |

## Goal
Projects on React 18 and/or Vite 5 get version-aware framework rules instead of a "no matching rules yet" notice.

## Context
Promoted from `backlog.md` P1.1. Current `react-vite` requires `react >=19` **and** `vite >=6`. A React 19 + Vite 5 or React 18 + Vite 6 project matches nothing. T42 policy: cover current major and previous; new fragment id when guidance differs.

New fragments must include both TypeScript and JavaScript Contract examples (T62 / T64).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Range design.** Recommended: add one or more sibling fragments so every supported pair is covered without overlapping `appliesTo` for the same detect packages + globs. Sketch before coding, for example:
   - Keep `react-vite` for `react >=19` and `vite >=6`.
   - Add `react-vite-18` (name TBD) for `react >=18 <19` with Vite range that matches what the guidance needs (likely `vite >=5`).
   - Ensure React 19 + Vite 5 is either covered by a fragment or intentionally noticed — **do not leave a silent hole** for a common pair. Prefer an explicit fragment or a widened Vite lower bound on a carefully reviewed fragment if React 19 guidance holds on Vite 5.
2. **Id naming.** Follow T42 style (`express-4`, `nextjs-app-router-15`). Confirm the id before publish; it cannot be renamed.

## Scope
1. Author the new fragment(s) with dual examples, `sources`, `verifiedAt`, `compatibleWith` aligned with libraries that list `react-vite`.
2. Extend library `compatibleWith` entries that name only `react-vite` so they also accept the new id(s) where the library guidance holds.
3. Fixture(s) under `tests/fixtures/` for each new range; e2e init selects the expected id.
4. `check-registry` overlap rules must pass (framework siblings).
5. PRD §4.2 tree, §8.2 fixtures, §9 version coverage note.
6. `minor` changeset (new coverage).

## Out of scope
- Zustand 4 / Vitest 2 (T73, T74).
- Changing React 19 + Vite 6 guidance except for shared fixes.

## Implementation notes
- Verify React 18 docs (no React 19-only APIs such as `use` in directives that apply to 18).
- Content Tasks checklist + human review.
- Depends on T71 so unpinned doctor does not error for users who have not re-inited yet.

## Acceptance criteria
- [ ] Decisions recorded; no unintended range hole for React 18/19 × Vite 5/6 pairs you claim to support.
- [ ] Fixture(s): `init --yes` selects the new fragment id(s); dual examples present.
- [ ] Libraries that should apply remain compatible.
- [ ] `pnpm registry:check` passes; human review in **Notes**.
- [ ] A `minor` changeset exists.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): add react 18 and vite 5 framework coverage`

## Notes
(Record the final id names and appliesTo matrix here.)
