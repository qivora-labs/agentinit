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

2. `resolveSelection(registry, selection, facts?) → { fragments, workflows, notices, conflicts }`
   - `selection = { language, architecture, frameworks, libraries, origin: Record<id, 'detected' | 'manual'> }`.
   - Adds `requires` transitively (notice `required-by`).
   - Reports `conflicts` only between pairs where at least one side is `manual`; detected pairs are always honored.
   - Drops libraries whose `compatibleWith` excludes every selected framework (notice `incompatible`).
   - `frameworks` may be empty (PRD §3.6): then libraries **with** `compatibleWith` are dropped (notice `incompatible`) and libraries without it are kept; add notice `no-framework`.
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
- [x] Package present + version in range → suggested.
- [x] Version out of range → not suggested + `unsupported-version` notice (e.g., Tailwind 3 vs. a `>=4` fragment).
- [x] `null` version → suggested + `unknown-version` notice.
- [x] `detect.packages` requires **all** packages; `detect.files` requires all files.
- [x] `requires` is added transitively, without duplicates.
- [x] Conflict between two manual selections is reported; between two detected selections it is not.
- [x] Incompatible library is dropped with a notice.
- [x] Empty `frameworks`: framework-bound libraries dropped, framework-agnostic libraries kept, `no-framework` notice present, no error.
- [x] Workflows are always included; output order is stable.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(registry): resolve fragment selections from project facts`

## Notes
- `RegistryNotice` is the shared discriminated union. `unknown-version` is `{ kind, package, fragmentId, included }`. `included: true` when the fragment is still suggested (null version of a `detect` or `appliesTo` package). `included: false` when version-split siblings could not be disambiguated and none were suggested. A known version with no `appliesTo` entry is silent. If any package is outside its range, the fragment is omitted and only `unsupported-version` notices are emitted for it.
- `suggestFragments` returns framework and library ids only. Both Next.js fragments are suggested from the `next` package alone; router filtering stays in T18. Marker files match `facts.files` by exact string.
- Version checks use `semver.satisfies(version, range, { includePrerelease: true })`, so `15.0.0-canary.1` matches `>=15`.
- Unknown ids and ids from the wrong category throw `AgentInitError`. A `requires` id missing from the registry throws as well; `loadRegistry` already rejects that for real registries.
- Conflicts are `{ a, b }` with `a < b`, sorted, and only include fragments that remain after incompatible libraries are dropped. Both sides stay in `fragments` (prompting is T19). An origin entry that is omitted counts as `manual`. A required fragment inherits the origin of the fragment that pulled it in.
- Incompatible libraries are removed before their `requires` are kept, so a dropped library does not pull dependencies. `no-framework` is a single notice when the final list contains no framework. Compatibility is decided against frameworks present after the first `requires` expansion.
- Optional `facts` gates `requires` with the same version rule as suggestion. A known version outside `appliesTo` omits that fragment, emits `unsupported-version`, and does not add its own `requires`. Notices for those omissions follow the `required-by` notices. A missing `facts` argument, a package absent from `facts`, or a `null` version still adds the fragment. An id listed in the selection is kept even when its version is outside the range.
- `fragments` excludes workflows. `workflows` is always every workflow fragment, sorted by `order` then `id`.
- The sample registry gained the extra fragments these cases need (`typescript`, `nextjs-pages-router`, `tailwind`, `shadcn`, `vitest`, `forms`, `review-arch`). Loader and `list` expectations were updated to match.
