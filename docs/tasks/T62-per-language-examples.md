# T62 · Per-Language Examples: Mechanism and Registry Check

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T61 | T63–T66, T69 | §4.4, §10 | M |

## Goal
The plan renders the Contract example that matches the project's language, and `check-registry` enforces that every dual-language rule fragment has both variants (or an explicit TypeScript-only marker).

## Context
Promoted from `backlog.md` J3 (mechanism half). All 21 rule fragments show typed TypeScript today. Architecture fragments are always-on, so their examples would be copied into a JavaScript project's `AGENTS.md`. Language fragments are single-language and are exempt.

`react-hook-form-zod` is 109 lines with a long Contract; a second full example cannot fit unless the 120-line budget counts each rendered variant. File names in prose (`index.ts`, `route.ts`, `error.tsx` in `feature-based` and Next.js Map rows) would tell a JavaScript project to create TypeScript files.

Invariant for 0.2: **output for existing TypeScript projects without `allowJs` stays byte-identical**, so users do not get `rules-update` warnings from example machinery alone.

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Syntax for two variants.** Recommended: two fenced blocks told apart by info string, e.g. ```` ```ts ```` / ```` ```tsx ```` for TypeScript and ```` ```js ```` / ```` ```jsx ```` for JavaScript, in the same Contract section. The plan keeps the matching fence(s) and drops the other. Alternative: separate `## Contract (TypeScript)` / `## Contract (JavaScript)` sections.
2. **Line budget.** Recommended: the 120-line limit in `check-registry` counts **each rendered variant** (and shared prose once), not the raw source file with both fences. Alternative: raise the raw limit (hurts contributor guidance).
3. **TypeScript-only directives.** Recommended: a small HTML comment marker on the directive line (or a dedicated fence annotation) that the plan strips for JavaScript output. Only `react-hook-form-zod` needs this today (`z.infer`). Alternative: duplicate whole directive lists per language.
4. **Prose file extensions.** Recommended: a placeholder such as `{{ext}}` / `{{jsxExt}}` (exact names to decide) that renders `ts`/`tsx` or `js`/`jsx`. Used in Summary, Map, and directive prose. Alternative: language-specific prose fences (heavier).
5. **Fragment `version` bumps.** Recommended: bump the fragment content `version` when adding the JavaScript example (minor), so the manifest `fragments` map records the change after re-`init`.

## Scope
1. **Render** (`src/plan/`): select fences and prose extensions from the profile language (JavaScript family vs TypeScript family). TypeScript-only marked lines drop for JavaScript. Shared non-Contract body stays.
2. **`check-registry`** (`src/registry/check.ts`, `scripts/check-registry.ts`): for every rule fragment except language fragments, require a JavaScript Contract fence **or** an explicit TypeScript-only marker on the fragment. Fail CI if missing. Apply the decided line-budget rule.
3. **Authoring docs**: update `docs/fragment-template.md` and `docs/workflows/write-fragment.md` (and `.cursor/rules/registry-content.mdc` if needed) for dual examples, markers, and prose placeholders.
4. **Invariant test**: render `next15-src` (or the three e2e tree fixtures) and assert TypeScript output matches pre-change snapshots for projects without `allowJs`. Expect content tasks (T63–T66) to refresh snapshots when examples are added; this task may land with temporary TypeScript-only markers on existing fragments so CI stays green, **or** require T63–T66 in the same wave before merging to `release/0.2`. Prefer: this task lands the mechanism + markers on all non-language rule fragments so `check-registry` passes; content tasks replace markers with real JS examples.
5. **PRD** §4.4, §10.
6. Add a `minor` changeset describing dual examples / language-aware rendering.

## Out of scope
- Writing the hand-authored JavaScript examples (T63–T66).
- Module-system placeholder (T69), though the prose-extension placeholder should not collide with it.
- Changing workflow fragments (no Contract examples).

## Implementation notes
- JavaScript examples are written and reviewed by hand in later tasks; do not strip types mechanically to produce them.
- Fence detection already exists in `src/plan/placeholders.ts` and `src/registry/check.ts`; reuse patterns carefully.
- Pure modules only in `plan/`.

## Acceptance criteria
- [ ] Decisions recorded under **Notes**, and the PRD updated.
- [ ] Given a fragment with both fences, a JavaScript profile renders only the JS example; a TypeScript profile renders only the TS example; TypeScript output matches the previous single-fence content when the TS fence is unchanged.
- [ ] `check-registry` fails when a non-language rule fragment lacks a JS fence and lacks a TypeScript-only marker.
- [ ] Line budget follows decision 2.
- [ ] Fragment template and write-fragment workflow document the format.
- [ ] A changeset exists.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(plan): render per-language contract examples`

## Notes
Recommendations match the 2026-11-13 planning session. Confirm fence info-string conventions before coding so T63–T66 can follow them.
