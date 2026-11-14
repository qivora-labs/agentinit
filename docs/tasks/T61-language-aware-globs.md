# T61 · Language-Aware Globs

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T60 | T62 | §4.4, §5.4, §8.1 | M |

## Goal
Scoped rules load on the project's language. A JavaScript project gets `.js` / `.jsx` globs; a TypeScript project with `allowJs` gets both TypeScript and JavaScript globs.

## Context
Promoted from `backlog.md` J2. Every framework and library fragment lists only `.ts` / `.tsx` globs (Tailwind adds `.css`). A JavaScript project therefore gets scoped rule files whose patterns never match, so the rules never load. The same gap already affects TypeScript projects that still contain `.js` / `.jsx` when `allowJs` is true.

`vitest` lists 23 globs today. Expansion multiplies them. Windsurf rule files must stay below 12,000 characters (`src/targets/windsurf.ts`).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Mapping style.** Recommended: **implicit** mapping from `.ts` → `.js` and `.tsx` → `.jsx` in the plan layer. Fragments keep declaring each glob once. Published and community fragments need no change. Alternative: an explicit placeholder in each glob (more readable in the fragment, but a breaking change for every contributor).
2. **Which extensions.** Recommended for 0.2: map `.ts` ↔ `.js` and `.tsx` ↔ `.jsx` only. Leave `.mjs`, `.cjs`, `.mts`, and `.cts` out. Alternative: include them (more globs; more Windsurf risk).
3. **When TypeScript globs widen.** Recommended: widen when `allowJs` is true on the profile, **not** when `.js` files exist on disk. File presence would make `doctor` report `outdated` when someone adds a `.js` file. Alternative: always emit both for TypeScript (more noise in pure-TS repos).
4. **`.tsx` → `.js`?** Recommended: **no**. Older React projects that keep JSX in `.js` are rare relative to `.jsx`. Adding `.js` for every `.tsx` glob doubles JSX patterns unnecessarily. Alternative: also map `.tsx` → `.js`.

## Scope
1. **Pure expansion** (`src/plan/placeholders.ts` or a sibling under `src/plan/`): given rendered globs and profile language facts, expand extensions. Deduplicate. Keep forward slashes.
2. **Wire into** `renderRule` / `renderGlobs` so every target receives expanded globs. Targets stay unaware of the mapping.
3. **Tests**: JavaScript profile → only JS extensions; TypeScript without `allowJs` → unchanged globs (byte-identical to today); TypeScript with `allowJs` → both. Snapshot or assert the widest case (`vitest` + `allowJs`) stays under Windsurf's 12,000-character limit for each target that joins globs into one string.
4. **PRD** §4.4 (placeholders / glob rendering), §5.4, §8.1.
5. Add a `minor` changeset (user-visible: JavaScript and `allowJs` projects get matching scoped rules). If T60 already opened the minor, a second `minor` or a note in the same release branch is fine; prefer one coherent changelog entry if landing together.

## Out of scope
- Changing fragment source globs in `registry/` (except if a bug is found).
- Per-language Contract examples (T62).
- Fixtures and full e2e trees (T70).

## Implementation notes
- `plan/` is pure (`.cursor/rules/pure-modules.mdc`). Receive facts from the profile; never read `tsconfig` here.
- Cursor, Windsurf, and Copilot join patterns with commas; expansion must not introduce braces or commas inside a single pattern.
- Preserve order: original glob, then the mapped sibling, unless tests show a better deterministic order.

## Acceptance criteria
- [ ] Decisions recorded under **Notes**, and the PRD updated.
- [ ] JavaScript profile: a fragment declaring `{{src}}**/*.ts` yields a `.js` glob (and `.tsx` → `.jsx`); no `.ts` / `.tsx` remain unless decision 4 says otherwise.
- [ ] TypeScript without `allowJs`: rendered globs match pre-T61 output for the same profile.
- [ ] TypeScript with `allowJs`: both extensions present; `doctor` does not flip when a `.js` file is added without `allowJs` changing.
- [ ] Expanded `vitest` globs on a Windsurf target stay under 12,000 characters.
- [ ] A changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(plan): expand rule globs for javascript and allowJs`

## Notes
Recommendations above match the 2026-11-13 planning session. Confirm before coding.
