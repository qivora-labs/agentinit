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
  - `permissions: contents: read` and `actions: write` (required for `actions/cache` saves); `concurrency` cancels superseded runs on the same ref.
- Changesets: `pnpm changeset init`; set `access: "public"`, `baseBranch: "main"` in `.changeset/config.json`. A change that does not need a release still needs an empty changeset (`pnpm changeset add --empty`) so `pnpm changeset status` exits 0.
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
- [x] `ci.yml` is valid (run `actionlint` locally if available, or push the branch and confirm the run starts).
- [x] All 6 matrix jobs pass on the PR for this task.
- [x] `pnpm changeset status` runs without error.
- [x] CODEOWNERS uses the handle confirmed by the user.

## Verify
```bash
pnpm changeset status
# Push the branch and confirm the CI run is green on all matrix jobs.
```

## Commit
`ci: add ci workflow, changesets, and codeowners`

## Notes
- CODEOWNERS owner is `@tajnur007` for both `*` and `/registry/`, confirmed by the user.
- Actions are pinned to the current majors: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`. The pnpm `version` input is omitted so `pnpm/action-setup` reads `packageManager` (`pnpm@10.14.0`).
- `permissions` includes `actions: write` as well as `contents: read`. `setup-node`'s pnpm cache is `actions/cache`, and a workflow `permissions` block drops every unlisted scope, so a cache save fails without `actions: write`.
- `@changesets/cli` 3.0.3 makes `changeset init` interactive (GitHub changelog, auto-commit, access, base branch). Answers were no GitHub integration, no auto-commit, public access, and base branch `main`. The written config has `access: "public"` and `baseBranch: "main"`.
- `pnpm changeset status` exits 1 when files changed since `main` and no `.changeset/*.md` exists, because the package root is the repo. An empty changeset records that this CI setup does not need a release.
- No new unit test. The acceptance criteria are workflow validity, `changeset status`, and the CI matrix. `actionlint` v1.7.12 reported no problems. The existing smoke test still runs in CI.
- All 6 matrix jobs passed on pull request #2 (run `39959329313`).
