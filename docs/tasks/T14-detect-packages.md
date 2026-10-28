# T14 · Detect Packages & Versions

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M3 — Detection | T03 | T18 | §3.3 (Packages, Marker files, Package manager, Scripts) | M |

## Goal
Read a project's dependencies with their **real** versions, its package manager, its relevant scripts, and the existence of marker files.

## Context
- PRD §3.3 step 2 defines the resolution order: installed version in `node_modules` → lockfile → range in `package.json`.
- Fixtures here need fake `node_modules/<pkg>/package.json` files (committed; `.gitignore` allows them since T01).

## Scope
`src/detect/packages.ts`:
- `readPackageJson(root) → PackageJson | null` (`null` when missing; malformed JSON → `AgentInitError` naming the file).
- `resolveVersions(root, pkgJson) → Record<string, string | null>` for all `dependencies` + `devDependencies`:
  1. `node_modules/<name>/package.json` `version` (scoped names supported).
  2. Lockfile: `package-lock.json` (`packages["node_modules/<name>"].version`) and `pnpm-lock.yaml` (`importers["."]` dependencies/devDependencies `version`, stripping peer suffixes like `1.2.3(react@19.0.0)`).
  3. Range: `semver.minVersion(range)`; `npm:<real>@<range>` aliases use the inner range; `workspace:*`, `catalog:`, `latest`, git/URL/file specifiers → `null`.
  - `yarn.lock` and `bun.lock` are not parsed in v0.1 (fall back to step 3); note this in a code comment.
- `detectPackageManager(root, pkgJson) → PackageManager`: `packageManager` field (`pnpm@10.14.0` → `pnpm`), else lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`, `package-lock.json`), else `npm`.
- `detectScripts(pkgJson) → Record<string, string>`: only `build`, `dev`, `lint`, `test`, `typecheck` that exist.
- `existingFiles(root, candidates: string[]) → string[]`: which marker files exist (candidates come from registry `detect.files`).

## Out of scope
- TypeScript gate and `tsconfig.json` (T15).
- Monorepo detection (T17).

## Implementation notes
- Never execute package managers or network calls; read files only.
- Keep lockfile parsing defensive: unknown lockfile versions must fall back to the range, not crash.

## Acceptance criteria
Fixtures under `tests/fixtures/detect-packages/` cover:
- [x] Installed version wins over lockfile and range.
- [x] `package-lock.json` and `pnpm-lock.yaml` (with peer suffix) resolve correctly when `node_modules` is absent.
- [x] `^15.1.0` → `15.1.0`; `npm:react@^19.0.0` alias resolves; `workspace:*` and `catalog:` → `null` without throwing.
- [x] Package manager from `packageManager` field, from each lockfile type, and default `npm`.
- [x] Only existing known scripts are returned.
- [x] Malformed `package.json` → readable error naming the file.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): resolve package versions, package manager, and scripts`

## Notes
- `semver.minVersion` throws on dist-tags and protocol specifiers (`latest`, `workspace:`, `catalog:`, `file:`, git, URL). Those fail `semver.validRange` and resolve to `null`. `npm:<name>@<range>` uses the inner range, including scoped names (`npm:@scope/pkg@^1.2.3`). `^` and `~` use `minVersion`.
- `yarn.lock` and `bun.lock` / `bun.lockb` are not parsed in v0.1. Versions fall back to the range. The package manager is still detected from those filenames.
- Lockfile order matches package-manager detection: `pnpm-lock.yaml`, then `yarn.lock`, then `bun.lock`, then `bun.lockb`, then `package-lock.json`. When `pnpm-lock.yaml` exists, versions come only from that file. npm lockfile v1 (a `dependencies` tree and no `packages` map) falls back to the range. Invalid lockfiles contribute no versions and do not throw.
- pnpm peer suffixes are stripped at the first `(`, so `1.2.3(react@19.0.0)` is `1.2.3`.
- The same name in `dependencies` and `devDependencies` keeps the `dependencies` specifier. `optionalDependencies` and `peerDependencies` are not read.
- An unrecognized `packageManager` name falls through to lockfile detection, then `npm`. Text after `@` is ignored (`pnpm@10.14.0` → `pnpm`).
- A missing, unreadable, or version-less `node_modules/<pkg>/package.json` falls through to the lockfile. Dependency names that resolve outside `node_modules` are ignored.
- `existingFiles` returns candidates that are files inside the project root, in candidate order. Directories and paths that leave the root are skipped.
