# Results — v0.1

## Meta

| Field | Value |
| :--- | :--- |
| CLI commit (initial 20) | `49f7f7a` (`docs: add rule-effectiveness eval materials`) |
| CLI commit (T1+T5 re-run) | `de4db2f` (includes `18bdb96`, the `typescript-strict` return-type tightening) |
| CLI commit (T45 T1/T3/T4 re-run) | `c8d32da` (includes `f5b76ca`, the T45 `typescript-strict` 1.1.0 component/entry exemption) |
| Eval date | 2026-11-03 (initial + T1/T5); 2026-11-11 (T45 T1/T3/T4) |
| Cursor model | `composer-2.5-fast` (Cursor Task `generalPurpose`) |
| Claude model | `claude-sonnet-5-5-high` (Cursor Task `generalPurpose`; Claude Code was not installed) |
| Fixture notes | Extended `next15-src` per README (zustand, `@tanstack/react-query`, RHF, zod, `@hookform/resolvers`, vitest + seed files). Initial workdirs under `/tmp/agentinit-eval-v01/`. T45 re-run under `/tmp/agentinit-eval-t45/` (`typescript` pinned to `5.9.2` because `5.9.0` is unpublished on npm). |
| Owner | Tajnur |

### Methodology notes

- Agents ran as isolated Cursor Task sessions against fresh copies of `with-rules` / `without-rules` baselines.
- Prompt text matched `tasks.md`. Framing only named the workdir and forbade edits outside it.
- [T3 Cursor without](8f65bb2b-ee08-48ae-b863-f3e6bf9d8b95) read `docs/evals/` and a sibling run mid-session; that workdir was reset and re-run as [T3 Cursor without fresh](89650369-ad82-4f43-b8c7-51a58d0fec04). The re-run artifact was scored.
- Scoring used `docs/evals/checklist.md` (0/1 per item on files created/edited in that run).
- Reproduce re-run baselines from `de4db2f` (or any later commit that still contains `18bdb96`'s registry change), then `pnpm build` and `init --yes`. Docs commits after `de4db2f` (`ed3727f`, `b7361bb`, …) do not change generated rules; do not assume HEAD alone identifies the CLI snapshot.
- After scoring, `tasks.md` / README were tightened for Next 16 `params: Promise<…>`, `@/` `paths`, `vitest.config.ts`, and deleting `CLAUDE.md` in `without-rules`. Recorded runs used the pre-fix seed and procedure.

## Runs

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Cursor | T1-form-server-action | with | 1 | 1.5 | RHF+Zod + server `safeParse`; `parseNewsletter` exported without return type |
| 2 | Cursor | T1-form-server-action | without | 0 | — | Same shape as with-rules; `parseNewsletter` has explicit return type |
| 3 | Claude | T1-form-server-action | with | 1 | 1.5 | Same as Cursor with; `parseNewsletter` missing return type |
| 4 | Claude | T1-form-server-action | without | 1 | 1.5 | `useActionState` + Zod in action; `NewsletterPage` / `NewsletterForm` missing return types |
| 5 | Cursor | T2-ui-store | with | 0 | — | Feature store + single-field selectors |
| 6 | Cursor | T2-ui-store | without | 1 | 2.7 | `src/stores/` is outside the flat layout; single-field selectors. Rescored when 2.7 was aligned with `flat` |
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
| T2-ui-store | 0 | 2 | yes |
| T3-data-hook | 1 | 4 | yes |
| T4-refactor-rsc | 0 | 1 | yes |
| T5-write-tests | 0 | 0 | no (tie) |

**Tasks passed (initial):** 3 / 5 → no-go; see addendum.

## Addendum — T1 + T5 re-run (2026-11-03)

Baselines were rebuilt at `de4db2f` (registry change from `18bdb96`). Docs commits after that (`ed3727f`, `b7361bb`, …) record scores and procedure only — regenerate from `de4db2f` (or later with the same registry text), not from “whatever HEAD is today” if HEAD has moved past unrelated docs. From the repo: `pnpm build`, then `node dist/cli.js init --yes` on a fresh extended fixture. The with-rules `AGENTS.md` included the tightened return-type directive (`parse*`, `safeParse` wrappers, schema mappers, and React components). The without-rules baseline had generated agent files removed, including `CLAUDE.md`.

T1’s follow-up is that fragment change. T5’s follow-up is an instrument change: `src/utils/rates.ts` (`loadRate`) plus a prompt that names the dependency. The vitest fragment was not edited. The original T5 seed had no dependency, so checklist items 5.1 and 5.2 could not occur. Workdirs under `/tmp/agentinit-eval-v01-rerun/`. Same models as Meta.

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

### Per-task summary (after T1+T5 re-run; superseded for T1/T3/T4 by T45 addendum)

| Task | total_with | total_without | Pass? | Source |
| :--- | ---: | ---: | :--- | :--- |
| T1-form-server-action | 0 | 1 | yes | re-run |
| T2-ui-store | 0 | 2 | yes | initial |
| T3-data-hook | 1 | 4 | yes | initial |
| T4-refactor-rsc | 0 | 1 | yes | initial |
| T5-write-tests | 0 | 3 | yes | re-run |

**Tasks passed (pre-T45):** 5 / 5

## Addendum — T1 + T3 + T4 re-run after T45 (2026-11-11)

T45 decision B softened `typescript-strict` so React components and framework entry files (`page`, `layout`, route handlers) may omit return types (`f5b76ca`, fragment `1.1.0`). That invalidates return-type checklist hits on those shapes, so cells T1, T3, and T4 were re-run. Baselines rebuilt at `c8d32da` (`pnpm build`, then `init --yes` on a fresh extended fixture). Workdirs under `/tmp/agentinit-eval-t45/`. Same models as Meta. Scoring applied the post-T45 exception for items 1.5 / 3.6 / 4.6.

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | ---: | :--- | :--- |
| T45-1 | Cursor | T1-form-server-action | with | 0 | — | [RHF+Zod](1ca0707b-1e3f-4572-9c39-1a0150ebfa7e); typed `parse*` + action; under `features/newsletter/` |
| T45-2 | Cursor | T1-form-server-action | without | 1 | 1.7 | [Native form + server `safeParse`](ab923866-ddd3-4fbb-9f8f-5be46963f884); schema in `src/lib/` |
| T45-3 | Claude | T1-form-server-action | with | 0 | — | [RHF+Zod](78df5be8-eb86-409b-af63-d28b96914ee3); typed `parse*` + action; under `features/newsletter/` |
| T45-4 | Claude | T1-form-server-action | without | 0 | — | [`useActionState` + Zod](a5e229c3-de0f-4d42-ad05-dc1fc08beaf5); action typed; components exempt |
| T45-5 | Cursor | T3-data-hook | with | 1 | 3.7 | [`queryOptions` + Suspense](eaa72421-4979-4991-be62-4c9f705c705f); helpers under `src/queries/` |
| T45-6 | Cursor | T3-data-hook | without | 3 | 3.2, 3.6, 3.7 | [Inline `useQuery`](ad630846-4fce-408a-a536-1cfe34c3440e); `usePost` untyped; `src/lib/` + `src/providers/` |
| T45-7 | Claude | T3-data-hook | with | 0 | — | [`queryOptions` + Suspense under `features/posts/`](cdca13c0-0d74-4776-aac7-916885e7fb95) |
| T45-8 | Claude | T3-data-hook | without | 2 | 3.2, 3.6 | [Inline `useQuery`](ee68b4f1-6849-4034-b96b-beca3c1ebe0e); `usePost` missing return type |
| T45-9 | Cursor | T4-refactor-rsc | with | 0 | — | [Server load + client toggle leaf](2b5845d3-9f87-4f64-ba17-2831448db7b0) |
| T45-10 | Cursor | T4-refactor-rsc | without | 0 | — | [Same split](c3bdf3dd-8a93-4bc0-b7c1-5bd86fd0f35c); prior 4.6 hits were component return types (now exempt) |
| T45-11 | Claude | T4-refactor-rsc | with | 0 | — | [Server `getUser` + client leaf](704571e9-1cee-4647-8c66-c2fd99ed028b) |
| T45-12 | Claude | T4-refactor-rsc | without | 0 | — | [Same](760bde06-8a8e-45c1-a382-05510cb0b876); `getUser` typed; components exempt |

### Per-task summary (final)

| Task | total_with | total_without | Pass? | Source |
| :--- | ---: | ---: | :--- | :--- |
| T1-form-server-action | 0 | 1 | yes | T45 re-run |
| T2-ui-store | 0 | 2 | yes | initial |
| T3-data-hook | 1 | 5 | yes | T45 re-run |
| T4-refactor-rsc | 0 | 0 | no (tie) | T45 re-run |
| T5-write-tests | 0 | 3 | yes | T1+T5 re-run |

**Tasks passed:** 4 / 5 — T4 ties after the return-type exemption removes the only prior without-rules hits on that task.

## Decision

- [x] **Go** — violations reduced in ≥ 4 of 5 tasks; safe to treat §8.3 as satisfied for this minor.
- [ ] **No-go** — fewer than 4 tasks passed; revise the failing fragments, or the seed when a checklist item cannot occur, and re-run the affected cells before release.

v0.1 uses the Task stand-ins in Meta (`composer-2.5-fast` for Cursor, `claude-sonnet-5-5-high` for Claude). Later minors keep that pair. Claude Code was not installed on the eval host.

Owner sign-off: Tajnur — accepted the v0.1 stand-in pair and the recorded scores. Date: 2026-11-03. T45 T1/T3/T4 re-run recorded 2026-11-11 (still go at 4/5).
