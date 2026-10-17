# T06 · Fragment Resolver

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T04 | T18, T19, T20 | §3.3, §3.5, §4.1, §4.4 | M |

## Goal
Pure functions that (1) suggest fragments from detected project facts and (2) turn a selection into the final ordered fragment list, with notices for anything skipped or added.

## Context
- PRD §3.3 step 3 (unsupported versions), §3.5 last paragraph (conflicts apply only to manual selections), §4.4 (`detect`, `appliesTo`, `requires`, `conflictsWith`, `compatibleWith`).
- This module is **pure**: no filesystem, no prompts.

## Scope
`src/registry/resolve.ts`:

1. `suggestFragments(registry, facts) → { frameworks, libraries, notices }`
   - `facts = { packages: Record<string, string | null>, files: string[] }` (versions may be `null` when unknown).
   - A fragment is suggested when all `detect.packages` are present and all `detect.files` exist.
   - If it matches detection but a package's version is outside its `appliesTo` range → not suggested; notice `{ kind: 'unsupported-version', package, version, fragmentId }`.
   - Unknown version (`null`) → suggested, with notice `{ kind: 'unknown-version' }`.
   - Both Next.js fragments may be suggested together; this function doesn't decide the App vs. Pages question (layout does, in T16/T18).

2. `resolveSelection(registry, selection) → { fragments, workflows, notices, conflicts }`
   - `selection = { language, architecture, frameworks, libraries, origin: Record<id, 'detected' | 'manual'> }`.
   - Adds `requires` transitively (notice `required-by`).
   - Reports `conflicts` only between pairs where at least one side is `manual`; detected pairs are always honored.
   - Drops libraries whose `compatibleWith` excludes every selected framework (notice `incompatible`).
   - Always includes all workflow fragments.
   - Unknown ids → `AgentInitError`.
   - Output sorted by `order`, then `id`.

## Out of scope
- Detecting packages or files (T14–T18).
- Prompting the user about conflicts (T19).

## Implementation notes
- Use `semver.satisfies(version, range, { includePrerelease: true })`.
- Model notices as a discriminated union so the UI (T19) and `doctor` (T28) can format them.

## Acceptance criteria
Table-driven tests using `registry-sample` (extend it if needed) covering:
- [ ] Package present + version in range → suggested.
- [ ] Version out of range → not suggested + `unsupported-version` notice (e.g., Tailwind 3 vs. a `>=4` fragment).
- [ ] `null` version → suggested + `unknown-version` notice.
- [ ] `detect.packages` requires **all** packages; `detect.files` requires all files.
- [ ] `requires` is added transitively, without duplicates.
- [ ] Conflict between two manual selections is reported; between two detected selections it is not.
- [ ] Incompatible library is dropped with a notice.
- [ ] Workflows are always included; output order is stable.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(registry): resolve fragment selections from project facts`

## Notes
_Record decisions and discovered gaps here._
