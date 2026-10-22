# T01 · Tooling Setup

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M1 — Foundation | — | T02, T03 | §4.2 | M |

## Goal
A working TypeScript toolchain: `pnpm build` produces `dist/cli.js`, and `node dist/cli.js --version` prints the package version.

## Context
- `package.json` already defines dependencies, scripts, `bin` (`./dist/cli.js`), and `engines`. Adjust it only if a tool requires it.
- Read `AGENTS.md` (conventions) and PRD §4.2 (repository structure and tooling).

## Scope
- Run `pnpm install` and commit `pnpm-lock.yaml`.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride`, `module: "preserve"`, `moduleResolution: "bundler"`, `target`/`lib` `ES2023`, `types: ["node"]`, `noEmit: true`, `resolveJsonModule: true`. Include `src`, `tests`, `scripts`, and config files.
- `tsdown.config.ts`: entry `src/cli.ts`, ESM, platform `node`, target `node22`, clean output, no `.d.ts`. Output file must be exactly `dist/cli.js` (match `bin`) and keep the `#!/usr/bin/env node` shebang.
- `eslint.config.js` (flat config): `@eslint/js` recommended + `typescript-eslint` `strictTypeChecked` and `stylisticTypeChecked`, type-aware via `projectService`. Ignore `dist/`, `coverage/`, `tests/fixtures/`.
- `vitest.config.ts`: include `tests/**/*.test.ts`, environment `node`.
- `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `*.log`, `.DS_Store`, `*.tgz`, and **un-ignore** `tests/fixtures/**/node_modules/` (fixtures ship fake installed packages).
- `.editorconfig`: UTF-8, LF, 2 spaces, final newline.
- `LICENSE`: MIT, `Copyright (c) 2026 Kazi Tajnur Islam`.
- `src/cli.ts`: shebang + minimal entry that prints the version from `package.json` for `--version` (temporary; T03 replaces it with `cac`).
- `tests/smoke.test.ts`: one trivial passing test so the test runner is wired.

## Out of scope
- CI workflows and changesets (T02).
- Real CLI commands, flags, and error handling (T03).

## Implementation notes
- Import the version with `import pkg from '../package.json' with { type: 'json' }` so tsdown inlines it; don't read `package.json` from disk at runtime.
- If tsdown emits `.mjs` by default, configure it (e.g., `fixedExtension: false` or an explicit `outExtensions`) rather than changing `bin`.
- TypeScript is pinned to `~6.0` on purpose (PRD §4.2); don't upgrade it.

## Acceptance criteria
- [x] `pnpm install --frozen-lockfile` succeeds on a clean clone.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
- [x] `dist/cli.js` exists, starts with `#!/usr/bin/env node`, and `node dist/cli.js --version` prints `0.0.0`.
- [x] `pnpm check:package` passes (a warning about a missing README is acceptable until T31).
- [x] A file under `tests/fixtures/x/node_modules/` is not ignored by git (`git check-ignore` returns nothing).

## Verify
```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js --version
head -1 dist/cli.js
pnpm check:package
```

## Commit
`build: set up typescript, tsdown, eslint, and vitest toolchain`

## Notes
- tsdown with `platform: "node"` emits `.mjs` unless `fixedExtension: false`. That flag keeps `dist/cli.js` aligned with `bin`. The shebang stays on line 1 because it is the first line of `src/cli.ts`; tsdown's shebang plugin preserves it. `banner` was not used.
- `tseslint.config()` is deprecated under typescript-eslint 8.72 and fails `@typescript-eslint/no-deprecated`. The flat config uses `defineConfig` and `globalIgnores` from `eslint/config`.
- `allowJs: true` is set so `eslint.config.js` is part of the program that `projectService` type-checks. It is not in the compiler-option list above; without it, including that config file is a `tsc` error.
- Tool configs default-export because tsdown, Vitest, and ESLint require it. `src/cli.ts` has no exports.
- The gitignore exception was checked with a temporary `tests/fixtures/x/node_modules/example/package.json` (`git check-ignore` printed nothing). That file is not committed; a dummy fixture would be picked up by later `tests/fixtures/*` runs. `git check-ignore -v` still prints the negating pattern; that is git showing which rule un-ignores the path, and the path is not ignored.
- publint 0.3.25 reported "All good!" with no missing-README warning.
- TypeScript stayed on `~6.0` (resolved 6.0.3).
- `.gitignore` also ignores `.pnpm-store/`. pnpm used that directory as its content-addressable store in this environment; it must not be committed.
