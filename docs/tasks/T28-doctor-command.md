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
- Output: grouped human report with a fix command per issue; `--json` → `{ ok, issues: [{ kind, path?, message, fix }] }`.
- Exit `0` when clean, `2` when issues exist, `1` on errors (e.g., unsupported project).

## Out of scope
- Automatic fixing (`doctor --fix` is not planned for v0.1).

## Acceptance criteria
- [ ] Freshly initialized fixture → exit `0`, "No issues found."
- [ ] Each check has a test that triggers it and asserts kind, message, and fix.
- [ ] Adding a supported package to `package.json` → exit `2`.
- [ ] The project directory is byte-for-byte unchanged after `doctor` (tree hash before/after), including when no manifest exists.
- [ ] `--json` output validates against a zod schema in the test.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js doctor --cwd /tmp/ai-demo; echo "exit=$?"
```

## Commit
`feat(cli): add read-only doctor command`

## Notes
_Record decisions and discovered gaps here._
