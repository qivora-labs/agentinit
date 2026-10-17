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
- [ ] Installed version wins over lockfile and range.
- [ ] `package-lock.json` and `pnpm-lock.yaml` (with peer suffix) resolve correctly when `node_modules` is absent.
- [ ] `^15.1.0` → `15.1.0`; `npm:react@^19.0.0` alias resolves; `workspace:*` and `catalog:` → `null` without throwing.
- [ ] Package manager from `packageManager` field, from each lockfile type, and default `npm`.
- [ ] Only existing known scripts are returned.
- [ ] Malformed `package.json` → readable error naming the file.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): resolve package versions, package manager, and scripts`

## Notes
_Record decisions and discovered gaps here._
