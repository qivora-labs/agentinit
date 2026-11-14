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
- [ ] Decision recorded with sources checked.
- [ ] `vitest@2` fixture selects rules; `vitest@3` still selects the current-major fragment or the widened one correctly.
- [ ] `pnpm registry:check` passes.
- [ ] Changeset exists.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): cover vitest 2`

## Notes
(Record widen vs split and the final range.)
