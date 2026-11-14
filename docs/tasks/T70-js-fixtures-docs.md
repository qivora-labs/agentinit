# T70 · JavaScript Fixtures, Acceptance Tests, and Docs

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T61–T69 | T75 | §1.2–§1.6, §3.2, §3.3, §3.5, §8.1, §8.2 | M |

## Goal
Automated tests and public docs prove JavaScript support end to end, including one full generated tree snapshot and updated acceptance criteria.

## Context
Promoted from `backlog.md` J5 (fixtures / docs half). The `js-only` fixture is still the rejected case. E2E tree snapshots exist only for `next15-src`, `vite-react`, and `express-ts`. README and FAQ still say JavaScript is unsupported.

Depends on language detection, globs, examples, wizard copy, language-change check, and module-system rules so fixtures exercise the real pipeline.

## Scope
1. **Fixtures** under `tests/fixtures/`:
   - Flip or replace `js-only` so it is an **accepted** minimal JavaScript project (or add `js-only-accepted` and retire the reject assertion).
   - Add JavaScript fixtures roughly parallel to existing ones: Next.js App Router (JS), React + Vite (JS), Express **CommonJS**, and one **mixed** TypeScript + JavaScript project with `allowJs`.
   - Keep fixtures minimal but realistic (package.json, lockfile optional, enough files for `srcDir` and framework detect).
2. **E2E**: `init --yes` / `doctor` on the new fixtures; **one full JavaScript tree snapshot** under `tests/__snapshots__/e2e/` (pick the richest JS fixture). Assert no duplication and format checks as for TypeScript trees.
3. **Acceptance** in tests mirroring PRD §8.1 updates: JS exits `0`; globs match; module-system line present where expected; mixed/`allowJs` coverage.
4. **Docs**:
   - README pitch, Supported stack, FAQ ("JavaScript-only projects?").
   - PRD §1.2–§1.6, §3.2–§3.5, §8.1, §8.2 fixture list.
   - `CONTRIBUTING.md` if it assumes TypeScript-only contributions for trying the CLI.
5. Confirm the three existing TypeScript e2e tree snapshots stay byte-identical aside from intentional `allowJs` / range work already merged.
6. Changeset: docs-only `patch` if code already shipped; otherwise rely on earlier minors.

## Out of scope
- Effectiveness eval runs (T75).
- Older-major fixtures for React 18 / Zustand 4 / Vitest 2 (T72–T74 add their own).
- Publishing.

## Implementation notes
- Follow `.cursor/rules/tests.mdc` for fixtures (no committed pnpm store; Windows-safe).
- Prefer copying a TS fixture and stripping types carefully over inventing layouts from scratch.
- Update `docs/tasks/README.md` Content checklist notes only if needed (usually not).

## Acceptance criteria
- [ ] JavaScript Next, Vite, Express CJS, and mixed fixtures exist; `init --yes` exits `0` on each; `doctor` exits `0` after init.
- [ ] One full JS tree snapshot is committed and reviewed.
- [ ] Former "JS rejected" e2e assertion is gone or inverted.
- [ ] README, PRD §8.1/§8.2, and FAQ describe JavaScript support accurately.
- [ ] Existing TS tree snapshots unchanged unless a listed exception applies.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm smoke
```

## Commit
`test: add javascript fixtures and document javascript support`

## Notes
(List fixture directory names and which one is snapshotted.)
