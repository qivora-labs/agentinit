# T32 · Release Workflow & Launch Checklist

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M6 — Quality & Launch | T02, T30, T31 | — | §3.6, §7 M6, §9 | M |

## Goal
Automated, provenance-signed npm releases via changesets, plus a checklist for making the repository public and publishing `0.1.0`.

## Context
- The npm token is stored as the repository secret `NPM_TOKEN`.
- npm provenance requires a **public** repository; the first publish must happen after the repo is made public.
- `package.json` has `publishConfig.provenance: true` and version `0.0.0`; a `minor` changeset produces `0.1.0`.

## Scope
- `.github/workflows/release.yml`:
  - Trigger: `push` to `main`.
  - `permissions: contents: write, pull-requests: write, id-token: write`.
  - Steps: checkout → pnpm → node (registry `https://registry.npmjs.org`) → install → `changesets/action@v2` with `publish-script: pnpm release` (builds inside the script), `github-token`, and `NODE_AUTH_TOKEN`/`NPM_TOKEN` from secrets.
  - Behavior: opens/updates a "Version Packages" PR; merging it publishes.
- `.changeset/initial-release.md`: `minor` bump for `@agentinit/cli` with a short release summary.
- **Dogfooding** (PRD §7 M6):
  - Run `node dist/cli.js init --yes` on this repository. Hand-written `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `.cursor/`, and `.claude/` content must stay intact outside managed blocks; review the diff before committing the generated files and `.agentinit/manifest.json`.
  - Expect base rules (no framework, PRD §3.6). Record anything that reads poorly as a follow-up for registry content.
  - Add a `node dist/cli.js doctor` step to `.github/workflows/ci.yml` after `pnpm build`.
- `docs/release-checklist.md`:
  1. All v0.1 tasks `done`; CI and smoke green; rule-effectiveness check (T33) passed.
  2. Secret scan of full history (`gitleaks detect`), no findings.
  3. `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS` present.
  4. Repository settings: branch protection on `main` (required checks; human/CODEOWNERS reviews—not bot approvals for code PRs), secret scanning + push protection, Dependabot alerts, repository secret `NPM_TOKEN`, and Actions → "Allow GitHub Actions to create and approve pull requests" (repo-wide; only for opening Version Packages—humans merge; never bot-approve code PRs).
  5. Make the repository public.
  6. Merge the "Version Packages" PR → verify `@agentinit/cli@0.1.0` on npm and confirm the provenance badge (publish success alone is not enough).
  7. Test `npx @agentinit/cli@0.1.0 --version` from a clean machine.
  8. Optional hardening: switch to npm Trusted Publishing (OIDC) and delete `NPM_TOKEN`.

## Out of scope
- Making the repo public or publishing (manual, by the owner, following the checklist).
- Owner review of `docs/release-checklist.md` before launch (launch gate, not a merge gate for this PR).

## Acceptance criteria
- [x] `release.yml` is valid (`actionlint`) and `pnpm changeset status` proposes `@agentinit/cli@0.1.0` (confirm the Version Packages PR opens after this lands on `main` — checklist step 6).
- [x] The workflow does **not** publish while the repository is private (document this in the checklist; don't merge the version PR before step 5).
- [x] Dogfooding: generated files committed, hand-written content unchanged outside managed blocks, and CI `doctor` step passes.

## Verify
```bash
pnpm changeset status
```

## Commit
`ci: add changesets release workflow and launch checklist`

## Notes
- `changesets/action@v2` (paired with `@changesets/cli` v3) uses `publish-script` and `github-token`, not the v1 `publish` input or a `GITHUB_TOKEN` env var. Official v2 README documents both.
- Release job pins the same action majors as CI (`checkout@v7`, `pnpm/action-setup@v6`, `setup-node@v7`) and Node 22. Both `NPM_TOKEN` and `NODE_AUTH_TOKEN` are set from `secrets.NPM_TOKEN` so setup-node's registry `.npmrc` and the action agree.
- `pnpm changeset status` reports a `minor` bump for `@agentinit/cli` (from `0.0.0` → `0.1.0`) via existing minors plus `.changeset/initial-release.md`. After merge to `main`, confirm the Release workflow opens/updates the Version Packages PR (checklist step 6).
- Dogfood (`init --yes`): base rules only (no framework); agents cursor + claude; library vitest; architecture `flat`. Hand-written text in `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, and existing `.cursor/` / `.claude/` workflow files stayed outside managed blocks. `doctor` reports no issues.
- Follow-up (registry content): the `flat` architecture fragment still steers toward `src/components/`, `src/hooks/`, etc., which reads poorly for this CLI repo. Consider a `node-library` / non-web architecture path (PRD §0.3 mentions `node-library`).
- Owner must still review `docs/release-checklist.md` before launch (out of scope for this PR).
- Index also marks T30 `done` (dependency already merged); that status update is housekeeping, not T32 product scope.
