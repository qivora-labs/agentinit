# Launch Checklist — `@agentinit/cli@0.1.0`

Manual steps for making the repository public and publishing the first release. Automated release setup lives in `.github/workflows/release.yml`: `verify` + `smoke` mirror the CI matrix (including Windows smoke), and only then does the `release` job open the changesets "Version Packages" PR or publish with provenance via [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC; `id-token: write`). Owner review of this checklist is a launch gate (not part of merging the release-workflow PR).

**Do not merge the "Version Packages" PR while the repository is private.** npm provenance requires a public repository; publishing from a private repo will fail or produce a package without a provenance attestation. Complete step 5 before step 6.

**If that PR was merged while private, or publish failed after a version bump landed:** `main` already has the version bump and consumed changesets, but npm may lack the package (or lack provenance). Recovery: (1) finish step 5 if needed (make the repo public), (2) confirm Trusted Publishing on npm (step 8) and that `release.yml` has no `NPM_TOKEN` / `NODE_AUTH_TOKEN`, (3) push a fix to `main` or re-run the failed Release workflow so `id-token: write` can publish with provenance. Do not open a new Version Packages PR for the same version; do not revert the bump unless you intend to republish under a different version.

After the release workflow lands on `main`, confirm the Release Action opens or updates a "Version Packages" PR proposing `@agentinit/cli@0.1.0` before continuing (step 6).

## Checklist

1. **v0.1 readiness**
   - [ ] Every v0.1 task in `docs/tasks/README.md` is `done`, including every M8 (launch readiness) task, T41–T48.
   - [ ] CI (including smoke) is green on `main`, and the latest Release workflow run's `verify` and `smoke` jobs passed.
   - [ ] Rule-effectiveness check (T33) passed and is recorded under `docs/evals/`.
   - [ ] Re-run and record eval cells T1, T3, and T4 after the `typescript-strict` return-type exemption for React components and framework entry files (T45 chose decision B, so this re-run is required).

2. **Secret scan**
   - [ ] `gitleaks detect` over the full history reports no findings.

3. **Repository files**
   - [ ] `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/compatibility.md`, and `.github/CODEOWNERS` are present.
   - [ ] Every minimum version in `docs/compatibility.md` was re-verified against the vendor changelogs for this release, and its **Last verified** date is updated.

4. **Repository settings**
   - [ ] Branch protection on `main`: required status checks, required pull request reviews (from humans / CODEOWNERS). Do not count `github-actions[bot]` approvals toward the review requirement for code-change PRs.
   - [ ] Secret scanning and push protection enabled.
   - [ ] Dependabot alerts enabled.
   - [ ] Actions → General → "Allow GitHub Actions to create and approve pull requests" enabled so the Release workflow can open the Version Packages PR. This setting is repo-wide: never use Actions to approve code-change PRs; a human merges Version Packages. (If this stays off, open the Version Packages branch/`changeset-release/main` PR by hand after `changeset version`.)

5. **Make the repository public**
   - [ ] Settings → General → Danger Zone → Change repository visibility → Public.

6. **Publish `0.1.0`**
   - [ ] Confirm a "Version Packages" PR exists proposing `@agentinit/cli@0.1.0` (opened/updated by the Release workflow on pushes to `main` that leave pending changesets).
   - [ ] Merge that PR.
   - [ ] Confirm the Release workflow run succeeds and `@agentinit/cli@0.1.0` appears on npm.
   - [ ] Confirm the npm package page shows a **provenance** attestation/badge. `changeset publish` packs then publishes a tarball; with Trusted Publishing and a public repo this usually works in Actions (`id-token: write`), but a green publish alone is not enough—treat this checkbox as failed until the badge is visible. If missing, do not call launch complete; investigate (private repo, missing trusted publisher, leftover `NPM_TOKEN` overriding OIDC).

7. **Smoke from a clean machine**
   - [ ] `npx @agentinit/cli@0.1.0 --version` prints `0.1.0`.

8. **npm Trusted Publishing** (required for publish when the package requires 2FA for writes)
   - [ ] On npmjs.com → `@agentinit/cli` → Settings → Trusted publishing: GitHub Actions with org `qivora-labs`, repo `agentinit`, workflow filename `release.yml`, no environment (unless the job sets one). Allow **`npm publish`**. Complete a successful publish within 2 days of creating the connection or it expires.
   - [ ] `release.yml` uses `id-token: write`, upgrades npm to ≥ 11.5.1, and does **not** set `NPM_TOKEN` / `NODE_AUTH_TOKEN`.
   - [ ] Delete any leftover `NPM_TOKEN` repository secret after the first OIDC publish succeeds.
