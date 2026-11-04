# T36 · Detection Summary Card

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T27 | T37, T40 | §3.3 step 4 | S |

## Goal
Turn the "Detected project" box from a debug dump into a card a developer can read at a glance.

## Context
- Today the box prints `Architecture: Flat / Minimal (confidence 0.875)`, then lists every package version, including `react-dom@19.0.0`. Every line has the same weight.
- PRD §3.3 step 4 now says: labels and values in aligned columns, versions only next to the framework or library they were detected from, and confidence in words unless it is below 0.7.

## Scope
1. `src/ui/format.ts` `formatSummary`:
   - Title: `Detected <package name>` when `package.json` has a `name`, otherwise `Detected project`.
   - Rows, labels in gray and aligned: `Framework`, `Libraries` (omitted when empty), `Language`, `Architecture`, `Tooling`.
   - Framework and library values show the version of their detection package in gray: `Next.js App Router   next 16.3`. Use the fragment's `detect.packages` to pick the package. Show `major.minor`.
   - `Language`: `TypeScript · strict` or `TypeScript`, with the `typescript` version in gray when known.
   - `Architecture`: name, then `likely` in gray when confidence ≥ 0.7. Below 0.7, show `unsure (0.55)` in the warning color.
   - `Tooling`: package manager and layout, `pnpm · src/`.
   - Notices and warnings follow under a gray `Notes` label, one per line, with the warning icon.
   - Remove the `Versions:` list.
2. Add a pure `alignColumns(rows, theme)` helper in `src/ui/` that measures visible width without ANSI codes. T34 reuses it.
3. `formatSelectionChanges` (re-run "What changed") uses the same label style.
4. Update the summary and format tests and their snapshots.

## Out of scope
- The re-run flow (T37) and prompt wording (T38).

## Implementation notes
- `formatSummary` must stay plain on a pipe and in `--json` (the theme's painters return text unchanged when `tty` is false).
- Clack's `note` measures width itself. Pass colored text and check that the box border still lines up in a pty run, because some Clack versions count escape codes.
- `sanitizeDisplayText` still wraps every value that came from the project.

## Acceptance criteria
- [x] `next15-src` summary has five rows and no `Versions:` block (snapshot).
- [x] Confidence ≥ 0.7 shows `likely` and no number. Below 0.7 shows the number in the warning color.
- [x] A library with an unknown version shows no version text and no `null`.
- [x] `tailwind-v3` still shows the unsupported-version notice under `Notes`.
- [x] The box border lines up with color on (manual check in a real terminal, noted below).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js init --dry-run --cwd tests/fixtures/next15-src
```

## Commit
`feat(ui): redesign the detected project summary`

## Notes
- Reused `src/ui/align.ts` from T34 (`alignColumns(rows, gap)`); theme painting stays in the caller.
- Captured `package.json` `name` on `ProjectProfile` / the draft so the Clack note title can be `Detected <name>` without `ui/` reading disk.
- "Five rows" for next15-src = title + four body rows (Libraries omitted when empty). Snapshot: `tests/__snapshots__/ui/next15-src-summary.txt`.
- Border: `alignColumns` pads by visible width (ANSI stripped; covered in `align.test.ts`). `formatSummary` paints then aligns before `prompter.note`, same pattern as the T34 report. Spot-checked painted summary width vs plain; Clack receives the aligned string.
