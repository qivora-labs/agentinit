# T68 · Language Change Check

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T60 | T70 | §3.4, §3.5, §6.5 | S–M |

## Goal
When a project moves between the JavaScript and TypeScript language families, `init` and `doctor` report it. Strictness and JSDoc stay preferences and are not compared.

## Context
New for 0.2 (approved 2026-11-13). `draftWithSavedSelections` in `src/ui/saved-selection.ts` always keeps the saved language. `selectionsMatchDetection` compares frameworks and libraries only. After T60, a JavaScript project that adds TypeScript would keep `.js`-only globs (once T61 lands) and JavaScript language rules, with no notice.

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **What counts as a change.** Recommended: compare **language family** only — `{typescript, typescript-strict}` vs `{javascript, javascript-jsdoc}` (use the final T59 id). Switching `typescript` ↔ `typescript-strict` or `javascript` ↔ `javascript-jsdoc` is not a drift event.
2. **`doctor` severity.** Recommended: **error** (exit `2`), new issue kind (e.g. `language-changed`), fix text tells the user to re-run `init`. Alternative: warning only.
3. **`init --yes` behavior.** Recommended: **switch to the detected family** (keeping the detected default id for that family, e.g. `typescript-strict` or `javascript-jsdoc` when `checkJs`), print a notice, and regenerate. That way the fix `doctor` names works without prompts. Alternative: keep the saved language and only warn (leaves broken globs until Customize).
4. **Interactive `init`.** Recommended: show the mismatch on the summary / change list and let *Use this configuration* adopt detection defaults for language; *Customize* can override.

## Scope
1. **Family helper** (pure, shared by UI and doctor): map `Language` → `'typescript' | 'javascript'`.
2. **`init` re-run** (`src/commands/init.ts`, `src/ui/saved-selection.ts`): detect family mismatch; apply decision 3/4; include a line in the selection-change / summary output.
3. **`doctor`** (`src/doctor/checks.ts`, `src/commands/doctor.ts`): when manifest language family ≠ detected family, emit the new issue kind. Add to `DOCTOR_ISSUE_KINDS`, severity table, TTY groups, and `--json`.
4. **PRD** §3.4, §3.5, §6.5 (new kind + severity).
5. **CONTRIBUTING** Compatibility: note the new `--json` issue kind (minor-release break for consumers that exhaust kinds).
6. Tests for JS→TS and TS→JS; no issue when only strictness flips.
7. Add a `minor` changeset with a note that `--json` / doctor kinds gained a value.

## Out of scope
- Saving `allowJs` / `checkJs` in the manifest.
- Module system drift (T69 / P2.4).
- Changing how excluded fragments work.

## Implementation notes
- Detection already produces a suggested language; compare that to `manifest.selections.language`.
- Keep `doctor/checks.ts` pure: pass detected + saved language in.
- Screen snapshots if TTY doctor output gains a row.

## Acceptance criteria
- [x] Decisions recorded under **Notes**, and the PRD updated.
- [x] Manifest `javascript`, project now has `tsconfig.json`: `doctor` exits `2` with the new kind; `init --yes` follows decision 3.
- [x] Manifest `typescript-strict`, project still TypeScript but `strict` false: no language-change issue.
- [x] `--json` includes the new kind with `severity` per decision 2.
- [x] A `minor` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(doctor): report language family changes between javascript and typescript`

## Notes
Owner confirmed recommendations (2026-11-22):
1. Compare **language family** only (`typescript`/`typescript-strict` vs `javascript`/`javascript-jsdoc`).
2. Doctor kind **`language-changed`**, severity **error** (exit `2`), fix: re-run `init`.
3. `init --yes` switches to the detected family default id, prints a notice, regenerates.
4. Interactive re-run lists the mismatch; *Use this configuration* adopts detection language; *Customize* can override.

Mapped `language-changed` under the existing `detected-packages` TTY checklist row (no new checklist id / screen snapshot).
