# T74 · Older Majors: Vitest 2

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M12 — Older majors | T62, T66, T71 | T76 | §4.2, §8.2, §9 | S–M |

## Goal
Vitest 2 projects get matching rules, preferably by widening the existing fragment when guidance holds across majors.

## Context
Promoted from `backlog.md` P1.1. Current `vitest` requires `vitest >=3`. Vitest 2 is still common. Many mocking and assertion directives are stable; confirm against Vitest 2 and 3 docs before choosing widen vs split.

`vitest` already has 23 globs; T61 expansion makes Windsurf size sensitive — prefer not to duplicate the fragment unless directives diverge.

## Decisions (owner, before starting)
1. **Widen vs split.** Recommended: **widen** to `vitest: ">=2"` (or `">=2 <4"` if you want an upper bound later) when every directive holds on Vitest 2. Add `vitest-2` only if a directive must differ. Record the doc pages checked.

## Scope
1. Update `appliesTo` and/or add a sibling fragment with dual examples; bump `version` / `verifiedAt`.
2. If splitting, rely on T73's library overlap check (implement overlap here if T73 has not merged yet — coordinate so only one PR owns the check helper).
3. Fixture with `vitest@2` and e2e selection.
4. PRD fixture / registry notes.
5. `minor` or `patch` changeset (widen is user-visible coverage → prefer `minor`).

## Out of scope
- Jest (P3.2 / explicitly out of 0.2.0).
- Changing the 23-glob list except for language expansion already in T61.

## Implementation notes
- Re-read Vitest 2 mocking docs for `vi.mock` hoisting differences.
- Content Tasks checklist if body text changes; human review if new fragment.

## Acceptance criteria
- [x] Decision recorded with sources checked.
- [x] `vitest@2` fixture selects rules; `vitest@3` still selects the current-major fragment or the widened one correctly.
- [x] `pnpm registry:check` passes.
- [x] Changeset exists.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): cover vitest 2`

## Notes
### Decisions (owner, 2026-11-25)
1. **Widen vs split.** Owner chose **widen**: keep a single `vitest` id with `appliesTo: { vitest: ">=2" }`. No `vitest-2` sibling — every directive holds on Vitest 2 and 3 (hoisting / timers / asserts / snapshots); Vitest 5 top-level `vi.mock` throw is out of range. Checked (version-pinned): https://v2.vitest.dev/guide/, https://v3.vitest.dev/guide/, https://v2.vitest.dev/api/vi, https://v3.vitest.dev/api/vi, https://v2.vitest.dev/guide/mocking, https://v3.vitest.dev/guide/mocking, https://v2.vitest.dev/guide/snapshot, https://v3.vitest.dev/guide/snapshot, https://v3.vitest.dev/guide/migration (v5 migration note only, not listed in sources).

### Implementation
- Fixture `tests/fixtures/vitest-2` (TypeScript + Vitest 2.1.9); e2e selects `vitest` for 2.1.9 and for a mutated 3.0.5 copy.
- `next15-app` (already on Vitest 2.1.9) now selects `vitest` instead of emitting unsupported-version.
- Dual Contract examples retained; fragment version `1.2.0`; `verifiedAt: 2026-11-25`; `sources` pinned to `v2.` / `v3.` docs (no unversioned `vitest.dev`).
- PRD §8.2 lists `vitest-2`; §9 notes widen for `vitest >=2`. README coverage table: `vitest >=2`.
- Changeset: `.changeset/vitest-2-coverage.md` (`minor`).
- Overlap check: not applicable — no library sibling pair.
- Content Tasks checklist: body directives unchanged; sources + range only; no move/network/install/secret instructions; dual fences present; `pnpm registry:check` clean.
