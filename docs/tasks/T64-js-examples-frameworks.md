# T64 · Content: JavaScript Examples for Frameworks

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T62 | T70, T72 | §4.4, §10 | L |

## Goal
Every framework fragment carries a hand-written JavaScript Contract example and language-neutral prose so JavaScript Next.js, React + Vite, Express, and Fastify projects get loadable, accurate samples.

## Context
Promoted from `backlog.md` J3 (content). Seven fragments:

- `nextjs-app-router`, `nextjs-app-router-15`, `nextjs-pages-router`
- `react-vite`
- `express`, `express-4`, `fastify`

Next.js Map rows name `route.ts` and `error.tsx`. Express / Fastify Contracts use TypeScript types (`err: unknown`, `FastifyInstance`).

## Scope
1. For each framework fragment under `registry/frameworks/`:
   - Add a JavaScript Contract fence per T62.
   - Apply prose extension placeholders where file names appear (Map, Directives).
   - Mark or rewrite any TypeScript-only directive lines per T62.
   - Bump `version`, refresh `verifiedAt`, keep `sources` pointed at the docs for the fragment's `appliesTo` range.
2. Content Tasks checklist applies. Human reviews before merge.
3. `pnpm registry:check`. Fix tests that pin framework bodies.
4. Changeset: include in the dual-example story unless shipping alone (`patch`/`minor` as appropriate).

## Out of scope
- New version ranges for React 18 / Vite 5 (T72). Write JS examples on the current `react-vite` fragment; T72 will copy the pattern into the older-major sibling.
- Library fragments (T65, T66).
- Changing `appliesTo` or detect rules except to fix a doc error.

## Implementation notes
- Verify every directive against official docs for the fragment's version range before editing.
- Express / Fastify JS examples should use the same runtime patterns without type annotations; do not invent a different API.
- Next.js App Router JS examples still respect Server / Client boundaries.

## Acceptance criteria
- [ ] All seven framework fragments have JS + TS Contract variants (or an approved TypeScript-only marker with rationale in **Notes** — prefer none).
- [ ] Prose file extensions are language-neutral via T62 placeholders.
- [ ] `pnpm registry:check` passes.
- [ ] Content Tasks checklist completed; human review noted under **Notes**.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(registry): add javascript examples to framework fragments`

## Notes
(Human review date and reviewer go here after merge readiness.)
