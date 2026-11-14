# T73 · Older Majors: Zustand 4

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M12 — Older majors | T62, T65, T71 | T76 | §4.2, §8.2, §9 | M |

## Goal
Zustand 4 projects get matching rules. Version-split library siblings are validated the same way frameworks are.

## Context
Promoted from `backlog.md` P1.1. Current `zustand` requires `zustand >=5`. The overlap check in `src/registry/check.ts` only considers **framework** fragments. A `zustand` / `zustand-4` pair needs the same non-overlapping `appliesTo` enforcement for libraries that share detect packages and globs.

## Decisions (owner, before starting)
Record under **Notes**.
1. **Widen vs split.** Recommended: follow T42 — if Zustand 4 guidance differs (e.g. `create` API / middleware), add `zustand-4` with `appliesTo: { zustand: ">=4 <5" }` and keep `zustand` on `>=5`. If review shows directives are identical, widening `>=4` is allowed with dual examples still required.
2. **Overlap check.** Required if splitting: extend `overlappingFrameworkRangeProblems` (rename appropriately) to **library** category siblings with the same `detect.packages` and globs.

## Scope
1. Content: new or widened fragment with TS + JS examples; update `compatibleWith` if needed; `sources` / `verifiedAt`.
2. `check-registry` library overlap support + tests.
3. Fixture `zustand@4` (minimal) and e2e selection assertion.
4. PRD §4.2 / §8.2.
5. `minor` changeset.

## Out of scope
- Redux Toolkit or other state libraries (P3.2).
- Changing TanStack Query ranges.

## Implementation notes
- Content Tasks checklist + human review.
- Ship after T71.

## Acceptance criteria
- [ ] Decision recorded; Zustand 4 selects the intended fragment.
- [ ] Overlapping library ranges fail `check-registry` when applicable.
- [ ] Dual examples present if the fragment body has a Contract.
- [ ] Human review in **Notes**; changeset exists.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): cover zustand 4`

## Notes
(Record widen vs `zustand-4` id.)
