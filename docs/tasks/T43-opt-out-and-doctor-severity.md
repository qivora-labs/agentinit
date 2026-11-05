# T43 · Fragment Opt-Out & `doctor` Severity

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | T41, T42 | T46, T47 | §3.3 steps 4–5, §3.4, §3.5, §6.2, §6.5 | M |

## Goal
A team can intentionally leave out a detected fragment, or keep a legacy rule file, and still run `doctor` in CI without it failing forever. Only real drift fails the build.

## Context
In the pre-launch review:
- Deselecting a detected fragment (here, removing `zustand` from `selections.libraries`, which is what *Customize* does) makes `doctor` exit `2` with "Zustand (zustand) matches this project and is not selected." This can't be silenced. Running `init` again brings the fragment back as "added".
- A `.cursorrules` file makes `doctor` exit `2` until it is deleted, even when the team still needs it.
- Every `doctor` issue has the same weight. `collectDoctorIssues` in `src/doctor/checks.ts` returns a flat list, and any issue gives exit `2`.
- The manifest schema (`src/io/manifest.ts`) is `.strict()`. A field added after `0.1.0` would make older CLIs reject newer manifests, so the field should land before the first publish.

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Severity per issue kind.** Recommended:
   - **error** (exit `2`): `not-initialized`, `missing`, `edited`, `outdated`, `unmanaged`, `stale`, `unselected`, `package-removed`, `unsupported-version`.
   - **warning** (exit `0`): `legacy-file`, `always-on-tokens`.
2. **Edited managed content** stays an error (recommended). Customizing generated rules arrives with team fragments in v0.2. The fix text should explain the options in the meantime.

## Scope
1. **Manifest** (`src/io/manifest.ts`): add `selections.excluded: string[]`, a sorted list of fragment ids. It is optional when read (older manifests parse) and always written. Ids must be kebab-case and unique.
2. **Where `excluded` changes** (`src/ui/wizard.ts`, `src/ui/saved-selection.ts`, `src/commands/init.ts`):
   - In *Customize*, deselecting a fragment that detection suggested adds its id to `excluded`. Selecting it again removes the id.
   - `--yes` never changes `excluded`.
   - Ids that are no longer in the registry are dropped with a notice.
3. **Detection and re-runs respect `excluded`**: suggested fragments minus `excluded` become the defaults. Re-run "What changed" lists and the up-to-date shortcut ignore excluded ids. The summary card shows excluded fragments on one muted line, for example "Excluded: Zustand".
4. **`doctor`** (`src/doctor/checks.ts`, `src/commands/doctor.ts`):
   - `unselected` skips excluded ids.
   - `DoctorIssue` gains `severity: 'error' | 'warning'`, following decision 1.
   - Exit `2` only when at least one error exists.
   - The TTY checklist shows a warning icon for checks with only warnings, and the summary line counts errors and warnings separately.
   - `--json` gains `severity` per issue, and `ok` is `true` when there are no errors.
5. **Fix text**: the `edited` fix says "Move your text outside the agentinit markers, then run `npx @agentinit/cli init`, or exclude the fragment with *Customize*." The `legacy-file` fix stays as it is.
6. **PRD**: §6.2 (manifest example and `excluded`), §6.5 (severity table and exit code), §3.4 (re-runs respect `excluded`), §3.5 (`--yes` keeps `excluded`).

## Out of scope
- Excluding single directives inside a fragment, and team fragments (v0.2).
- `--strict` or severity flags for `doctor` (backlog, Phase 2).
- Corrupt-manifest exit codes (backlog, Phase 1).

## Implementation notes
- `doctor/checks.ts` is pure. Severity is a lookup table keyed by `DoctorIssueKind`. Add a `never` exhaustiveness check so a new kind must pick a severity.
- Keep `DOCTOR_ISSUE_KINDS` order and group titles. Update screen snapshots (`tests/__snapshots__/e2e/screens/doctor-*`) with `pnpm test:screens`.
- Excluding a framework is allowed. The project then falls back to base rules (PRD §3.6).

## Acceptance criteria
- [x] Owner decisions recorded under **Notes**, and the PRD updated.
- [x] Excluding Zustand in *Customize* writes `"excluded": ["zustand"]`. A following `doctor` exits `0`, and `init --yes` doesn't re-add it.
- [x] Selecting Zustand again in *Customize* removes it from `excluded`.
- [x] With `.cursorrules` present and nothing else wrong, `doctor` exits `0`, shows the warning on a TTY, and reports `"severity": "warning"` in `--json`.
- [x] A hand-edited managed file still exits `2`, and the fix text names both options.
- [x] Manifests without `excluded` (fixtures, dogfood) parse. The next write adds `"excluded": []`.
- [x] `--json` output for a healthy project is `{ "ok": true, "issues": [] }`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:screens
cp -r tests/fixtures/next15-src /tmp/ai-t43 && node dist/cli.js init --yes --cwd /tmp/ai-t43
echo "old" > /tmp/ai-t43/.cursorrules && node dist/cli.js doctor --cwd /tmp/ai-t43; echo "exit=$?"   # expect 0 + warning
```

## Commit
`feat(doctor): add fragment opt-out and warning-level checks`

## Notes
- Owner accepted the recommended severity table and keeping `edited` as an error
  (2026-11-05).
- `selections.excluded` is optional on read (defaults to `[]`) and always written,
  sorted unique kebab-case ids.
- *Customize* updates excluded from detection-suggested ids; `--yes` and *Use this
  configuration* leave it alone. Unknown registry ids are pruned with a notice.
- Doctor TTY close tone uses `warn` when only warnings remain; summary says
  `N error(s), M warning(s) found.`
