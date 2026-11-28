# Results — vX.Y (template)

Copy this file to `results-v0.1.md` (or `results-vX.Y.md`) before scoring. Do not commit blank runs as a pass.

From 0.2 on, fill **one Runs + Per-task summary block per language cell** (TypeScript and JavaScript).

## Meta

| Field | Value |
| :--- | :--- |
| CLI version / commit | |
| Eval date | |
| Cursor model | |
| Claude model | |
| Fixture notes | |
| Owner | |

## Runs — TypeScript (`next15-src`)

One row per run. `violations` is the sum of checklist items marked 1 for the **TS** column. Put item ids (e.g. `1.2, 1.6`) in **Hit items**.

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Cursor | T1-form-server-action | with | | | |
| 2 | Cursor | T1-form-server-action | without | | | |
| 3 | Claude | T1-form-server-action | with | | | |
| 4 | Claude | T1-form-server-action | without | | | |
| 5 | Cursor | T2-ui-store | with | | | |
| 6 | Cursor | T2-ui-store | without | | | |
| 7 | Claude | T2-ui-store | with | | | |
| 8 | Claude | T2-ui-store | without | | | |
| 9 | Cursor | T3-data-hook | with | | | |
| 10 | Cursor | T3-data-hook | without | | | |
| 11 | Claude | T3-data-hook | with | | | |
| 12 | Claude | T3-data-hook | without | | | |
| 13 | Cursor | T4-refactor-rsc | with | | | |
| 14 | Cursor | T4-refactor-rsc | without | | | |
| 15 | Claude | T4-refactor-rsc | with | | | |
| 16 | Claude | T4-refactor-rsc | without | | | |
| 17 | Cursor | T5-write-tests | with | | | |
| 18 | Cursor | T5-write-tests | without | | | |
| 19 | Claude | T5-write-tests | with | | | |
| 20 | Claude | T5-write-tests | without | | | |

## Per-task summary — TypeScript

`total_with` / `total_without` = sum of the two agents' violation counts. Pass if `total_with < total_without`.

| Task | total_with | total_without | Pass? |
| :--- | ---: | ---: | :--- |
| T1-form-server-action | | | |
| T2-ui-store | | | |
| T3-data-hook | | | |
| T4-refactor-rsc | | | |
| T5-write-tests | | | |

**Tasks passed (TS):** _/ 5

## Runs — JavaScript (`next15-src-js`)

Score with the **JS** checklist column (items 1.8–1.10, 2.8–2.9, …). Omit TS-only items.

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| J1 | Cursor | T1-form-server-action | with | | | |
| J2 | Cursor | T1-form-server-action | without | | | |
| J3 | Claude | T1-form-server-action | with | | | |
| J4 | Claude | T1-form-server-action | without | | | |
| J5 | Cursor | T2-ui-store | with | | | |
| J6 | Cursor | T2-ui-store | without | | | |
| J7 | Claude | T2-ui-store | with | | | |
| J8 | Claude | T2-ui-store | without | | | |
| J9 | Cursor | T3-data-hook | with | | | |
| J10 | Cursor | T3-data-hook | without | | | |
| J11 | Claude | T3-data-hook | with | | | |
| J12 | Claude | T3-data-hook | without | | | |
| J13 | Cursor | T4-refactor-rsc | with | | | |
| J14 | Cursor | T4-refactor-rsc | without | | | |
| J15 | Claude | T4-refactor-rsc | with | | | |
| J16 | Claude | T4-refactor-rsc | without | | | |
| J17 | Cursor | T5-write-tests | with | | | |
| J18 | Cursor | T5-write-tests | without | | | |
| J19 | Claude | T5-write-tests | with | | | |
| J20 | Claude | T5-write-tests | without | | | |

## Per-task summary — JavaScript

| Task | total_with | total_without | Pass? |
| :--- | ---: | ---: | :--- |
| T1-form-server-action | | | |
| T2-ui-store | | | |
| T3-data-hook | | | |
| T4-refactor-rsc | | | |
| T5-write-tests | | | |

**Tasks passed (JS):** _/ 5

## Decision

- [ ] **Go** — each required language cell reduced violations in ≥ 4 of 5 tasks; safe to treat §8.3 as satisfied for this minor.
- [ ] **No-go** — fewer than 4 tasks passed in a required cell; revise the failing fragments, or the seed when a checklist item cannot occur, and re-run the affected cells before release.

Owner sign-off: ______________________  Date: __________
