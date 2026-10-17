# T30 · Packed-Tarball Smoke Test

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M6 — Quality & Launch | T27 | T32 | §4.2 (registry resolution), §7 M6 | S |

## Goal
Prove the **published** package works: install the packed tarball in a clean directory and run the CLI, catching path and packaging bugs that source-level tests miss.

## Scope
- `scripts/smoke.ts` (run with `tsx`):
  1. `pnpm build` and `pnpm pack` into a temp dir.
  2. Assert the tarball contains only `package.json`, `README.md`, `LICENSE`, `dist/**`, `registry/**`.
  3. Install the tarball into a fresh temp project with `npm install <tarball>` (no network beyond the tarball's dependencies).
  4. Run the installed binary: `--version`, `list --json` (non-empty, parses), and `init --yes --dry-run` against a copy of `tests/fixtures/next15-src`.
- `package.json` script: `"smoke": "tsx scripts/smoke.ts"`.
- CI: a separate `smoke` job (Ubuntu + Windows) that runs after the main job.

## Out of scope
- Publishing (T32).

## Acceptance criteria
- [ ] `pnpm smoke` passes locally.
- [ ] Removing `registry` from `files` in `package.json` makes the smoke test fail (verify once, then revert).
- [ ] CI smoke job passes on Ubuntu and Windows.

## Verify
```bash
pnpm smoke
```

## Commit
`ci: add packed tarball smoke test`

## Notes
_Record decisions and discovered gaps here._
