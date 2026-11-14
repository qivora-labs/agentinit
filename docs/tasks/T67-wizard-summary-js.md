# T67 · Wizard, Summary, and Error Text for JavaScript

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T60 | T70 | §1.2–§1.6, §3.2, §3.3, §3.5 | M |

## Goal
Interactive copy, the summary card, and error strings treat JavaScript as a first-class language, including greenfield language choice and generator hints.

## Context
Promoted from `backlog.md` J5 (UI half). Today the greenfield step asks "How strict should TypeScript be?", the framework sentinel is `OTHER_TYPESCRIPT_PROJECT` / "Other TypeScript project…", the summary Language row only formats TypeScript variants, and several errors say "Run inside a TypeScript project".

T60 opens detection and types; this task owns user-visible strings and the greenfield language step. README / PRD prose polish for the release belongs with T70 where noted.

## Scope
1. **Greenfield wizard** (`src/ui/wizard.ts`, `src/ui/summary.ts`, `src/ui/catalog.ts`):
   - Replace the TypeScript-strictness-only step with a **language** choice: TypeScript Strict (recommended), TypeScript, JavaScript, and JavaScript with JSDoc (or the T59 id), matching registry names.
   - Reword "Other TypeScript project" to a language-neutral label (e.g. "Other project (library, CLI, scripts)") and rename the sentinel constant accordingly.
2. **Summary card** (`src/ui/format.ts`): Language row labels for all four ids.
3. **Errors and defaults** (`src/detect/index.ts` `NO_PACKAGE_JSON`, `src/ui/defaults.ts`, related): drop "JavaScript projects aren't supported yet"; point empty / wrong folders at "a project with package.json" or similar.
4. **Next-step generator hints** (`src/ui/next-steps.ts`): ensure greenfield hints still work when the user chose JavaScript (same generators; wording must not assume TypeScript-only scaffolding).
5. **PRD** §3.2 (wizard steps), §3.5 defaults table if the language prompt changes, and any §3.3 summary wording.
6. Update UI unit tests and screen snapshots (`pnpm test:screens` if TTY strings change).
7. Changeset: `minor` or fold into T60's user-facing minor if landing together.

## Out of scope
- Detection logic (T60).
- Fixtures, README FAQ, and acceptance-criteria PRD §8 (T70).
- Language drift (T68).

## Implementation notes
- Keep Clack hint length limits in mind (`pickerHint`).
- `--yes` greenfield still exits `1` (interactive required).
- Do not change non-TTY / `--json` machine fields except where labels appear in JSON today.

## Acceptance criteria
- [ ] Greenfield interactive flow offers the decided language options; selecting JavaScript writes `selections.language` accordingly after init.
- [ ] "Other … project" label no longer says TypeScript-only.
- [ ] Summary Language row shows correct labels for all language ids.
- [ ] No user-facing string claims JavaScript is unsupported.
- [ ] UI / screen tests updated; PRD §3.2 (and related) updated.
- [ ] A changeset exists if this PR ships user-visible copy alone.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:screens
```

## Commit
`feat(ui): support javascript in wizard and summary copy`

## Notes
(Record any label wording the owner picks during implementation.)
