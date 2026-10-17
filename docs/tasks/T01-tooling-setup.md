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
- [ ] `pnpm install --frozen-lockfile` succeeds on a clean clone.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
- [ ] `dist/cli.js` exists, starts with `#!/usr/bin/env node`, and `node dist/cli.js --version` prints `0.0.0`.
- [ ] `pnpm check:package` passes (a warning about a missing README is acceptable until T31).
- [ ] A file under `tests/fixtures/x/node_modules/` is not ignored by git (`git check-ignore` returns nothing).

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
_Record decisions and discovered gaps here._
