# T09 · Content: Architectures & Languages

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T08 | T29 | §3.2, §4.4, §5.4 (`ARCHITECTURE.md`), §10 | L |

## Goal
Six production-quality fragments: four architectures and two TypeScript language profiles.

## Context
- Follow the **Content Tasks Checklist** in `docs/tasks/README.md`.
- `ARCHITECTURE.md` is **descriptive** (PRD §5.4): architecture fragments state conventions for **new** code and must never tell agents to move or restructure existing files.
- Architecture `## Summary` is copied into `AGENTS.md` (always loaded) — keep it ≤ 10 lines and high-signal.
- Architecture `## Map` feeds `ARCHITECTURE.md`; write it as a folder → responsibility table using `{{src}}`.

## Scope
`registry/architectures/` (`category: architecture`, `scope: always`, `order: 10`):
- `feature-based.md` — `{{src}}features/<feature>/` with internal `components/`, `hooks/`, `api/`, `model/`, a public `index.ts`; shared code in `{{src}}shared/` (or the framework's equivalent). Directives: features import other features only through their public `index.ts`; no shared code depends on a feature.
- `layered.md` — `domain/`, `application/`, `infrastructure/`, `presentation/`; dependencies point inward; domain has no framework or I/O imports.
- `atomic-design.md` — `atoms/`, `molecules/`, `organisms/`, `templates/`, pages; components only compose from lower levels; atoms hold no business logic.
- `flat.md` — minimal conventions for small projects: group by file type, keep modules small, when to graduate to feature-based.

`registry/languages/` (`category: language`, `scope: always`, `order: 20`; no `detect` — language comes from `tsconfig.json`):
- `typescript-strict.md` — no `any` (use `unknown` + narrowing), explicit return types on exported functions, no non-null assertions, `satisfies` for config objects, discriminated unions over boolean flags, exhaustive `switch` with `never`, `import type` for types.
- `typescript.md` — the standard subset: avoid `any`, prefer type inference internally, `import type`, narrow `unknown` from external input.

Each fragment: correct frontmatter, `sources` (e.g., TypeScript handbook pages), `verifiedAt` = date of writing, ≤ 120 lines.

## Out of scope
- Generating `ARCHITECTURE.md` (T20).
- Architecture detection heuristics (T16).

## Implementation notes
- Make Summary bullets actionable ("New UI components go in `{{src}}components/ui/`"), not descriptive prose.
- Language rules apply to all `.ts`/`.tsx` files; don't repeat framework-specific advice here.

## Acceptance criteria
- [x] Six fragments exist and `pnpm registry:check` passes with no errors.
- [x] Each architecture fragment has `## Summary` (≤ 10 lines) and `## Map`.
- [x] No fragment instructs moving existing files.
- [x] Content checklist in `docs/tasks/README.md` is complete.
- [ ] A human reviewed the content.

## Verify
```bash
pnpm registry:check
node dist/cli.js list --category architecture   # after pnpm build
```

## Commit
`feat(registry): add architecture and typescript fragments`

## Notes
- `verifiedAt` is 2026-10-28. Language rules were checked against the TypeScript handbook (everyday types, narrowing, functions) and the 3.0 (`unknown`), 3.8 (`import type`), and 4.9 (`satisfies`) release notes, plus the `strict` tsconfig page. No `detect` and no `appliesTo`: language is chosen from `tsconfig.json`, not from a package match. `satisfies` needs TypeScript ≥ 4.9.
- Feature folders follow this task (`components/`, `hooks/`, `api/`, `model/`, public `index.ts`, `{{src}}shared/`). bulletproof-react's project-structure doc, read the same day, now warns that barrel files hurt Vite tree-shaking and prefers composing features in the app layer instead of cross-feature imports. This fragment still uses `index.ts` as the only cross-feature import, and tells files inside a feature to import siblings by path. An existing framework shared folder counts as `{{src}}shared/` so new shared code is not given a second root.
- Atomic design follows this task's "lower levels only" rule. Brad Frost's chapter 2 also allows an organism to contain another organism.
- Flat tells agents to leave files that are already in a type folder in place, and to add `{{src}}features/<feature>/` only for the new domain.
- The shared content checklist is checked for these six fragments. Human review before merge is still open. Later content tasks (T10–T13) must re-check the same list for the fragments they add.
