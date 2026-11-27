# Results — v0.2

## Meta

| Field | Value |
| :--- | :--- |
| CLI commit (eval baselines) | `7178100` (branch `task/T75-js-effectiveness-eval`; `pnpm build` then `init --yes` on extended fixtures) |
| Eval date | 2026-11-25 |
| Cursor model | `composer-2.5-fast` (Cursor Task `generalPurpose`) |
| Claude model | `composer-2.5` (Cursor Task `generalPurpose`; Claude API stand-in — owner lacked tokens for `claude-sonnet-5-5-high`) |
| Fixture notes | **JS:** extended `next15-src-js` per README (zustand, `@tanstack/react-query`, RHF, zod, `@hookform/resolvers`, vitest + JS seeds; `checkJs` off → `javascript`). **TS:** extended `next15-src` per README (`typescript` pinned to `5.9.2`). Workdirs under `/tmp/agentinit-eval-v02/`. |
| Owner | Tajnur |

### Methodology notes

- Agents ran as isolated Cursor Task sessions against fresh copies of `with-rules` / `without-rules` baselines (node_modules symlinked from the immutable baseline).
- Framing named the workdir and forbade edits outside it and reads of `docs/evals/` or sibling runs. Prompt text matched `tasks.md` (TypeScript body or JavaScript appendix).
- Scoring used `docs/evals/checklist.md` language columns (0/1 per applicable item on files created/edited in that run).
- v0.1 TypeScript scores in [results-v0.1.md](./results-v0.1.md) are **superseded for the 0.2 gate** by the TypeScript re-run below (owner decision: re-run TS cells for 0.2).
- JS T2 with-rules cells were re-copied and re-run once; both still placed the store under `src/stores/` (same as the first pass).

### Decisions (T75)

1. **Task subset:** all five tasks, adapted to JS Next.js (`next15-src-js`).
2. **TypeScript cells:** re-run full TS matrix for 0.2; record in this file (do not treat v0.1 alone as the 0.2 TS cell).
3. **Runners:** Cursor Task stand-ins; Claude seat = `composer-2.5` (no Claude API tokens).

---

## Runs — TypeScript (`next15-src`)

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | ---: | :--- | :--- |
| 1 | Cursor | T1-form-server-action | with | 0 | — | [RHF+Zod](dffba377-58cd-493c-b812-5b6829bbb96a); typed `parseNewsletterSignup`; `features/newsletter/` |
| 2 | Cursor | T1-form-server-action | without | 0 | — | [Native form + server `safeParse`](024e002a-f9ee-4b28-9037-8233c20bb670); action typed `Promise<void>` |
| 3 | Claude | T1-form-server-action | with | 0 | — | [RHF+Zod](7fa31faf-5604-41cc-bb5f-920762d263aa); typed parse + action under `features/newsletter/` |
| 4 | Claude | T1-form-server-action | without | 0 | — | [Native form + server `safeParse`](f3e426f6-6f46-41df-9be4-51d7057cce99) |
| 5 | Cursor | T2-ui-store | with | 1 | 2.7 | [`src/stores/` + `useShallow`](1a970d2b-0d81-4035-a717-802eda07e1ec) |
| 6 | Cursor | T2-ui-store | without | 1 | 2.7 | [`src/stores/` + single-field selectors](1a5f6342-c940-4de9-a6d6-2758f08492d6) |
| 7 | Claude | T2-ui-store | with | 1 | 2.7 | [`src/stores/` + `useShallow`](df399fd0-60bf-4c8c-84e3-0aa54eade8d8) |
| 8 | Claude | T2-ui-store | without | 1 | 2.7 | [`src/stores/` + single-field selectors](58aafd9f-b3e7-479d-ab6d-6448cf722d77) |
| 9 | Cursor | T3-data-hook | with | 0 | — | [`queryOptions` + typed `usePost`](4bde7002-aedc-4c76-98e3-75a6f2a40cd9); flat `hooks/` / `utils/` / `types/` |
| 10 | Cursor | T3-data-hook | without | 2 | 3.2, 3.7 | [Inline `useQuery`](d2922e47-2de4-4b1c-b58f-5f8241e27e17); helpers under `src/api/` |
| 11 | Claude | T3-data-hook | with | 1 | 3.6 | [`queryOptions` + Suspense](9169ca9a-a81b-4a27-96f4-80d7e09c0989); `postOptions` missing return type |
| 12 | Claude | T3-data-hook | without | 3 | 3.2, 3.6, 3.7 | [Inline `useQuery`](6f69f063-622a-4441-9149-2f8d14b114ff); `usePost` untyped; `src/api/` |
| 13 | Cursor | T4-refactor-rsc | with | 0 | — | [Server `getUser` + client leaf](09701f54-b574-4d39-b850-7bcfad67dc1d) |
| 14 | Cursor | T4-refactor-rsc | without | 0 | — | [Same split + toggle leaf](914b2ce3-8328-4449-97bb-657b93c9e99a) |
| 15 | Claude | T4-refactor-rsc | with | 0 | — | [Server load + client toggle](4d22b6eb-2c45-42e6-b315-51b5608c0069) |
| 16 | Claude | T4-refactor-rsc | without | 0 | — | [Same](d375dd82-81a6-44de-bf5f-cbd318ab3ec7) |
| 17 | Cursor | T5-write-tests | with | 0 | — | [Mocks `./rates`; observable asserts only](c6869b0b-b2f0-4e10-a434-79742fe6dd17) |
| 18 | Cursor | T5-write-tests | without | 1 | 5.2 | [Asserts `mockedLoadRate` call](40db23c0-7cb9-4312-a197-69e7e3ef0bb3) |
| 19 | Claude | T5-write-tests | with | 0 | — | [Clean Vitest suite](63e6aefa-403c-418d-8d21-cb1ccb8d9b1f) |
| 20 | Claude | T5-write-tests | without | 1 | 5.2 | [`toHaveBeenCalledOnce` on `loadRate`](cf00f097-e368-4ab9-9723-8709c2e36887) |

