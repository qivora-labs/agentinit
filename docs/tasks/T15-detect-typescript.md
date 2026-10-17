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
- [ ] JS-only project throws `UnsupportedProjectError` with exit code `1`.
- [ ] Project with `typescript` dependency but no `tsconfig.json` passes; `readTsConfig` returns `null`.
- [ ] `tsconfig.json` with comments and trailing commas parses.
- [ ] `strict: true` inherited through a relative `extends` is detected.
- [ ] `extends` to a missing package returns local options plus a warning, without throwing.
- [ ] `paths` aliases are returned.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): add typescript gate and tsconfig parsing`

## Notes
_Record decisions and discovered gaps here._
