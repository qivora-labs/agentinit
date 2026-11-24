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
- [x] Decision recorded; Zustand 4 selects the intended fragment.
- [x] Overlapping library ranges fail `check-registry` when applicable.
- [x] Dual examples present if the fragment body has a Contract.
- [x] Human review in **Notes**; changeset exists.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): cover zustand 4`

## Notes
### Decisions (owner, 2026-11-24)
1. **Widen vs split.** Owner chose **widen**: keep a single `zustand` id with no `zustand-4`. Floor tightened to `appliesTo: { zustand: ">=4.4.3" }` so Contract imports of `zustand/react/shallow` (added in 4.4.3) are valid for the whole range; v5 loop risk stays in Boundary without forbidding the late-v4 pattern.
2. **Overlap check.** Not applicable — no library sibling pair. Left framework-only; T74 may still need it if Vitest splits.

### Implementation
- Fixture `tests/fixtures/zustand-4` (React 19 + Vite 6 + Zustand 4.5.5); e2e selects `zustand`.
- `next15-app` (already on Zustand 4.5.5) now selects `zustand` instead of emitting unsupported-version.
- Dual Contract examples retained; fragment version `1.3.1`; `verifiedAt: 2026-11-25`.
- PRD §8.2 lists `zustand-4`; §9 notes widen for libraries when guidance does not require a split. README coverage table: `zustand >=4.4.3`.
- Changeset: `.changeset/zustand-4-coverage.md` (`minor`).
- Content Tasks checklist: no move/network/install/secret instructions; sources cited; dual fences present; `pnpm registry:check` clean.
- Human review of fragment body completed 2026-11-25 (review-task findings: floor aligned to `zustand/react/shallow`).