## Per-task summary — TypeScript

| Task | total_with | total_without | Pass? |
| :--- | ---: | ---: | :--- |
| T1-form-server-action | 0 | 0 | no (tie) |
| T2-ui-store | 2 | 2 | no (tie) |
| T3-data-hook | 1 | 5 | yes |
| T4-refactor-rsc | 0 | 0 | no (tie) |
| T5-write-tests | 0 | 2 | yes |

**Tasks passed (TS):** 2 / 5

---

## Runs — JavaScript (`next15-src-js`)

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | ---: | :--- | :--- |
| J1 | Cursor | T1-form-server-action | with | 0 | — | [RHF+Zod](3cf33dee-bd53-498e-8ca4-2e775cc53af7); server `parseNewsletterSignup`; `features/newsletter/`; no TS syntax |
| J2 | Cursor | T1-form-server-action | without | 0 | — | [Native form + server `safeParse`](c062d1ae-0ba2-4ee0-8228-a81cb5ca24a1) |
| J3 | Claude | T1-form-server-action | with | 0 | — | [RHF+Zod](12c52ab8-0a75-421c-a305-8491af450e59); server parse under `features/newsletter/` |
| J4 | Claude | T1-form-server-action | without | 0 | — | [Native form + server `safeParse`](15ef62df-8603-4037-ba43-c06a0ae233d8) |
| J5 | Cursor | T2-ui-store | with | 1 | 2.7 | [`src/stores/` + `useShallow`](46893cf0-beb7-4ce0-b9ac-8805c9230d76) (re-run) |
| J6 | Cursor | T2-ui-store | without | 1 | 2.7 | [`src/stores/` + single-field selectors](09df42e4-05ea-4960-be6a-61d4f0708738) |
| J7 | Claude | T2-ui-store | with | 1 | 2.7 | [`src/stores/` + `useShallow`](457bcd4a-ab2c-413c-a6ef-d85cf2d2ce32) (re-run) |
| J8 | Claude | T2-ui-store | without | 1 | 2.7 | [`src/stores/` + single-field selectors](bfe78d82-9559-472b-87e9-786d98a665b2) |
| J9 | Cursor | T3-data-hook | with | 0 | — | [`queryOptions` + Suspense](cf2c4e66-b37c-4948-963a-eff985f74d01); runtime `parsePost`; flat paths |
| J10 | Cursor | T3-data-hook | without | 3 | 3.2, 3.7, 3.9 | [Inline `useQuery`](d1e5f134-d094-45a3-91c3-a50183cee11a); `src/lib/`; unchecked `response.json()` |
| J11 | Claude | T3-data-hook | with | 0 | — | [`queryOptions` + Suspense](506a356b-0c9b-465d-803c-fb3bc5d20c59); runtime check |
| J12 | Claude | T3-data-hook | without | 3 | 3.2, 3.7, 3.9 | [Inline `useQuery`](dc4155b1-ad29-4b4f-aa96-8942dc74efab); `src/providers/`; unchecked JSON |
| J13 | Cursor | T4-refactor-rsc | with | 0 | — | [Server fetch + client toggle](ad275a9f-bd81-4a41-8b99-aa33816db2a1) |
| J14 | Cursor | T4-refactor-rsc | without | 0 | — | [Same split](b121f537-7fd3-4767-b573-260e63444214) |
| J15 | Claude | T4-refactor-rsc | with | 0 | — | [Same](f77ae2bc-d13d-4786-9275-42e943468ad5) |
| J16 | Claude | T4-refactor-rsc | without | 0 | — | [Same](59a34696-c6b7-4cbf-b25f-88eabc33b65e) |
| J17 | Cursor | T5-write-tests | with | 0 | — | [Mocks `./rates`; observable asserts](97516d31-4e49-4736-8b39-31deaed7725d) |
| J18 | Cursor | T5-write-tests | without | 1 | 5.2 | [`toHaveBeenCalledOnce` on `loadRate`](aedebb5d-795d-4759-b707-764c09660849) |
| J19 | Claude | T5-write-tests | with | 0 | — | [Clean Vitest suite](7a665678-0a3d-49a3-8723-40b7525886c9) |
| J20 | Claude | T5-write-tests | without | 1 | 5.2 | [`toHaveBeenCalled` on `loadRate`](be7b5f67-2b70-424a-ba44-2f72a82ceba8) |

