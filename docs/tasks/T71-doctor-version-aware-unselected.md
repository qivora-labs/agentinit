# T71 · Version-Aware `unselected` in `doctor`

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M12 — Older majors | — | T72, T73, T74 | §6.5 | S |

## Goal
When a newer CLI detects a fragment that an older manifest never selected, `doctor` warns instead of failing CI — the same idea T49 applied to rule-text drift.

## Context
New for 0.2 (approved 2026-11-13). `checkUnselected` in `src/doctor/checks.ts` always emits `unselected` as an **error**. After this release adds React 18 / Vite 5, Zustand 4, and Vitest 2 rules, every 0.1.x project on those versions that runs an unpinned `npx @agentinit/cli doctor` would exit `2` with no repository change. The README promises that unpinned runs warn on rule updates; package-level gaps from new coverage should follow the same pattern when the manifest `cliVersion` differs from the running CLI.

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Kind vs severity.** Recommended: **reuse** the `unselected` kind and lower severity to **warning** when `cliVersionsDiffer` is true; keep **error** when versions match. Alternative: add a new kind such as `coverage-update` (clearer in `--json`, more API surface).
2. **Message.** Recommended: when warning, say the fragment matches but was not selected under the older CLI, and fix with `npx @agentinit/cli@<running> init` (or Customize / exclude). When versions match, keep today's message.

## Scope
1. **`checkUnselected`** (or its caller): pass `DoctorCliVersions`; set severity from `cliVersionsDiffer` (export or reuse the helper from T49).
2. If reusing the kind with variable severity, ensure TTY grouping, `SEVERITY_FOR_KIND` (may become a function), and `--json` `severity` stay consistent. Prefer a small design that does not break the `never` switches.
3. **PRD** §6.5: document that `unselected` is a warning when CLI versions differ.
4. **README** `doctor` in CI: one sentence that new coverage from a newer CLI warns until you re-run `init` or exclude.
5. Tests: older `cliVersion` + matching unselected fragment → exit `0`, warning; same version → exit `2`.
6. Add a `minor` changeset (severity / `--json` behavior change for consumers). Landing on `release/0.2` before T72–T74 is intentional.

## Out of scope
- `--strict` promoting warnings to errors (backlog P2.5).
- Changing `excluded` handling.
- Implementing the older-major fragments themselves (T72–T74).

## Implementation notes
- `doctor/checks.ts` stays pure; versions are inputs.
- Do not weaken `package-removed` or `unsupported-version`.
- Screen snapshots if the doctor TTY table changes.

## Acceptance criteria
- [ ] Decisions recorded under **Notes**, and the PRD / README updated.
- [ ] Manifest `cliVersion` older than running, fragment would be newly selected: `doctor` exits `0` with `unselected` (or new kind) as **warning**.
- [ ] Same setup with matching `cliVersion`: exits `2` with error severity.
- [ ] Excluded ids still suppress the issue.
- [ ] A `minor` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`fix(doctor): warn on unselected matches when cli versions differ`

## Notes
Recommendations match the 2026-11-13 planning session. Ship before T72–T74 so those PRs do not break unpinned CI on day one of the release branch merge to main.
