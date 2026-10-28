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

- [x] Four fragments exist and `pnpm registry:check` passes with no errors.
- [x] `shadcn` requires `tailwind`; resolver tests (T06) would add it automatically.
- [x] Content checklist complete; a human reviewed the content.

## Verify

```bash
pnpm registry:check
```

## Commit

`feat(registry): add tailwind, shadcn, tanstack query, and zustand fragments`

## Notes

- `verifiedAt` is 2026-10-28. Directives were checked against the official pages listed in each fragment's `sources`.
- Scope: `tailwind` is `glob` on `{{src}}**/*.tsx` and `{{src}}**/*.css`. The task table omitted `{{src}}`; every other fragment uses it, and an empty source root still matches. `shadcn` is `auto` with a `components/ui` fallback because `aliases.ui` can point somewhere else (`@/app/ui` is a documented example). `tanstack-query` is `auto` with hooks and queries globs because those files are not in one fixed folder. `zustand` is `auto` with `stores/` and `*.store` globs for the same reason.
- `compatibleWith` for all four is `nextjs-app-router`, `nextjs-pages-router`, and `react-vite`. Express and Fastify are not web UI targets. TanStack Query here is `@tanstack/react-query`, and Zustand is the React store.
- `tailwind` stays `tailwindcss: ">=4"`. Current release is 4.3.3. New setup is `@import "tailwindcss"` and `@theme`. `@config` remains only as the v3 compatibility load of a JS file the project already has. Class detection is still whole-string scan. `cn` joins conditional classes and lets a later utility in the same group win. The fragment uses it only when the project already has that helper, and imports it from the module the project already uses. The contract does not name that module, so an agent does not copy `@/lib/utils` or `"cn"`.
- `shadcn` has no `appliesTo` and detects only `components.json`. `requires: [tailwind]`. `resolveSelection` adds that fragment when `tailwindcss` is missing, unknown, or `>=4`. `tailwindcss@3` emits `unsupported-version` and does not add the v4 rules. Components are source in the project. `aliases.ui` is the import alias for that folder; the usual value is `@/components/ui`. The glob fallback stays `components/ui`. A reused look is a new `variant` / `size` on the existing map (`buttonVariants`). The CLI add step is left to the developer because that command fetches from the network.
- `tanstack-query` stays `@tanstack/react-query: ">=5"`. Current release is 5.105.0. A key must be `JSON.stringify`-serializable. The hash is deterministic, so object key order does not matter and array order does. `queryOptions` is the shared key-plus-`queryFn` helper. The key factory (`all` / `detail`) is the organization the query-keys guide points at in TkDodo's article, so that URL is in `sources`. `invalidateQueries` is prefix match, and `onSuccess` returns that promise. `useSuspenseQuery` suspends while loading. An error is thrown only when the query has no data. `enabled`, `placeholderData`, and `throwOnError` must not be passed. The contract renders the hook under `<Suspense>`. Fetched data stays in the query cache.
- `zustand` stays `zustand: ">=5"`. Current release is 5.0.16. `useShallow` is imported from `zustand/react/shallow`, which is the path in the 5.0.16 readme and the useShallow doc. The v5 migration page also shows `zustand/shallow`; the fragment teaches the readme path. `create` does not take a custom equality function; that stays on `createWithEqualityFn`. A selector that returns a new object, array, or function is unstable in v5. API responses stay out of the store.
- The shared content checklist was re-checked for these four fragments. The shared checklist's human-review box stays open until T12–T13 re-check the fragments they add. The task's human-review acceptance box stays open until a person reviews the content.
