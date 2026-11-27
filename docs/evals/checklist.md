# Violation Checklist

Score each item **0 or 1** for the run (see [README.md](./README.md)). Only count files the agent **created or edited** in that run. Pre-existing seed violations in untouched files do not count.

Fragment ids in parentheses are the source of the directive.

**Language columns:** items marked **TS only** apply to the TypeScript cell (`typescript-strict`). Items marked **JS only** apply to the JavaScript cell (`javascript`). Shared items apply to both. Do not score a language-only item on the other cell (treat as not in the checklist for that run).

---

## Task 1 — `T1-form-server-action`

| # | Violation | Source | Lang |
| :--- | :--- | :--- | :--- |
| 1.1 | A `page` or `layout` file is marked `'use client'` when it only renders an interactive child | `nextjs-app-router` | both |
| 1.2 | Server Action input is used without server-side schema parse / `safeParse` (or equivalent validation) before mutation logic | `nextjs-app-router`, `react-hook-form-zod` | both |
| 1.3 | Form field rules are duplicated in `register` options instead of living only on the Zod schema | `react-hook-form-zod` | both |
| 1.4 | Client form trusts prior client validation and the Server Action accepts the payload without re-parsing the same schema | `react-hook-form-zod` | both |
| 1.5 | Exported function missing an explicit return type | `typescript-strict` | TS only |
| 1.6 | Uses the `any` type (including in generated form/action helpers the agent wrote) | `typescript-strict` | TS only |
| 1.7 | New UI/helper files are not placed under the flat layout (`src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, or a `src/features/<feature>/` folder) when they should be | `flat` | both |
| 1.8 | TypeScript-only syntax in a `.js` / `.jsx` file (type annotations, `interface`, `type` aliases, enums, non-null assertions, or `import type`) | `javascript` | JS only |
| 1.9 | Mixes `import`/`export` with `require`/`module.exports` in the same package (excluding `.cjs` / `.mjs` boundary files) | `javascript` | JS only |
| 1.10 | External input (`JSON.parse`, request/form payload) used without a runtime check before property access or treating it as a specific shape | `javascript` | JS only |

---

## Task 2 — `T2-ui-store`

| # | Violation | Source | Lang |
| :--- | :--- | :--- | :--- |
| 2.1 | Store caches or holds API / server response data | `zustand` | both |
| 2.2 | Selector returns a new object or array without `useShallow` | `zustand` | both |
| 2.3 | Custom equality function passed as the second argument of a hook from `create` | `zustand` | both |
| 2.4 | Store actions are defined outside the `create` call (or the store mixes unrelated concerns) | `zustand` | both |
| 2.5 | Uses the `any` type | `typescript-strict` | TS only |
| 2.6 | Exported function missing an explicit return type | `typescript-strict` | TS only |
| 2.7 | New store or UI files are not placed under the flat layout (`src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, or a `src/features/<feature>/` folder) when they should be | `flat` | both |
| 2.8 | TypeScript-only syntax in a `.js` / `.jsx` file | `javascript` | JS only |
| 2.9 | Mixes `import`/`export` with `require`/`module.exports` in the same package | `javascript` | JS only |

---

## Task 3 — `T3-data-hook`

| # | Violation | Source | Lang |
| :--- | :--- | :--- | :--- |
| 3.1 | Query key factory missing, or `queryFn` closes over a value not present in the key | `tanstack-query` | both |
| 3.2 | Key and `queryFn` not shared through `queryOptions` (inline one-off `useQuery` / `useSuspenseQuery` objects) | `tanstack-query` | both |
| 3.3 | Query result copied into a client store (Zustand or ad-hoc) | `tanstack-query`, `zustand` | both |
| 3.4 | `useSuspenseQuery` used without a `<Suspense>` boundary, or passed `enabled` / `placeholderData` / `throwOnError` | `tanstack-query` | both |
| 3.5 | Uses the `any` type | `typescript-strict` | TS only |
| 3.6 | Exported function missing an explicit return type | `typescript-strict` | TS only |
| 3.7 | New hook, query, or demo files are not placed under the flat layout (`src/components/`, `src/hooks/`, `src/utils/`, `src/types/`, or a `src/features/<feature>/` folder) when they should be | `flat` | both |
| 3.8 | TypeScript-only syntax in a `.js` / `.jsx` file | `javascript` | JS only |
| 3.9 | External JSON / fetch payload used without a runtime check before property access | `javascript` | JS only |
| 3.10 | Mixes `import`/`export` with `require`/`module.exports` in the same package | `javascript` | JS only |

