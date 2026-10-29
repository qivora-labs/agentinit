# T15 · TypeScript Gate & `tsconfig.json`

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M3 — Detection | T03 | T18 | §3.3 (TypeScript Gate, TypeScript) | S |

## Goal
Reject JavaScript-only projects and read TypeScript settings from `tsconfig.json`, including comments and `extends`.

## Context
- PRD §3.3 step 1 (gate) and step 2 "TypeScript".
- `get-tsconfig` parses JSONC and resolves `extends` (including package-based extends like `@tsconfig/strictest`).

## Scope
`src/detect/typescript.ts`:
- `assertTypeScriptProject(root, pkgJson)`: passes if `tsconfig.json` exists **or** `typescript` is in dependencies/devDependencies; otherwise throws `UnsupportedProjectError` with the message *"JavaScript projects aren't supported yet"* (exit code `1`).
- `readTsConfig(root) → { strict: boolean; paths: Record<string, string[]> } | null` using `get-tsconfig`, with `extends` resolved. Missing file → `null` (allowed when `typescript` is a dependency).
- `suggestLanguage(tsconfig) → Language`: `typescript-strict` when `strict === true`, else `typescript`.

## Out of scope
- Version resolution of `typescript` itself (T14).

## Implementation notes
- `extends` targeting a package that isn't installed should not crash; fall back to the local options and add a warning to the return value.

## Acceptance criteria
Fixtures under `tests/fixtures/detect-typescript/`:
- [x] JS-only project throws `UnsupportedProjectError` with exit code `1`.
- [x] Project with `typescript` dependency but no `tsconfig.json` passes; `readTsConfig` returns `null`.
- [x] `tsconfig.json` with comments and trailing commas parses.
- [x] `strict: true` inherited through a relative `extends` is detected.
- [x] `extends` to a missing package returns local options plus a warning, without throwing.
- [x] `paths` aliases are returned.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): add typescript gate and tsconfig parsing`

## Notes
- Implemented in `src/detect/typescript.ts`, as this task's scope specifies. PRD §4.2 still sketches `typescript-gate.ts` and `tsconfig.ts`. The diagram was left unchanged; T18 should import this module.
- `readTsConfig` reads only `<root>/tsconfig.json`. `getTsconfig` walks parent directories, which would pick up a repo-root config from a nested package.
- `warnings` is always present. It is empty when `extends` is absent or fully resolved. A missing target (`File '<target>' not found.` from `get-tsconfig`) yields local `strict` and `paths` plus one warning. The same fallback covers a missing relative `extends`, not only a missing package.
- `get-tsconfig` throws before returning a partial merge, so one missing entry in an `extends` array drops any siblings that would have resolved. Only the local file is used in that case.
- A circular `extends` throws `AgentInitError` (still exit code `1`), not `UnsupportedProjectError`.
- `suggestLanguage` returns `typescript-strict` only for boolean `strict: true`, including a value inherited through `extends`. A missing file, `strict: false`, or strict flags set without `strict` itself all return `typescript`.
- The gate treats `typescript` in `dependencies` or `devDependencies` as enough. `PackageJson` has no other dependency maps.
