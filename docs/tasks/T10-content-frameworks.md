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
- [ ] Five fragments exist and `pnpm registry:check` passes with no errors.
- [ ] Each has `sources` pointing to official docs for the targeted major and a current `verifiedAt`.
- [ ] Scope choices are explained in **Notes** (one line each).
- [ ] Content checklist complete; a human reviewed the content.

## Verify
```bash
pnpm registry:check
```

## Commit
`feat(registry): add framework fragments`

## Notes
_Record decisions and discovered gaps here._
