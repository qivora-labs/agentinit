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
- [ ] `src/` with TS files → `'src'`; empty `src/` → `''`.
- [ ] App only, Pages only, both, and root-level `app/` with `src/` are detected correctly.
- [ ] Clear feature-based, layered, and atomic trees score ≥ 0.7 for the right architecture.
- [ ] A mixed tree (e.g., `features/` + `domain/` + `atoms/`) scores < 0.7.
- [ ] `folders` excludes ignored directories and is sorted.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): infer layout and architecture with confidence`

## Notes
_Record decisions and discovered gaps here._
