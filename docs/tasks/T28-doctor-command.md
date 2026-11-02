# T28 · `doctor` Command

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M5 — Safe IO & Doctor | T18, T21, T22, T23, T24, T26 | T29, T31 | §6.5, §3.1 (exit codes) | M |

## Goal
A read-only check that reports drift between the manifest, the project, and generated files, and exits `2` when anything needs attention — so it can run in CI.

## Context
- PRD §6.5 lists every check. `doctor` must **never write**, not even the manifest or `.agentinit/`.
- Reuse `detectProject`, `resolveSelection`, `buildPlan`, and the read-only `computeChanges` from T26; most checks map directly to change types (`create` = missing, `conflict-edited` = edited).

## Scope
`src/commands/doctor.ts` + `src/doctor/checks.ts` (pure check functions):
- No manifest → issue "Not initialized" with fix `npx @agentinit/cli init`.
- Managed file or block missing → issue with fix `init`.
- Managed content edited by hand (hash mismatch) → issue naming the file.
- Detected package with a matching fragment that isn't selected → issue with fix `init`.
- Selected fragment whose package is gone, or whose version left `appliesTo` → issue.
- Always-on content over 1,500 tokens → issue.
- Legacy `.cursorrules` / `.windsurfrules` present → issue.
- A project with no supported framework is **not** an issue (PRD §3.6).
- Output: grouped human report with a fix command per issue; `--json` → `{ ok, issues: [{ kind, path?, message, fix }] }`.
- Exit `0` when clean, `2` when issues exist, `1` on errors (e.g., unsupported project).

## Out of scope
- Automatic fixing (`doctor --fix` is not planned for v0.1).

## Acceptance criteria
- [x] Freshly initialized fixture → exit `0`, "No issues found."
- [x] Each check has a test that triggers it and asserts kind, message, and fix.
- [x] Adding a supported package to `package.json` → exit `2`.
- [x] The project directory is byte-for-byte unchanged after `doctor` (tree hash before/after), including when no manifest exists.
- [x] `--json` output validates against a zod schema in the test.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js doctor --cwd /tmp/ai-demo; echo "exit=$?"
```

## Commit
`feat(cli): add read-only doctor command`

## Notes
- No manifest is a single "Not initialized" issue (exit `2`) after `detectProject` accepts the directory. An unsupported project (JavaScript, monorepo root, non-empty folder without `package.json`) still exits `1` and writes nothing. Other checks wait for a saved selection, so a new package is not also reported as unselected before the first `init`.
- The plan is built from the manifest selection. `--agents` is ignored. A greenfield manifest with no `package.json` stays greenfield, same as `init`. Package checks are skipped there, so a wizard selection is not flagged for packages that are not installed yet.
- `computeChanges` classifies a removed owned block as `conflict-edited`. Doctor re-reads the markers and reports that case as `missing`. A hash mismatch on a block that is still present is `edited`.
- `update`, `conflict-unmanaged`, and `delete-stale` are issues too (`outdated`, `unmanaged`, `stale`), so CI fails when a later `init` would write. A clean init does not produce them.
- A detected framework or library id that is not in the manifest is `unselected`. Package checks use the fragments the plan compiles, including ones pulled in by `requires`. A fragment's `detect.packages` entry that is absent is `package-removed`. A known version outside `appliesTo` is `unsupported-version`. An unknown version (`null`) is not. Marker-only fragments (shadcn) are not treated as a removed package when the marker file is gone. An empty framework list is not an issue (PRD §3.6).
- The always-on fix is "Reduce always-on rules below 1,500 tokens." Re-running `init` does not shrink the core. The bundled registry stays under the budget, so that check is covered in `tests/doctor/checks.test.ts`.
- `--json` writes `{ ok, issues }` to stdout. `ok` is true only when `issues` is empty. Exit `2` is unchanged in JSON mode. Human output groups issues by kind and prints `Fix:` on every issue. A message that repeats its group title is printed once. `--agents` does not change the report.