## Per-task summary — JavaScript

| Task | total_with | total_without | Pass? |
| :--- | ---: | ---: | :--- |
| T1-form-server-action | 0 | 0 | no (tie) |
| T2-ui-store | 2 | 2 | no (tie) |
| T3-data-hook | 0 | 6 | yes |
| T4-refactor-rsc | 0 | 0 | no (tie) |
| T5-write-tests | 0 | 2 | yes |

**Tasks passed (JS):** 2 / 5

---

## Decision (initial — superseded)

- [ ] **Go**
- [x] **No-go** — initial matrix 2 / 5 per language cell. See addendum.

Owner sign-off (initial): Tajnur — accepted recorded scores and **no-go**. Date: 2026-11-25.

### Failure analysis (initial)

| Task | Issue |
| :--- | :--- |
| T1 (both) | Tie at 0/0. Instrument gap. |
| T2 (both) | Tie on **2.7** (`src/stores/`). Zustand globs vs `flat`. |
| T4 (both) | Tie at 0/0. Instrument gap. |

---

## Addendum — T1 + T2 + T4 re-run (2026-11-27)

**Fragment change:** `zustand` `1.4.0` and `flat` `1.2.0` — place new client stores under `features/` / `components/`; do not add top-level `stores/` or `lib/` for new files. Globs are not a folder mandate.

**Instrument change:** incomplete newsletter seeds (client page + `register` rules + unvalidated action); T4 seeds mark the route `'use client'`, skip `await params`, and import `src/lib/users-api` (secret) from the client panel. Prompts updated to “finish / refactor including helpers.”

Baselines rebuilt after `pnpm build` + `init --yes` on extended fixtures with new seeds. Workdirs under `/tmp/agentinit-eval-v02/runs-rerun/`. Same models as Meta.

### TypeScript re-run

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | ---: | :--- | :--- |
| A1 | Cursor | T1-form-server-action | with | 0 | — | [Server page + RHF/Zod form](bcc2f478-d985-4b0a-8661-a54666ec5358); schema + typed action |
| A2 | Cursor | T1-form-server-action | without | 1 | 1.1 | [Page remains `'use client'`](c2419bad-92ae-4a5a-aefb-b9e5d0103192) |
| A3 | Claude | T1-form-server-action | with | 0 | — | [Server page + client form](d720676e-7866-493c-9bc6-6cafd95ef967) |
| A4 | Claude | T1-form-server-action | without | 1 | 1.1 | [Page remains `'use client'`](838a6bc2-a632-43e0-ae9d-d88fdb336022) |
| A5 | Cursor | T2-ui-store | with | 0 | — | [`features/shell/sidebar.store.ts`](0a4c3784-b85f-49a1-9fd2-e318909636a4) |
| A6 | Cursor | T2-ui-store | without | 1 | 2.7 | [`src/stores/`](f943a1c9-8df7-41f7-97e0-00ce7b8318d3) |
| A7 | Claude | T2-ui-store | with | 0 | — | [`features/shell/sidebar.store.ts`](f342d69d-be78-42c1-9dff-296a79442f8d) |
| A8 | Claude | T2-ui-store | without | 1 | 2.7 | [`src/stores/`](558e6eb6-6348-4486-938c-13f9ceb55408) |
| A9 | Cursor | T4-refactor-rsc | with | 0 | — | [Server load + `await params`; client leaf](4b737a97-83bc-4737-92ee-8d8e2490a13c) |
| A10 | Cursor | T4-refactor-rsc | without | 1 | 4.3 | [Server load but `params` not a Promise / not awaited](becf2ebd-dd43-42e6-82c5-1cfdb142a82e) |
| A11 | Claude | T4-refactor-rsc | with | 0 | — | [Same correct split](53a89084-912e-448c-a26a-9c4af8b97b87) |
| A12 | Claude | T4-refactor-rsc | without | 1 | 4.3 | [`params.id` without `await`](3ea9370e-5682-4782-9239-b254b3363e40) |

