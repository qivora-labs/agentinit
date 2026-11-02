# v0.1 acceptance map

Each row is one criterion from PRD §8.1. Automated rows name the test that proves it. The experience criterion is manual.

| Criterion | Test | Result |
| :--- | :--- | :--- |
| A JavaScript-only project exits 1 and writes nothing, with or without `--yes`. | `tests/e2e/detection.test.ts` — A JavaScript-only project exits 1 and writes nothing, with or without --yes | automated |
| A monorepo root exits 1 with instructions; running inside a workspace package works. | `tests/e2e/detection.test.ts` — A monorepo root exits 1 with instructions; running inside a workspace package works | automated |
| Versions are resolved from `node_modules` first; a `workspace:*` or `catalog:` specifier never crashes detection. | `tests/e2e/detection.test.ts` — Versions are resolved from node_modules first; a workspace:* or catalog: specifier never crashes detection | automated |
| A `tsconfig.json` with comments, trailing commas, and `extends` is parsed correctly. | `tests/e2e/detection.test.ts` — A tsconfig.json with comments, trailing commas, and extends is parsed correctly | automated |
| A project with both `app/` and `pages/` gets both Next.js fragments. | `tests/e2e/detection.test.ts` — A project with both app/ and pages/ gets both Next.js fragments | automated |
| A TypeScript project with no supported framework (e.g., a CLI) gets base rules and a notice, and exits 0 with `--yes`. | `tests/e2e/detection.test.ts` — A TypeScript project with no supported framework (e.g., a CLI) gets base rules and a notice, and exits 0 with --yes | automated |
| An unsupported version (e.g., Tailwind v3) is skipped with a notice. | `tests/e2e/detection.test.ts` — An unsupported version (e.g., Tailwind v3) is skipped with a notice | automated |
| No rule text appears in more than one generated file (excluding pointers and imports). | `tests/e2e/no-duplication.test.ts` — No rule text appears in more than one generated file (excluding pointers and imports) | automated |
| Every generated Cursor, Claude, Windsurf, and Copilot file matches its format in §5.4 and the scope mapping in §5.3. | `tests/e2e/output.test.ts` — Every generated Cursor, Claude, Windsurf, and Copilot file matches its format in §5.4 and the scope mapping in §5.3 | automated |
| Globs resolve correctly for `src/` and root layouts and always use forward slashes. | `tests/e2e/output.test.ts` — Globs resolve correctly for src/ and root layouts and always use forward slashes | automated |
| `AGENTS.md` lists only scripts that exist, using the detected package manager. | `tests/e2e/output.test.ts` — AGENTS.md lists only scripts that exist, using the detected package manager | automated |
| Content outside managed blocks is byte-for-byte unchanged after `init`. | `tests/e2e/safety.test.ts` — Content outside managed blocks is byte-for-byte unchanged after init | automated |
| Re-running `init` with no project changes writes nothing and prints "Already up to date." | `tests/e2e/safety.test.ts` — Re-running init with no project changes writes nothing and prints "Already up to date." | automated |
| A hand-edited managed block is never overwritten with `--yes`. | `tests/e2e/safety.test.ts` — A hand-edited managed block is never overwritten with --yes | automated |
| An existing same-named workflow file is never overwritten without confirmation or `--force`. | `tests/e2e/safety.test.ts` — An existing same-named workflow file is never overwritten without confirmation or --force | automated |
| Interrupting `init` (SIGINT) leaves no partial files. | `tests/e2e/safety.test.ts` — Interrupting init (SIGINT) leaves no partial files | automated |
| `--dry-run` writes nothing, including the manifest. | `tests/e2e/safety.test.ts` — --dry-run writes nothing, including the manifest | automated |
| Exits 0 on a freshly initialized project and 2 after adding a supported package to `package.json`. | `tests/e2e/doctor.test.ts` — Exits 0 on a freshly initialized project and 2 after adding a supported package to package.json | automated |
| Never modifies any file. | `tests/e2e/doctor.test.ts` — Never modifies any file | automated |
| Time from `npx @agentinit/cli` to written files on an existing project is under 60 seconds, excluding download time. | — | manual |