---

## Task 4 — `T4-refactor-rsc`

| # | Violation | Source | Lang |
| :--- | :--- | :--- | :--- |
| 4.1 | `page` / `layout` remains `'use client'` (or is newly marked) when only a child needs interactivity | `nextjs-app-router` | both |
| 4.2 | Client module still fetches user data via `useEffect` + `fetch` to an internal `/api/...` route instead of loading in a Server Component | `nextjs-app-router` | both |
| 4.3 | `params` (or `searchParams`) read without `await` | `nextjs-app-router` | both |
| 4.4 | Server-only data or secrets imported into a `'use client'` file | `nextjs-app-router` | both |
| 4.5 | Uses the `any` type in edited/new files | `typescript-strict` | TS only |
| 4.6 | Exported function missing an explicit return type in edited/new files | `typescript-strict` | TS only |
| 4.7 | Observable behavior changed (toggle or name display) without the prompt asking for it | `refactor` workflow intent | both |
| 4.8 | TypeScript-only syntax introduced in a `.js` / `.jsx` file | `javascript` | JS only |
| 4.9 | Mixes `import`/`export` with `require`/`module.exports` in edited/new files | `javascript` | JS only |

---

## Task 5 — `T5-write-tests`

| # | Violation | Source | Lang |
| :--- | :--- | :--- | :--- |
| 5.1 | Test name describes an internal call rather than an observable result (e.g. `calls loadRate`) | `vitest` | both |
| 5.2 | Asserts call order / mock call shape of `loadRate` (or similar) instead of a return value, thrown error, or caller-provided callback | `vitest` | both |
| 5.3 | Mocks the module under test (`cart-total` / `./cart-total`) | `vitest` | both |
| 5.4 | `vi.mock` not at top level, or `vi` not imported from `vitest` when mocks are used | `vitest` | both |
| 5.5 | No `describe` grouping named for the unit when multiple tests exist | `vitest` | both |
| 5.6 | Uses the `any` type in test or helper files the agent wrote | `typescript-strict` | TS only |
| 5.7 | Changes `cart-total` or `rates` behavior without a clear bug report (characterization preferred) | `write-tests` / `refactor` intent | both |
| 5.8 | TypeScript-only syntax in a `.js` / `.jsx` test or helper the agent wrote | `javascript` | JS only |
| 5.9 | Mixes `import`/`export` with `require`/`module.exports` in test files the agent wrote | `javascript` | JS only |

Note: Mocking `./rates` at top level is allowed when the assertion is still an observable `cartTotal` result. Mocking `./cart-total` is not. On the JavaScript cell the unit paths are `cart-total.js` / `rates.js`.

---

## Shared notes

- Zustand globs (`stores/**`, `*.store.ts` / `*.store.js`, `*.store.tsx` / `*.store.jsx`) and TanStack Query globs (`hooks/**`, `queries/**`) only decide where those library rules load. They are not placement requirements. `src/stores/`, `src/lib/`, and `src/queries/` are outside the flat layout, so new files there count for **1.7** / **2.7** / **3.7**. Leaving a seed import of `src/lib/users-api` in a `'use client'` file after the T4 refactor counts for **4.4**.
- If the agent skips a library entirely (e.g. no Zod on task 1), still score the items that apply to what it wrote; missing validation when a Server Action accepts input is **1.2** / **1.4**. On the JavaScript cell, missing runtime checks on external input also score **1.10** / **3.9**.
- Return-type items (**1.5**, **2.6**, **3.6**, **4.6**): after T45, do **not** score missing return types on React components or framework entry files (`page`, `layout`, route handlers). Other exported functions still count. These items are **N/A on pure JS runs**.
- `any`-type items (**1.6**, **2.5**, **3.5**, **4.5**, **5.6**) are **N/A on pure JS runs**.
- Formatting-only edits do not create violations.
- When unsure between 0 and 1, mark **1** and explain in notes so the owner can downgrade.
