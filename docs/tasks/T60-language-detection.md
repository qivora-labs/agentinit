# T60 · Language Detection Replaces the TypeScript Gate

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T59 | T61, T67, T68 | §1.6, §3.3 step 1, §3.5, §4.3, §6.2, §8.1 | M |

## Goal
A project without TypeScript is accepted as JavaScript. Detection records the facts later tasks need for globs, examples, language selection, and the module-system line.

## Context
Promoted from `backlog.md` J1. Today `assertTypeScriptProject` in `src/detect/typescript.ts` exits `1` for a project with no `tsconfig.json` and no `typescript` dependency. `Language` is a closed union in `src/types.ts`, the manifest schema, `asLanguage` in `init.ts`, and several UI modules. `detectSrcDir` counts only `.ts` / `.tsx`, so a JavaScript `src/` is read as a root layout.

T57 already makes older CLIs answer with the upgrade message when they see a newer `selections.language` value. This task is the first to write those values.

A JavaScript-only project changing from exit `1` to exit `0` is an exit-code break and needs a `minor` changeset with a `BREAKING CHANGE` note (`CONTRIBUTING.md` Compatibility).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Profile facts.** Recommended: extend `ProjectProfile` (or an adjacent detection type that plan receives) with `allowJs: boolean`, `checkJs: boolean`, and a module-system fact (`'esm' | 'cjs' | null` or similar). Facts are **re-detected every run**, not saved in the manifest. Saving them would freeze conventions and make `doctor` report drift when `package.json` `type` changes; that belongs to backlog P2.4 later.
2. **Closed language set.** Recommended: keep `selections.language` as a closed enum that now includes the two JavaScript ids from T59. Do not accept any kebab-case id from the registry (deferred from T57).
3. **TypeScript vs JavaScript.** Recommended: language is TypeScript when `tsconfig.json` or a `typescript` dependency exists (as today), otherwise `javascript`. A project with `tsconfig.json` that only enables `checkJs` stays TypeScript. Suggest `javascript-jsdoc` (or the T59 id) when `checkJs` is on and there is no TypeScript; otherwise `javascript`. Strictness / JSDoc remain customizable in *Customize*.

## Scope
1. **Types** (`src/types.ts`): widen `Language` with the two JavaScript ids. Add the new profile fields from decision 1.
2. **Detection** (`src/detect/`):
   - Replace `assertTypeScriptProject` with language detection. Monorepo root still exits `1` before this step.
   - Read `jsconfig.json` for `paths` and `checkJs` when no `tsconfig.json` (or merge rules you document). Read `allowJs` / `checkJs` from tsconfig when present. Read `package.json` `type` for the module-system fact (T69 may refine how frameworks override this).
   - `detectSrcDir`: also count `.js`, `.jsx`, `.mjs`, and `.cjs` as source files (declaration files still do not count).
3. **Manifest** (`src/io/manifest.ts`): accept the new language values. Older 0.1.2 readers already get the T57 upgrade path.
4. **`asLanguage` and UI allowlists** (`src/commands/init.ts`, `src/ui/catalog.ts`, `src/ui/format.ts`, `src/ui/saved-selection.ts`, `src/ui/defaults.ts`): recognize the new ids. Summary language row can stay a short label until T67 rewords copy.
5. **Greenfield / `--yes`**: JavaScript projects are allowed. Greenfield wizard language step is T67; with `--yes` on greenfield, still exit `1` (interactive required). Existing JavaScript with `--yes` uses detected language defaults.
6. **PRD**: §1.6 (drop "JavaScript-only … in v0.1"), §3.3 step 1, §3.5, §4.3 (`ProjectProfile`), §6.2 (new closed values), §8.1 (acceptance: JavaScript exits `0`).
7. Add a **`minor`** changeset with a `BREAKING CHANGE` note: JavaScript-only projects exit `0` and write rules; `selections.language` may be `javascript` or `javascript-jsdoc`.

## Out of scope
- Language-aware glob expansion (T61).
- Per-language Contract examples (T62–T66).
- Wizard copy and "Other TypeScript project" rewording (T67).
- Language family drift check (T68).
- Module-system placeholder in fragments (T69).
- Changing the `js-only` fixture from rejected to accepted in e2e snapshots (T70); unit tests for detection belong here.

## Implementation notes
- Detection stays read-only. Prefer extending `src/detect/typescript.ts` or renaming it to a language module rather than scattering readers.
- `Language` touches seven places listed in the plan; grep for `typescript-strict` and `asLanguage` before finishing.
- Keep purity boundaries: plan and targets receive facts on the profile; they never read disk.
- Output for TypeScript projects without `allowJs` must stay byte-identical until T61/T62 change rendering.

## Acceptance criteria
- [ ] Decisions recorded under **Notes**, and the PRD updated.
- [ ] A project with only `package.json` and `.js` files: `init --yes` exits `0`, selects `javascript`, and writes files. Suggested language is `javascript-jsdoc` when `checkJs` is on.
- [ ] A TypeScript project behaves as before (same language id, same `srcDir` when only `.ts` / `.tsx` exist).
- [ ] A JavaScript project with `src/index.js` gets `srcDir: 'src'`.
- [ ] Manifest round-trips the new language values; a 0.1.2 CLI against that manifest still shows the upgrade message (covered by T57; spot-check).
- [ ] A `minor` changeset with a `BREAKING CHANGE` note exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(detect): accept javascript projects and record language facts`

## Notes
Owner decisions from planning (2026-11-13): closed language set; facts re-detected; confirm before coding.
