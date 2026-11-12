# T55 · Versions & Package Manager Inside a Workspace Package

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M10 — 0.1.2 patch | — | T56 | §3.3 | M |

## Goal
Running the CLI inside a workspace package selects rules for the version that is really installed, and prints commands for the package manager the workspace really uses.

## Context
Promoted from `backlog.md` P1.4a. PRD §3.3 tells monorepo users to run inside a single package, so this is the supported path for every monorepo today.

Both defects were reproduced with 0.1.1 on 2026-11-12, in a pnpm workspace with the package at `packages/web`:
- **Wrong version.** The package declares `next: ^16.0.0`. 16.4.0 is installed and is in the root `pnpm-lock.yaml`. `init --yes` writes `nextjs-app-router-15` rules (`>=15.0.0 <16.3.0`) instead of `nextjs-app-router`.
- **Wrong package manager.** The root has `packageManager: pnpm@10.14.0` and `pnpm-lock.yaml`. `AGENTS.md` and the workflows say `npm run test`.

Causes, all in `src/detect/packages.ts`:
- `installedVersion` rejects pnpm's `node_modules/<pkg>` symlink, because its target is outside the package directory (`realpathInside(projectRoot, …)`).
- `readLockfileVersions` reads lockfiles only in the project directory. A workspace lockfile is at the root.
- `readPnpmLockVersions` reads only `importers['.']`.
- `detectPackageManager` reads only the package's own `packageManager` field and the lockfiles in the project directory, then defaults to `npm`.

The version then falls back to `semver.minVersion` of the range, so `^16.0.0` becomes `16.0.0`, and `catalog:` or `workspace:*` become unknown. npm and Yarn workspaces hoist packages to the root `node_modules`, which is not searched either (read from the code, not reproduced).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Lookup root.** Recommended: the nearest directory, starting at the project directory and walking up, that contains a recognised lockfile. The walk stops at the git root. With no git repository, only the project directory is used, as today, so a stray lockfile in a home directory is never read. Alternative: with no git repository, also accept a directory that has a workspace marker (`pnpm-workspace.yaml`, or `workspaces` in `package.json`).
2. **Symlinked `node_modules` entries.** Recommended: read a symlink whose canonical target is inside the lookup root. This widens the T14 rule ("a symlink is read only when its canonical target stays inside the project") from the project to the lookup root. A target outside the lookup root (`npm link`, pnpm's global virtual store) is still ignored and falls through to the lockfile. Alternative: keep the T14 rule and rely on the lockfile alone.

## Scope
1. **Lookup root** (`src/detect/`): one function that returns the directory from decision 1. When the project directory has its own lockfile, or no lockfile is found, the lookup root is the project directory and behavior is unchanged.
2. **Installed versions:** look for `node_modules/<name>/package.json` in the project directory, then in each parent directory up to the lookup root (Node's resolution order). Apply decision 2 to symlinks.
3. **Lockfiles at the lookup root:**
   - pnpm: read `importers[<path>]`, where `<path>` is the POSIX path from the lookup root to the project (`.` when they are the same).
   - npm: read `packages["<path>/node_modules/<name>"]` first, then `packages["node_modules/<name>"]`.
4. **Package manager:** the project's `packageManager` field, then the `packageManager` field of the `package.json` at the lookup root, then the lockfile at the lookup root, then `npm`.
5. **PRD:** §3.3 step 2 (Packages and Package manager) describes the lookup root and the symlink rule.
6. Add a `patch` changeset. Its text tells users who initialized inside a workspace package to re-run `init`, because `doctor` can now report a different framework fragment for them.

## Out of scope
- `yarn.lock` and `bun.lock` parsing (T56).
- Compiling a monorepo root (backlog P3.1). A root still exits `1`.
- Reading `catalog:` definitions from `pnpm-workspace.yaml`. The lockfile's importer entry already holds the resolved version.
- Marker files, `tsconfig.json`, and layout detection. They stay in the project directory.
- Changing which directory `init` writes to.

## Implementation notes
- Detection stays read-only. Never run a package manager.
- Keep the existing order and fallbacks: installed version, then lockfile, then range. `pnpm-lock.yaml` still wins over `package-lock.json` in the same directory. An invalid lockfile contributes no versions and does not throw.
- Build the importer key with forward slashes on every platform.
- CI runs on Windows, where a committed symlink may be checked out as a plain file. Create the pnpm-style symlink inside the test's temp directory instead of committing it in a fixture (`.cursor/rules/tests.mdc`).
- `doctor` uses the same detection, so it needs no separate change. Cover it with one end-to-end test.
- The `pnpm-monorepo` fixture already has `packages/web` and `packages/api`.

## Acceptance criteria
- [x] Decisions recorded under **Notes**, and the PRD updated.
- [x] pnpm workspace package with `next: ^16.0.0` and a symlinked install of 16.4.0: `init --yes` selects `nextjs-app-router`.
- [x] The same package without `node_modules`: the version comes from `importers['packages/web']` in the root `pnpm-lock.yaml`. A `catalog:` specifier resolves from that entry.
- [x] npm workspace package: a hoisted root `node_modules/<pkg>` is read. Without `node_modules`, the root `package-lock.json` is read, and a `packages/web/node_modules/<pkg>` entry wins over the hoisted entry.
- [x] A workspace package with no `packageManager` field and no lockfile of its own gets the root's package manager in `AGENTS.md` and the workflows (`pnpm test`, not `npm run test`).
- [x] A symlink whose target is outside the lookup root is ignored, and the version falls through to the lockfile.
- [x] A project that is not in a workspace resolves exactly as before. A lockfile above the git root is not read, and with no git repository no parent directory is read.
- [x] Inside the workspace package, `init --yes` followed by `doctor` exits `0`.
- [x] A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`fix(detect): resolve versions and package manager inside workspace packages`

## Notes
Owner decisions, 2026-11-12. The PRD is updated when the task is implemented.
- **Decision 1:** the lookup root is the nearest directory with a recognised lockfile, starting at the project directory and never above the git root. With no git repository, only the project directory is used. A workspace marker alone does not extend the search.
- **Decision 2:** a `node_modules` symlink is read when its canonical target is inside the lookup root. A target outside it is ignored and falls through to the lockfile. This widens the T14 rule from the project to the lookup root.

Implemented 2026-11-12: `findLookupRoot` in `src/detect/packages.ts`; installed versions walk project→lookup root; pnpm importer / npm nested-vs-hoisted lockfile keys; package manager falls through to the lookup root. PRD §3.3 step 2 documents the lookup root and symlink rule. Symlinks for pnpm-style installs are created in temp dirs (not committed) for Windows CI.
