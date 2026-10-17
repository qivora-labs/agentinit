# T11 · Content: Tailwind, shadcn/ui, TanStack Query, Zustand

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T08 | T29 | §3.2, §4.4, §5.3, §10 | L |

## Goal
Four library fragments for styling, UI components, server state, and client state.

## Context
- Follow the **Content Tasks Checklist** in `docs/tasks/README.md`.
- shadcn/ui is not an npm package; detect it via `components.json` (`detect.files`).

## Scope
`registry/libraries/` (`category: library`, `order: 40`):

| File | Detection | `appliesTo` (verify) | `compatibleWith` | Other |
| :--- | :--- | :--- | :--- | :--- |
| `tailwind.md` | `tailwindcss` | `tailwindcss: ">=4"` | all web frameworks | `glob`: `**/*.tsx`, `**/*.css` |
| `shadcn.md` | files: `components.json` | — | `nextjs-app-router`, `nextjs-pages-router`, `react-vite` | `requires: [tailwind]` |
| `tanstack-query.md` | `@tanstack/react-query` | `>=5` | web frameworks | `auto` with globs for hooks/queries |
| `zustand.md` | `zustand` | `>=5` | web frameworks | `auto` with globs for stores |

Topics to cover (verify each):
- **Tailwind v4:** CSS-first config (`@theme`, `@import "tailwindcss"`), no `tailwind.config.js` for new setup, class composition helper (`cn`), avoid dynamic class string construction.
- **shadcn/ui:** components live in the project (`components/ui/`), extend via variants rather than editing generated primitives heavily, use the CLI to add components (as a human step; do not instruct agents to run network commands).
- **TanStack Query v5:** query key factories, `queryOptions`, no server state in client stores, mutations with invalidation, Suspense usage where relevant.
- **Zustand v5:** small focused stores, selectors to avoid re-renders, `useShallow`, no server data caching in stores, actions colocated in the store.

## Out of scope
- Forms and testing libraries (T12).

## Implementation notes
- The shadcn "add components" step involves a network call by the CLI tool; phrase it as guidance for the developer, or omit it — `check-registry` will flag install commands.

## Acceptance criteria
- [ ] Four fragments exist and `pnpm registry:check` passes with no errors.
- [ ] `shadcn` requires `tailwind`; resolver tests (T06) would add it automatically.
- [ ] Content checklist complete; a human reviewed the content.

## Verify
```bash
pnpm registry:check
```

## Commit
`feat(registry): add tailwind, shadcn, tanstack query, and zustand fragments`

## Notes
_Record decisions and discovered gaps here._
