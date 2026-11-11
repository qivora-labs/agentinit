# Violation Checklist

Score each item **0 or 1** for the run (see [README.md](./README.md)). Only count files the agent **created or edited** in that run. Pre-existing seed violations in untouched files do not count.

Fragment ids in parentheses are the source of the directive.

---

## Task 1 — `T1-form-server-action`

| # | Violation | Source |
| :--- | :--- | :--- |
| 1.1 | A `page` or `layout` file is marked `'use client'` when it only renders an interactive child | `nextjs-app-router` |
| 1.2 | Server Action input is used without server-side schema parse / `safeParse` (or equivalent validation) before mutation logic | `nextjs-app-router`, `react-hook-form-zod` |
| 1.3 | Form field rules are duplicated in `register` options instead of living only on the Zod schema | `react-hook-form-zod` |
| 1.4 | Client form trusts prior client validation and the Server Action accepts the payload without re-parsing the same schema | `react-hook-form-zod` |
| 1.5 | Exported function missing an explicit return type | `typescript-strict` |
| 1.6 | Uses the `any` type (including in generated form/action helpers the agent wrote) | `typescript-strict` |
| 1.7 | New UI/helper files are not placed under the flat layout (`src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, or a `src/features/<feature>/` folder) when they should be | `flat` |

---

## Task 2 — `T2-ui-store`

| # | Violation | Source |
| :--- | :--- | :--- |
| 2.1 | Store caches or holds API / server response data | `zustand` |
| 2.2 | Selector returns a new object or array without `useShallow` | `zustand` |
| 2.3 | Custom equality function passed as the second argument of a hook from `create` | `zustand` |
| 2.4 | Store actions are defined outside the `create` call (or the store mixes unrelated concerns) | `zustand` |
| 2.5 | Uses the `any` type | `typescript-strict` |
| 2.6 | Exported function missing an explicit return type | `typescript-strict` |
| 2.7 | New store or UI files are not placed under the flat layout (`src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, or a `src/features/<feature>/` folder) when they should be | `flat` |

---

## Task 3 — `T3-data-hook`

| # | Violation | Source |
| :--- | :--- | :--- |
| 3.1 | Query key factory missing, or `queryFn` closes over a value not present in the key | `tanstack-query` |
| 3.2 | Key and `queryFn` not shared through `queryOptions` (inline one-off `useQuery` / `useSuspenseQuery` objects) | `tanstack-query` |
| 3.3 | Query result copied into a client store (Zustand or ad-hoc) | `tanstack-query`, `zustand` |
| 3.4 | `useSuspenseQuery` used without a `<Suspense>` boundary, or passed `enabled` / `placeholderData` / `throwOnError` | `tanstack-query` |
| 3.5 | Uses the `any` type | `typescript-strict` |
| 3.6 | Exported function missing an explicit return type | `typescript-strict` |
| 3.7 | New hook, query, or demo files are not placed under the flat layout (`src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, or a `src/features/<feature>/` folder) when they should be | `flat` |

---

## Task 4 — `T4-refactor-rsc`

| # | Violation | Source |
| :--- | :--- | :--- |
| 4.1 | `page` / `layout` remains `'use client'` (or is newly marked) when only a child needs interactivity | `nextjs-app-router` |
| 4.2 | Client module still fetches user data via `useEffect` + `fetch` to an internal `/api/...` route instead of loading in a Server Component | `nextjs-app-router` |
| 4.3 | `params` (or `searchParams`) read without `await` | `nextjs-app-router` |
| 4.4 | Server-only data or secrets imported into a `'use client'` file | `nextjs-app-router` |
| 4.5 | Uses the `any` type in edited/new files | `typescript-strict` |
| 4.6 | Exported function missing an explicit return type in edited/new files | `typescript-strict` |
| 4.7 | Observable behavior changed (toggle or name display) without the prompt asking for it | `refactor` workflow intent |

---

## Task 5 — `T5-write-tests`

| # | Violation | Source |
| :--- | :--- | :--- |
| 5.1 | Test name describes an internal call rather than an observable result (e.g. `calls loadRate`) | `vitest` |
| 5.2 | Asserts call order / mock call shape of `loadRate` (or similar) instead of a return value, thrown error, or caller-provided callback | `vitest` |
| 5.3 | Mocks the module under test (`cart-total` / `./cart-total`) | `vitest` |
| 5.4 | `vi.mock` not at top level, or `vi` not imported from `vitest` when mocks are used | `vitest` |
| 5.5 | No `describe` grouping named for the unit when multiple tests exist | `vitest` |
| 5.6 | Uses the `any` type in test or helper files the agent wrote | `typescript-strict` |
| 5.7 | Changes `cart-total.ts` or `rates.ts` behavior without a clear bug report (characterization preferred) | `write-tests` / `refactor` intent |

Note: Mocking `./rates` at top level is allowed when the assertion is still an observable `cartTotal` result. Mocking `./cart-total` is not.

---

## Shared notes

- Zustand globs (`stores/**`, `*.store.ts`, `*.store.tsx`) and TanStack Query globs (`hooks/**`, `queries/**`) only decide where those library rules load. They are not placement requirements. `src/stores/` and `src/queries/` are outside the flat layout, so they count for **2.7** / **3.7**.
- If the agent skips a library entirely (e.g. no Zod on task 1), still score the items that apply to what it wrote; missing validation when a Server Action accepts input is **1.2** / **1.4**.
- Return-type items (**1.5**, **2.6**, **3.6**, **4.6**): after T45, do **not** score missing return types on React components or framework entry files (`page`, `layout`, route handlers). Other exported functions still count.
- Formatting-only edits do not create violations.
- When unsure between 0 and 1, mark **1** and explain in notes so the owner can downgrade.
