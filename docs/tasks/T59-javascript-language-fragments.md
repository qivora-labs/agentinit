# T59 · Content: `javascript` and `javascript-jsdoc` Language Fragments

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | — | T60 | §4.2, §7 | M |

## Goal
A JavaScript project has a language fragment to select, and the language picker only offers ids the CLI knows how to detect and render.

## Context
Promoted from `backlog.md` J4. The resolver requires a language fragment for every selection (`src/registry/resolve.ts`). No `javascript` fragment exists today, so removing the TypeScript gate (T60) without this task would fail resolve.

The picker in `src/ui/catalog.ts` offers every language id in the registry. New fragments would appear in *Customize* before the CLI can write them to the manifest, so this task also closes the picker to known ids.

Owner decision (2026-11-13): two language ids, mirroring `typescript` / `typescript-strict`. The second id holds JSDoc type rules and is suggested when `checkJs` is on (T60).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Second id name.** Recommended: `javascript-jsdoc`. The name is permanent once published (PRD §9 / CONTRIBUTING Compatibility). Alternatives: `javascript-typed`, `javascript-checkjs`.
2. **What each fragment covers.** Recommended:
   - `javascript`: follow the project's module system (placeholder from T69; until then, a static sentence that T69 will replace), keep TypeScript syntax out of `.js` / `.jsx` files, and check external input at runtime.
   - `javascript-jsdoc`: the above, plus JSDoc type directives that hold when `checkJs` is on (e.g. `@param` / `@returns` on exports that agents commonly invent wrong). Cite the TypeScript JSDoc reference and MDN.
3. **Picker allowlist.** Recommended: `LANGUAGE_ORDER` in `catalog.ts` is the closed set of language ids the CLI knows. Fragments whose id is not in that list are not offered. T60 adds the two new ids to the allowlist when it opens the manifest.

## Scope
1. **Fragments** (follow `docs/workflows/write-fragment.md` and `.cursor/rules/registry-content.mdc`):
   - `registry/languages/javascript.md`
   - `registry/languages/javascript-jsdoc.md` (or the decided id)
   - Both are `category: language`, `scope: always`, no globs. Fill `sources` and `verifiedAt`.
2. **Picker** (`src/ui/catalog.ts`): only offer language ids listed in `LANGUAGE_ORDER`. Add the two new ids to that list only after T60 opens the manifest for them — for this task, keep `LANGUAGE_ORDER` as `typescript-strict`, `typescript` and reject unknown registry language ids from the picker. Alternatively, add the new ids to the order behind a comment that T60 must open the type and manifest before they are selectable; prefer the first option so this PR alone cannot write an unknown language into a 0.1.2-compatible manifest.
3. **PRD** §4.2 registry tree: list the two new language files. §7: record the two-id decision if not already there.
4. This task adds no changeset by itself (content that is unreachable until T60). If the fragments are shipped in the same release branch as T60, T60's `minor` changeset covers them.

## Out of scope
- Removing the TypeScript gate or accepting `javascript` in the manifest (T60).
- JavaScript examples in framework / library / architecture fragments (T62–T66).
- Module-system placeholder (T69). Until T69 lands, the module-system sentence may be a fixed "follow the project's module system (ES modules or CommonJS)" without a placeholder.
- Changing TypeScript language fragments.

## Implementation notes
- The Content Tasks checklist in `docs/tasks/README.md` applies.
- Language fragments are single-language by nature and are exempt from the dual-example requirement in T62.
- Bodies stay ≤ 120 lines. Directives must be specific; no "write clean code".
- Run `pnpm registry:check`. A human reviews the content before merge.

## Acceptance criteria
- [ ] Decisions recorded under **Notes**, and the PRD updated.
- [ ] Both fragments pass `pnpm registry:check` and follow the 3-part formula.
- [ ] The language picker still offers only `typescript-strict` and `typescript` until T60 (or, if both land together, both new ids appear and resolve).
- [ ] Content Tasks checklist completed; human review noted under **Notes**.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): add javascript and javascript-jsdoc language fragments`

## Notes
Owner decisions, 2026-11-13 (planning session): two language ids for JavaScript. Confirm the second id's exact name before merging.
