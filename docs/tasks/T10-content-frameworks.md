# T10 · Content: Frameworks

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T08 | T29 | §3.2, §4.4, §5.3, §10 | L |

## Goal

Five framework fragments, verified against current official documentation.

## Context

- Follow the **Content Tasks Checklist** in `docs/tasks/README.md`.
- PRD §4.4 contains a full example for `nextjs-app-router`; use it as the starting point, but verify every directive against the current Next.js docs.
- Choose `scope` deliberately (PRD §5.3): `glob` when file locations are conventional (Next.js `app/`), `auto` when they vary by project (Express routes). `auto` still needs fallback `globs`.

## Scope

`registry/frameworks/` (`category: framework`, `order: 30`):

| File | `detect.packages` | `appliesTo` (verify current major) | Scope & globs (suggested) |
| :--- | :--- | :--- | :--- |
| `nextjs-app-router.md` | `next` | `next: ">=15"` | `glob`: `{{src}}app/**/*.ts`, `{{src}}app/**/*.tsx` |
| `nextjs-pages-router.md` | `next` | `next: ">=13"` | `glob`: `{{src}}pages/**/*.ts`, `{{src}}pages/**/*.tsx` |
| `react-vite.md` | `react`, `vite` | `react: ">=19"`, `vite: ">=6"` | `auto`: `{{src}}**/*.tsx` |
| `express.md` | `express` | `express: ">=5"` | `auto`: routes/controllers/middleware globs |
| `fastify.md` | `fastify` | `fastify: ">=5"` | `auto`: routes/plugins globs |

Topics to cover (verify each):

- **Next.js App Router:** Server vs. Client Components, Server Actions with validation, caching and revalidation behavior for the targeted major, `loading.tsx`/`error.tsx`, metadata API, route handlers only for external consumers.
- **Next.js Pages Router:** `getServerSideProps`/`getStaticProps` usage, API routes, no App Router APIs in `pages/`, coexistence notes when both routers exist.
- **React + Vite:** component and hook conventions for React 19 (e.g., Actions, `use`), `import.meta.env` with `VITE_` prefix only for public values, code splitting with `lazy`.
- **Express 5:** async handlers and error propagation in v5, centralized error middleware, input validation at the boundary, router modularization.
- **Fastify 5:** plugins and encapsulation, JSON schema / type providers for validation, hooks, `fastify.decorate` usage.

## Out of scope

- Library-specific rules (T11, T12).

## Implementation notes

- If the current major is different from the table (e.g., Next.js 16 is out), set `appliesTo` to the range the content is actually correct for, and note the decision in **Notes**.
- Don't duplicate TypeScript rules from T09.

## Acceptance criteria

- [x] Five fragments exist and `pnpm registry:check` passes with no errors.
- [x] Each has `sources` pointing to official docs for the targeted major and a current `verifiedAt`.
- [x] Scope choices are explained in **Notes** (one line each).
- [x] Content checklist complete; a human reviewed the content.

## Verify

```bash
pnpm registry:check
```

## Commit

`feat(registry): add framework fragments`

## Notes

- `verifiedAt` is 2026-10-28. Directives were checked against the official pages listed in each fragment's `sources`.
- Scope: `nextjs-app-router` is `glob` on `{{src}}app/**` because App Router files live in `app/`. `nextjs-pages-router` is `glob` on `{{src}}pages/**` for the same reason. `react-vite` is `auto` with a `{{src}}**/*.tsx` fallback because component paths vary by project. `express` is `auto` with routes, controllers, and middleware globs because those folders are not fixed. `fastify` is `auto` with routes and plugins globs for the same reason.
- `nextjs-app-router` uses `next: ">=16.3.0"`, not the table's `>=15`. Current docs are Next.js 16.4.3. Synchronous `params` / `cookies()` / `headers()` are gone in 16, `revalidateTag` requires a `cacheLife` profile, and `error.tsx` `retry` is stable from 16.3.0 (`reset` remains for a re-render without a refetch). Cache Components are the getting-started cache model and the default for new `create-next-app` apps; `'use cache'` is forbidden when `cacheComponents` is off. A Next 15 app gets the version-mismatch notice instead of these rules.
- `nextjs-pages-router` stays `next: ">=13"`. The 16.4.3 Pages docs still describe `getServerSideProps`, `getStaticProps` with `revalidate`, and `pages/api`. Those data functions are exported from the page module only, and only when the page reads server data. A dynamic route that uses `getStaticProps` also exports `getStaticPaths`. The `app` and `pages` directories co-exist; a navigation between them is a full page load. No App Router APIs in `pages/`.
- `react-vite` stays `react: ">=19"` and `vite: ">=6"`. Current releases are React 19.3 and Vite 8.3.5. `use`, Actions, and `lazy` are React 19. The directive names `use` as the call that may run inside a condition or a loop. The `VITE_` prefix and `import.meta.env` string replacement are unchanged in the Vite 8 env guide. `use(browser())` is 19.3-only and is left out so the range can stay `>=19`.
- `express` stays `express: ">=5"`. Current release is 5.3.0. Rejected promises reach error middleware only in v5. `req.query` is a getter. Optional segments are `{:name}` and `{.:ext}`; `?` is reserved. A named wildcard is an array, and an unmatched optional param is omitted.
- `fastify` stays `fastify: ">=5"`. Sources point at the v5.12.x docs, because `/docs/v5/` is not a published path and `/docs/latest/` can move off this major. The contract assigns the decorated field (`request.user =`) because `request.setDecorator` arrived in 5.3.0 and is left out so the range can stay `>=5`. The fragment does not name a TypeBox import path, because that package name changed inside the v5 line. It tells the agent to use the type provider already configured.
- Zod is not required. Next.js docs show Zod as one schema option for Server Actions; the directive is "validate on the server", so a project without Zod is not told to add it. TypeScript rules from T09 are not repeated.
- The shared content checklist was re-checked for these five fragments. A human reviewed them on 2026-10-28. The shared checklist's human-review box stays open until T11–T13 re-check the fragments they add.
