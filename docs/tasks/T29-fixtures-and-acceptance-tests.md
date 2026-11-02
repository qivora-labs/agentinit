# T29 · Fixtures & Acceptance Tests

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M6 — Quality & Launch | T27, T28, T09–T13 | T33 | §8.1, §8.2 | L |

## Goal
Complete the fixture set and prove every v0.1 acceptance criterion with an automated test, using the **real** registry content.

## Context
- Earlier tasks created some fixtures; this task fills the gaps and adds end-to-end coverage.
- PRD §8.1 lists the criteria; §8.2 lists the fixtures.

## Scope
- Ensure all fixtures from PRD §8.2 exist under `tests/fixtures/`, each minimal but realistic (`package.json`, lockfile or fake `node_modules` versions, `tsconfig.json`, a few source files).
- `tests/e2e/`: one test file per PRD §8.1 group (detection, output, safety, doctor). Each test is named after the criterion it proves.
- Snapshot the full generated tree for `next15-src`, `vite-react`, and `express-ts` with the real registry (`tests/__snapshots__/e2e/`).
- `tests/e2e/no-duplication.test.ts`: for every fixture, assert no rule paragraph appears in more than one generated file (ignore pointers/imports and headings).
- `tests/ACCEPTANCE.md`: a table mapping each PRD §8.1 criterion to its test file and test name; mark the one manual criterion.
- Confirm CI is green on all three operating systems.

## Out of scope
- New product behavior. If a criterion fails, fix the bug in the owning module (small fix) or open a follow-up task (larger fix).

## Acceptance criteria
- [x] Every fixture in PRD §8.2 exists.
- [x] Every automated criterion in PRD §8.1 maps to a passing test in `tests/ACCEPTANCE.md`.
- [x] The duplication test passes for all fixtures.
- [ ] CI passes on Ubuntu, macOS, and Windows.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`test: add fixtures and end-to-end acceptance tests`

## Notes
- Duplication is checked per agent. Shared files (`AGENTS.md`, `ARCHITECTURE.md`) plus that agent's tree are one set. The same scoped rule is written once per agent (PRD §5.2). Pointers (`@AGENTS.md`), import lines, headings, and paragraphs shorter than 40 characters are ignored.
- `next15-src` has no lockfile and no fake `node_modules`. Doctor and init tests change specifiers in `package.json` and expect detection to follow them. A lockfile would hide those edits. Other fixtures carry a lockfile or, for `packages/api`, an installed `next` version.
- `packages/web` stays a TypeScript package with no framework so the existing monorepo detection test still applies. `packages/api` has `next: workspace:*`, `react: catalog:`, and `node_modules/next` at 16.3.0. Init selects the App Router and does not report an unknown `next` version.
- `edited-managed-block` is a real `init --yes` of `next15-src` with `HAND-EDITED BLOCK` inserted in the `AGENTS.md` core block. The manifest hash is still the original, so `--yes` skips that block.
- `tests/fixtures/crlf-line-endings/**` is `eol=crlf` in `.gitattributes`. Other fixtures stay LF.
- SIGINT sets a flag and does not call `process.exit` while temp files exist. `apply` throws before rename, deletes the temps, and returns exit 130. The acceptance test arms that same flag through `shouldStop`. `tests/interrupt.test.ts` covers the exit-versus-defer decision.
- CI on Ubuntu, macOS, and Windows is the existing matrix in `.github/workflows/ci.yml`. This session ran the suite on macOS only. The checkbox stays open until that pull request is green on all three.
