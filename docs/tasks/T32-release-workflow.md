# T32 · Release Workflow & Launch Checklist

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M6 — Quality & Launch | T02, T30, T31 | — | §7 M6, §9 | S |

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
  - Steps: checkout → pnpm → node (registry `https://registry.npmjs.org`) → install → build → `changesets/action` with `publish: pnpm release`, `NODE_AUTH_TOKEN`/`NPM_TOKEN` from secrets.
  - Behavior: opens/updates a "Version Packages" PR; merging it publishes.
- `.changeset/initial-release.md`: `minor` bump for `@agentinit/cli` with a short release summary.
- `docs/release-checklist.md`:
  1. All v0.1 tasks `done`; CI and smoke green; rule-effectiveness check (T33) passed.
  2. Secret scan of full history (`gitleaks detect`), no findings.
  3. `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS` present.
  4. Repository settings: branch protection on `main` (required checks, PR reviews), secret scanning + push protection, Dependabot alerts.
  5. Make the repository public.
  6. Merge the "Version Packages" PR → verify `@agentinit/cli@0.1.0` on npm with provenance badge.
  7. Test `npx @agentinit/cli@0.1.0 --version` from a clean machine.
  8. Optional hardening: switch to npm Trusted Publishing (OIDC) and delete `NPM_TOKEN`.

## Out of scope
- Making the repo public or publishing (manual, by the owner, following the checklist).

## Acceptance criteria
- [ ] `release.yml` is valid (`actionlint`) and, on `main`, opens a "Version Packages" PR proposing `0.1.0`.
- [ ] The workflow does **not** publish while the repository is private (document this in the checklist; don't merge the version PR before step 5).
- [ ] Checklist reviewed by the owner.

## Verify
```bash
pnpm changeset status
```

## Commit
`ci: add changesets release workflow and launch checklist`

## Notes
_Record decisions and discovered gaps here._
