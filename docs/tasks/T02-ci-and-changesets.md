# T02 · CI, Changesets, CODEOWNERS

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M1 — Foundation | T01 | T32 | §4.2, §8.2, §10 | S |

## Goal
Every push and PR runs lint, typecheck, tests, build, and package checks on Linux, macOS, and Windows. Versioning is managed by changesets.

## Context
- The repo is private now and will be made public before the first npm publish (npm provenance requires a public repo).
- Release publishing is **not** part of this task (T32).

## Scope
- `.github/workflows/ci.yml`:
  - Triggers: `push` to `main`, `pull_request`.
  - Matrix: `os: [ubuntu-latest, macos-latest, windows-latest]` × `node: [22, 24]`.
  - Steps: checkout → `pnpm/action-setup` (version from `packageManager`) → `actions/setup-node` with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` → `pnpm check:package`.
  - `permissions: contents: read`; `concurrency` cancels superseded runs on the same ref.
- Changesets: `pnpm changeset init`; set `access: "public"`, `baseBranch: "main"` in `.changeset/config.json`.
- `.github/CODEOWNERS`: default owner for `*` and explicit owner for `/registry/`. **Ask the user for their GitHub handle**; don't guess.
- `.github/pull_request_template.md`: task id, summary, checklist mirroring the Definition of Done in `docs/tasks/README.md`.

## Out of scope
- `release.yml` and npm publishing (T32).
- The `registry:check` CI step (added by T08).
- Branch protection settings (manual, listed in T32's launch checklist).

## Implementation notes
- Pin actions to a major version tag (e.g., `actions/checkout@v5`); check each action's current major before writing.
- Windows runners: make sure no step relies on POSIX shell features (`shell: bash` if needed).

## Acceptance criteria
- [ ] `ci.yml` is valid (run `actionlint` locally if available, or push the branch and confirm the run starts).
- [ ] All 6 matrix jobs pass on the PR for this task.
- [ ] `pnpm changeset status` runs without error.
- [ ] CODEOWNERS uses the handle confirmed by the user.

## Verify
```bash
pnpm changeset status
# Push the branch and confirm the CI run is green on all matrix jobs.
```

## Commit
`ci: add ci workflow, changesets, and codeowners`

## Notes
_Record decisions and discovered gaps here._
