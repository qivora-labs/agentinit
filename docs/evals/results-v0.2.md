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

## Decision

- [ ] **Go** — each required language cell reduced violations in ≥ 4 of 5 tasks; safe to treat §8.3 as satisfied for this minor.
- [x] **No-go** — fewer than 4 tasks passed in a required cell; revise the failing fragments, or the seed when a checklist item cannot occur, and re-run the affected cells before release.

**Blocks T76** until each language cell reaches ≥ 4 / 5.

### Failure analysis (for follow-up)

| Task | Issue |
| :--- | :--- |
| T1 (both) | Tie at 0/0. Without-rules agents still used Zod `safeParse` (deps present). JS language items (TS-in-`.js`, module mix) did not occur. Instrument gap more than fragment failure. |
| T2 (both) | Tie: every cell put the store under `src/stores/` (**2.7**). With-rules used `useShallow` correctly; without used single-field selectors. Zustand globs (`stores/**`, `*.store.*`) appear to pull placement away from `flat` / `features/`. Fragment or architecture guidance conflict — candidate for a registry fix, then T2 re-run. |
| T4 (both) | Tie at 0/0 after correct RSC splits on both baselines (same pattern as v0.1 T45). Instrument gap for this prompt/seed. |

T3 and T5 pass clearly on both languages (queryOptions / flat / runtime checks; vitest mock-call discipline).

Owner sign-off: Tajnur — accepted recorded scores and **no-go** for 0.2 §8.3 (agent-run matrix; Claude seat = `composer-2.5`). Date: 2026-11-25.
