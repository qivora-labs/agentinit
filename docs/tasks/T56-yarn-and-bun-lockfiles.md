# T56 · Locked Versions From `yarn.lock` and `bun.lock`

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M10 — 0.1.2 patch | T55 | — | §3.3 | M |

## Goal
A Yarn or Bun project without `node_modules` resolves its locked versions, so `doctor` in CI selects the same fragments that `init` selected locally.

## Context
Promoted from `backlog.md` P1.4b.
- `readLockfileVersions` in `src/detect/packages.ts` reads `pnpm-lock.yaml` and `package-lock.json` only. The fixtures `lockfile-yarn`, `lockfile-bun`, and `lockfile-bunb` exist for package-manager detection, not for versions.
- Without `node_modules`, a Yarn or Bun project falls back to `semver.minVersion` of the range, the same fallback as in T55. `next: ^16.0.0` becomes `16.0.0` and selects `nextjs-app-router-15`, while the locked 16.4.0 selects `nextjs-app-router`. A `doctor` step that runs before the install can therefore disagree with `init`.
- Yarn Plug'n'Play projects never have `node_modules`, so today they always use the range.
- The formats, to confirm against a lockfile written by the current tool before coding:
  - **Yarn classic (v1):** not YAML. It starts with `# yarn lockfile v1`. Each entry is keyed by one or more comma-separated descriptors (`next@^16.0.0`), followed by an indented `version "16.4.0"` line.
  - **Yarn berry:** YAML with a `__metadata` key. Entry keys are comma-separated descriptors with a protocol (`next@npm:^16.0.0`), and each entry has `version: 16.4.0`.
  - **Bun text lockfile (`bun.lock`):** JSON with comments and trailing commas. `packages` maps a package name to an array whose first item is `name@version`.
  - **`bun.lockb`:** binary.

## Scope
1. **`yarn.lock` reader:** tell classic from berry by the header and `__metadata`. Resolve each dependency by its descriptor: `name@<specifier>` for classic and `name@npm:<specifier>` for berry, where `<specifier>` is the value in `package.json`. A lockfile can hold several versions of one package, and the descriptor picks the one this project asked for. A descriptor that isn't found resolves to nothing and falls through to the range.
2. **`bun.lock` reader:** parse it as JSON with comments. Read a dependency's version from `packages[<name>][0]`, splitting at the last `@` so scoped names work. In a workspace, prefer the entry scoped to the workspace package when one exists.
3. **Order:** the lockfile at the lookup root (T55) is chosen in the order `detectPackageManager` already uses: `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `package-lock.json`. The first one that exists is the only one read, as today.
4. **PRD:** §3.3 step 2 lists the lockfiles that are read and says `bun.lockb` is not.
5. Update the code comment on `readLockfileVersions`, which says these files are not parsed in v0.1.
6. Add a `patch` changeset.

## Out of scope
- `bun.lockb`. A project with only the binary lockfile keeps the range fallback.
- Reading Yarn's `.pnp.cjs`.
- Any change to package-manager detection.

## Implementation notes
- No new runtime dependency. Berry is YAML, so use the existing `yaml` package. Classic needs a small line parser in `src/detect/`. If a real berry lockfile doesn't parse with `yaml`, stop and ask.
- `src/detect/typescript.ts` already has a private reader for JSON with comments and trailing commas (`jsoncToJson`). Move it to a shared helper in `src/detect/` and use it for `bun.lock`.
- Keep parsing defensive, as T14 requires: a malformed or unknown lockfile contributes no versions and never throws.
- Fixtures go under `tests/fixtures/detect-packages/`. Generate each lockfile with the real tool once and trim it; don't write one from memory.

## Acceptance criteria
- [x] Yarn classic fixture without `node_modules`: `next@^16.0.0` locked at 16.4.0 resolves to 16.4.0. A scoped package and an entry with several descriptors resolve too.
- [x] Yarn berry fixture: the same cases resolve through `npm:` descriptors.
- [x] A `yarn.lock` with two versions of one package resolves the one that matches the `package.json` specifier.
- [x] `bun.lock` fixture with comments and trailing commas resolves, including a scoped package.
- [x] `bun.lockb` alone falls back to the range. A malformed `yarn.lock` or `bun.lock` yields no versions and does not throw.
- [x] An installed version still wins over every lockfile.
- [x] End to end: a Yarn project selects the same framework fragment with and without `node_modules`, and `init --yes` followed by `doctor` exits `0` without `node_modules`.
- [x] A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`fix(detect): read locked versions from yarn.lock and bun.lock`

## Notes
Implemented 2026-11-12: `readLockfileVersions` now reads `yarn.lock` (classic line parser / berry via `yaml`) and text `bun.lock` (shared `jsoncToJson`) in detection order after pnpm; `bun.lockb` stays unread. Yarn resolves by package.json descriptor; Bun prefers `packages["<pkgName>/<name>"]` when present. Fixtures trimmed from real yarn classic, yarn berry, and bun lockfiles. PRD §3.3 step 2 lists the lockfiles read for versions.