| Task | total_with | total_without | Pass? | Source |
| :--- | ---: | ---: | :--- | :--- |
| T1-form-server-action | 0 | 2 | yes | addendum |
| T2-ui-store | 0 | 2 | yes | addendum |
| T3-data-hook | 1 | 5 | yes | initial |
| T4-refactor-rsc | 0 | 2 | yes | addendum |
| T5-write-tests | 0 | 2 | yes | initial |

**Tasks passed (TS, final):** 5 / 5

### JavaScript re-run

| Run | Agent | Task | Rules | Violations | Hit items | Notes |
| :--- | :--- | :--- | :--- | ---: | :--- | :--- |
| JA1 | Cursor | T1-form-server-action | with | 0 | — | [Server page + client form + Zod](aecc7bf3-607f-4825-bd29-59a7677d0d94) |
| JA2 | Cursor | T1-form-server-action | without | 2 | 1.1, 1.7 | [Page `'use client'`; schema in `src/lib/`](a3f45716-fef8-41de-8223-9e7ed03c45fd) |
| JA3 | Claude | T1-form-server-action | with | 0 | — | [Server page + client form](7af295cb-dddd-49df-8b0a-b503d0e163d4) |
| JA4 | Claude | T1-form-server-action | without | 1 | 1.1 | [Page `'use client'`](56101d50-d054-48e1-927c-aacbca7702e8) |
| JA5 | Cursor | T2-ui-store | with | 0 | — | [`components/sidebar.store.js`](ae5fbca7-ab47-473c-b6d9-7c0580e7cddf) |
| JA6 | Cursor | T2-ui-store | without | 1 | 2.7 | [`src/stores/`](37233807-4c13-4176-b8c8-f69b1761a2b4) |
| JA7 | Claude | T2-ui-store | with | 0 | — | [`components/sidebar.store.js`](b1d8ba89-e9d6-4a8c-9c44-646258fc8bf3) |
| JA8 | Claude | T2-ui-store | without | 1 | 2.7 | [`src/stores/`](587abf60-407e-41d8-8e3a-a10949ba6661) |
| JA9 | Cursor | T4-refactor-rsc | with | 0 | — | [Correct RSC split](8e8e6282-cf0a-4356-9f91-4cad94a382f1) |
| JA10 | Cursor | T4-refactor-rsc | without | 0 | — | [Same](18e13ff7-dfbb-490d-9b63-b25641e1d8de) |
| JA11 | Claude | T4-refactor-rsc | with | 0 | — | [Same](9810e0eb-d7d4-4bb8-9091-af594cb70228) |
| JA12 | Claude | T4-refactor-rsc | without | 0 | — | [Same](2fa807ab-fd76-4c1b-9e82-9e9c3807b7f5) |

| Task | total_with | total_without | Pass? | Source |
| :--- | ---: | ---: | :--- | :--- |
| T1-form-server-action | 0 | 3 | yes | addendum |
| T2-ui-store | 0 | 2 | yes | addendum |
| T3-data-hook | 0 | 6 | yes | initial |
| T4-refactor-rsc | 0 | 0 | no (tie) | addendum |
| T5-write-tests | 0 | 2 | yes | initial |

**Tasks passed (JS, final):** 4 / 5 — T4 still ties (both baselines complete a correct RSC split on JS).

### Post-go instrument note (2026-11-28)

JS T4 seed/prompt in [tasks.md](./tasks.md) now also inlines the API key in the client panel so a half-finished refactor can still score **4.4**. That change is for **future minors**; the v0.2 go above used the pre-inline seed and was not re-run.

## Decision (final)

- [x] **Go** — each required language cell reduced violations in ≥ 4 of 5 tasks; safe to treat §8.3 as satisfied for this minor.
- [ ] **No-go**

Owner sign-off: Tajnur — accepted addendum scores and **go** for 0.2 §8.3 (agent-run matrix; Claude seat = `composer-2.5`). Date: 2026-11-27.
