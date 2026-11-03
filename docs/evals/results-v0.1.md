# Results — v0.1

## Meta

| Field | Value |
| :--- | :--- |
| CLI version / commit | `49f7f7a` (`docs: add rule-effectiveness eval materials`) |
| Eval date | 2026-11-03 |
| Cursor model | `composer-2.5-fast` (Cursor Task generalPurpose stand-in for Composer/Agent) |
| Claude model | `claude-sonnet-5-5-high` (Cursor Task stand-in; Claude Code CLI not installed on the eval host) |
| Fixture notes | Extended `next15-src` per README (zustand, `@tanstack/react-query`, RHF, zod, `@hookform/resolvers`, vitest + seed files). Workdirs under `/tmp/agentinit-eval-v01/`. |
| Owner | Tajnur (run executed by agent on owner’s behalf) |

### Methodology notes

- Agents ran as isolated Cursor Task sessions against fresh copies of `with-rules` / `without-rules` baselines.
- Prompt text matched `tasks.md`. Framing only named the workdir and forbade edits outside it.
- [T3 Cursor without](8f65bb2b-ee08-48ae-b863-f3e6bf9d8b95) read `docs/evals/` and a sibling run mid-session; that workdir was reset and re-run as [T3 Cursor without fresh](89650369-ad82-4f43-b8c7-51a58d0fec04). The re-run artifact was scored.
- Scoring used `docs/evals/checklist.md` (0/1 per item on files created/edited in that run).

## Runs

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Cursor | T1-form-server-action | with | 1 | 1.5 | RHF+Zod + server `safeParse`; `parseNewsletter` exported without return type |
| 2 | Cursor | T1-form-server-action | without | 0 | — | Same shape as with-rules; `parseNewsletter` has explicit return type |
| 3 | Claude | T1-form-server-action | with | 1 | 1.5 | Same as Cursor with; `parseNewsletter` missing return type |
| 4 | Claude | T1-form-server-action | without | 1 | 1.5 | `useActionState` + Zod in action; `NewsletterPage` / `NewsletterForm` missing return types |
| 5 | Cursor | T2-ui-store | with | 0 | — | Feature store + single-field selectors |
| 6 | Cursor | T2-ui-store | without | 0 | — | `src/stores/` + single-field selectors |
| 7 | Claude | T2-ui-store | with | 0 | — | Feature store + single-field selectors |
| 8 | Claude | T2-ui-store | without | 1 | 2.6 | Clean store; `SidebarToggle` missing exported return type |
| 9 | Cursor | T3-data-hook | with | 0 | — | `postKeys` + `queryOptions` + `useSuspenseQuery` under Suspense |
| 10 | Cursor | T3-data-hook | without | 2 | 3.2, 3.6 | Inline `useQuery` (no `queryOptions`); demo/provider missing return types |
| 11 | Claude | T3-data-hook | with | 1 | 3.6 | Full Query pattern under `features/posts/`; `postOptions` missing return type |
| 12 | Claude | T3-data-hook | without | 2 | 3.2, 3.6 | Inline `useQuery`; `PostDemo` / `PostTitle` missing return types |
| 13 | Cursor | T4-refactor-rsc | with | 0 | — | Async page `await`s params; client leaf only toggles |
| 14 | Cursor | T4-refactor-rsc | without | 0 | — | Same split as with-rules |
| 15 | Claude | T4-refactor-rsc | with | 0 | — | Server `getUser` + client leaf |
| 16 | Claude | T4-refactor-rsc | without | 1 | 4.6 | Correct RSC split; `UserPage` / `UserPanel` missing return types |
| 17 | Cursor | T5-write-tests | with | 0 | — | Colocated Vitest; observable names; no mocks of unit |
| 18 | Cursor | T5-write-tests | without | 0 | — | Same; broader edge-case characterization |
| 19 | Claude | T5-write-tests | with | 0 | — | Clean Vitest suite |
| 20 | Claude | T5-write-tests | without | 0 | — | Clean Vitest suite |

## Per-task summary (initial run)

| Task | total_with | total_without | Pass? |
| :--- | ---: | ---: | :--- |
| T1-form-server-action | 2 | 1 | no (with higher) |
| T2-ui-store | 0 | 1 | yes |
| T3-data-hook | 1 | 4 | yes |
| T4-refactor-rsc | 0 | 1 | yes |
| T5-write-tests | 0 | 0 | no (tie) |

**Tasks passed (initial):** 3 / 5 → no-go; see addendum.

## Addendum — T1 + T5 re-run (2026-11-03)

After `fix(registry): tighten typescript-strict…` (`18bdb96`) and `docs(evals): harden T5 seed…` (`e5be72d`). Workdirs under `/tmp/agentinit-eval-v01-rerun/`. Same agent models as Meta.

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Cursor | T1-form-server-action | with | 0 | — | RHF+Zod; `parseNewsletterSignup` has explicit return type |
| R2 | Cursor | T1-form-server-action | without | 1 | 1.5 | Native form + server `safeParse`; `NewsletterPage` missing return type |
| R3 | Claude | T1-form-server-action | with | 0 | — | RHF+Zod; `parseNewsletter` typed |
| R4 | Claude | T1-form-server-action | without | 0 | — | `useActionState` + Zod; exports typed |
| R5 | Cursor | T5-write-tests | with | 0 | — | Mocks `./rates`; asserts only `cartTotal` results |
| R6 | Cursor | T5-write-tests | without | 1 | 5.2 | Mocks `./rates` but asserts `loadRateMock` call counts |
| R7 | Claude | T5-write-tests | with | 0 | — | Mocks `./rates`; observable assertions only |
| R8 | Claude | T5-write-tests | without | 2 | 5.1, 5.2 | Test named `loads the rate once…` + `toHaveBeenCalledTimes` |

### Per-task summary (final)

| Task | total_with | total_without | Pass? | Source |
| :--- | ---: | ---: | :--- | :--- |
| T1-form-server-action | 0 | 1 | yes | re-run |
| T2-ui-store | 0 | 1 | yes | initial |
| T3-data-hook | 1 | 4 | yes | initial |
| T4-refactor-rsc | 0 | 1 | yes | initial |
| T5-write-tests | 0 | 3 | yes | re-run |

**Tasks passed:** 5 / 5

## Decision

- [x] **Go** — violations reduced in ≥ 4 of 5 tasks; safe to treat §8.3 as satisfied for this minor.
- [ ] **No-go** — fewer than 4 tasks passed; revise fragments and re-run affected cells before release.

Caveat: Cursor/Claude cells used Task stand-ins (`composer-2.5-fast`, `claude-sonnet-5-5-high`), not Cursor Agent UI / Claude Code CLI. Accept for v0.1 or spot-check on real products before launch.

Owner sign-off: Tajnur (agent-assisted)  Date: 2026-11-03
