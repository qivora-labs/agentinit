# T16 · Layout & Architecture Inference

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M3 — Detection | T03 | T18 | §3.3 (Layout), §3.5, §4.3 (`folders`), §5.4 (`ARCHITECTURE.md`) | M |

## Goal
Detect `src/` vs. root layout, Next.js router folders, existing folders, and the most likely architecture with a confidence score.

## Context
- Low confidence (< 0.7) makes the CLI ask (or use `flat` with `--yes`), so the score must be meaningful, not always high.
- `folders` feeds the descriptive `ARCHITECTURE.md`.

## Scope
`src/detect/layout.ts`:
- `detectSrcDir(root) → '' | 'src'`: `src` if `src/` exists and contains at least one `.ts`/`.tsx` file.
- `detectNextRouters(root, srcDir) → { app: boolean; pages: boolean }`: checks `<srcDir>/app` and `<srcDir>/pages`, and also root-level `app/` and `pages/` when `srcDir` is `src` (Next.js supports both).
- `listFolders(root, srcDir) → string[]`: POSIX paths of directories under `srcDir` up to depth 2, excluding `node_modules`, `dist`, `build`, `.next`, `coverage`, and dot-folders; sorted.
- `inferArchitecture(folders) → { id, confidence }` with documented heuristics, e.g.:
  - `features/` or `modules/` containing ≥ 2 subfolders → `feature-based`.
  - ≥ 3 of `domain`, `application`, `infrastructure`, `presentation` → `layered`.
  - ≥ 2 of `atoms`, `molecules`, `organisms`, `templates` → `atomic-design`.
  - Otherwise `flat`, with confidence based on how small/simple the tree is.
  - Mixed signals lower confidence.

## Out of scope
- Deciding which Next.js fragment to use (T18 combines routers with package detection).

## Implementation notes
- Write the heuristics as a small scoring table in code with comments explaining each weight; tests should pin the expected confidence ranges, not exact floats.

## Acceptance criteria
Fixtures under `tests/fixtures/detect-layout/`:
- [x] `src/` with TS files → `'src'`; empty `src/` → `''`.
- [x] App only, Pages only, both, and root-level `app/` with `src/` are detected correctly.
- [x] Clear feature-based, layered, and atomic trees score ≥ 0.7 for the right architecture.
- [x] A mixed tree (e.g., `features/` + `domain/` + `atoms/`) scores < 0.7.
- [x] `folders` excludes ignored directories and is sorted.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): infer layout and architecture with confidence`

## Notes
- Implemented in `src/detect/layout.ts`, which matches the PRD §4.2 sketch. T18 should import this module. It is not wired into an orchestrator here.
- Folder paths are POSIX and relative to `srcDir`, with no `src/` prefix. `inferArchitecture` sees `features` and `components/atoms`. `srcDir` stays a separate profile field.
- `detectSrcDir` walks every real directory under `src/`. A nested `.ts` or `.tsx` file counts. A missing `src/`, a file named `src`, or a directory with no `.ts`/`.tsx` file returns `''`. Symlinks are ignored (`Dirent.isDirectory()` and `isFile()` are false for links).
- `detectNextRouters` requires directories. When `srcDir` is `src`, either `src/<router>` or a root-level `<router>` sets the flag. When `srcDir` is `''`, only the project root is checked. `app/pages` is not the Pages router.
- `listFolders` returns depth 1 and 2. Ignored names are skipped at every level, including nested `node_modules` and `build`, and so is any dot-folder. Depth 3+ is omitted. An unreadable directory throws `AgentInitError`. Paths sort by UTF-16 code unit.
- Architecture ids are the registry ids. A name matches the last path segment, so `components/atoms` (the atomic-design fragment) and a top-level `atoms/` both count. `features/` and `modules/` score only as top-level directories, because their children must fall inside depth 2. The two roots are one signal, not a mixed pair.
- A pattern qualifies at the task thresholds (≥ 2 feature children, ≥ 3 layer names, ≥ 2 atomic names). The winner's weight is reduced by every other positive weight, so one competing signal lands below 0.7 (strongest clear weight 0.875 minus weakest partial 0.25 is 0.625). Flat confidence is 0.875 for a small tree (≤ 4 top-level and ≤ 6 nested), 0.75 through 8 top-level and 12 nested, and 0.5 after that. Partial signals are subtracted from that base. The score is clamped to [0.125, 1]. Tests assert those ranges, not the exact weights.
- A directory whose own name is a layer or atomic name (for example `features/domain`) counts as a second signal and lowers confidence.
- The mixed fixture keeps id `feature-based` because that pattern still qualifies; the score is what drops below 0.7. `features/` + `domain/` + `atoms/` with no feature children does not qualify and returns `flat`, also below 0.7.
- Low-confidence handling (`--yes` → `flat`) stays in T19. Choosing the Next.js fragment stays in T18.
