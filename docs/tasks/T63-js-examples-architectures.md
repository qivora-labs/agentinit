# T63 · Content: JavaScript Examples for Architectures

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T62 | T70 | §4.4, §10 | M |

## Goal
Every architecture fragment carries a hand-written JavaScript Contract example (and prose extensions) so a JavaScript project's always-on `AGENTS.md` never shows TypeScript-only samples.

## Context
Promoted from `backlog.md` J3 (content). Architecture fragments are `scope: always`, so their Contract and Summary are copied into every project's `AGENTS.md`. Today all five show TypeScript (`import type`, `.ts` paths). `feature-based` names `index.ts` in Summary and Map.

Fragments: `flat`, `feature-based`, `layered`, `atomic-design`, `modular`.

## Scope
1. For each architecture fragment under `registry/architectures/`:
   - Add a JavaScript Contract fence per T62's decided format.
   - Replace hard-coded `.ts` / `.tsx` in Summary, Map, Boundary, and Directives with the prose extension placeholders from T62.
   - Remove any temporary TypeScript-only marker left by T62.
   - Bump fragment `version` (minor) and set `verifiedAt` to today. Keep `sources` accurate; re-verify if guidance changed.
2. Follow the Content Tasks checklist in `docs/tasks/README.md`.
3. Run `pnpm registry:check`. Update unit/snapshot tests that pin architecture body text if they fail.
4. No separate changeset required if T62's minor already covers dual examples; otherwise add a `patch` or `minor` note that architecture examples now include JavaScript.

## Out of scope
- Framework and library examples (T64–T66).
- Changing architecture detection or ids.
- Workflows.

## Implementation notes
- Read `.cursor/rules/registry-content.mdc` and `docs/workflows/write-fragment.md` (as updated by T62).
- JavaScript examples are written by hand; do not strip types from the TypeScript fence.
- Keep Summary ≤ 10 non-empty lines after placeholder substitution still makes sense for reviewers.
- TypeScript rendered output should stay equivalent for pure-TS profiles (T62 invariant).

## Acceptance criteria
- [ ] All five architecture fragments have JS + TS Contract variants and language-neutral prose extensions.
- [ ] `pnpm registry:check` passes with no TypeScript-only markers remaining on these files.
- [ ] Content Tasks checklist completed; human review noted under **Notes**.
- [ ] A TypeScript-only profile still renders the previous TypeScript meaning (spot-check Summary / Contract).

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): add javascript examples to architecture fragments`

## Notes
(Human review date and reviewer go here after merge readiness.)
