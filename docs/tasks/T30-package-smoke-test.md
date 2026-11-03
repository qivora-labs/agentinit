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

- [x] `pnpm smoke` passes locally.
- [x] Removing `registry` from `files` in `package.json` makes the smoke test fail (verify once, then revert).
- [x] CI smoke job passes on Ubuntu and Windows.

## Verify

```bash
pnpm smoke
```

## Commit

`ci: add packed tarball smoke test`

## Notes

- `README.md` is allowed in the tarball and required only when the repo root has one. T31 has not added it, so the current pack is `package.json`, `LICENSE`, `dist/**`, and `registry/**`.
- The temp install project gets a private `package.json` so `npm install` does not prompt. npm still downloads the tarball's runtime dependencies. Audit and fund requests are disabled so that install does not add registry calls beyond those dependencies.
- Removing `registry` from `files` failed with `Tarball is missing registry/. Include "registry" in package.json "files".` The field was restored.
- `tests/scripts/smoke.test.ts` covers the path allowlist, including a tarball that omits `registry`. The install-and-run checks stay in `pnpm smoke`.
- The `smoke` job needs `ci` and runs on `ubuntu-latest` and `windows-latest` with Node 22. Verified locally with `pnpm smoke` (2026-11-03); PR #30 merged.
- Windows runs `.cmd` shims through `cmd.exe /d /s /c` with each special argument quoted. `shell: true` joins argv with spaces, so a temp path that contains a space would split.
