# Launch Checklist — `@agentinit/cli@0.1.0`

Manual steps for making the repository public and publishing the first release. Automated release setup lives in `.github/workflows/release.yml` (changesets "Version Packages" PR → publish with provenance via `NPM_TOKEN`). Owner review of this checklist is a launch gate (not part of merging the release-workflow PR).

**Do not merge the "Version Packages" PR while the repository is private.** npm provenance requires a public repository; publishing from a private repo will fail or produce a package without a provenance attestation. Complete step 5 before step 6.

**If that PR was merged while private:** `main` already has the version bump and consumed changesets, but npm may lack the package (or lack provenance). Recovery: (1) finish step 5 (make the repo public), (2) re-run the failed Release workflow run on that merge commit (Actions → Release → Re-run), or from a clean checkout of `main` run `pnpm install && pnpm release` with `NPM_TOKEN` set and OIDC unavailable locally—prefer re-running the workflow so `id-token: write` can attach provenance. Do not open a new Version Packages PR for the same version; do not revert the bump unless you intend to republish under a different version.

After the release workflow lands on `main`, confirm the Release Action opens or updates a "Version Packages" PR proposing `@agentinit/cli@0.1.0` before continuing (step 6).

## Checklist

1. **v0.1 readiness**
   - [ ] Every v0.1 task in `docs/tasks/README.md` is `done`.
   - [ ] CI (including smoke) is green on `main`.
   - [ ] Rule-effectiveness check (T33) passed and is recorded under `docs/evals/`.
   - [ ] Re-run and record eval cells T1, T3, and T4 after the `typescript-strict` return-type exemption for React components and framework entry files (T45 decision B).

2. **Secret scan**
   - [ ] `gitleaks detect` over the full history reports no findings.

3. **Repository files**
   - [ ] `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, and `.github/CODEOWNERS` are present.

4. **Repository settings**
   - [ ] Branch protection on `main`: required status checks, required pull request reviews (from humans / CODEOWNERS). Do not count `github-actions[bot]` approvals toward the review requirement for code-change PRs.
   - [ ] Secret scanning and push protection enabled.
   - [ ] Dependabot alerts enabled.
   - [ ] Repository secret `NPM_TOKEN` set (classic or granular token with publish access to `@agentinit`).
   - [ ] Actions → General → "Allow GitHub Actions to create and approve pull requests" enabled so the Release workflow can open the Version Packages PR. This setting is repo-wide: never use Actions to approve code-change PRs; a human merges Version Packages.

5. **Make the repository public**
   - [ ] Settings → General → Danger Zone → Change repository visibility → Public.

6. **Publish `0.1.0`**
   - [ ] Confirm a "Version Packages" PR exists proposing `@agentinit/cli@0.1.0` (opened/updated by the Release workflow on pushes to `main` that leave pending changesets).
   - [ ] Merge that PR.
   - [ ] Confirm the Release workflow run succeeds and `@agentinit/cli@0.1.0` appears on npm.
   - [ ] Confirm the npm package page shows a **provenance** attestation/badge. `changeset publish` packs then publishes a tarball; with `publishConfig.provenance: true` and a public repo this usually works in Actions (`id-token: write`), but a green publish alone is not enough—treat this checkbox as failed until the badge is visible. If missing, do not call launch complete; investigate (private repo, token path vs OIDC) or use step 8 Trusted Publishing and republish a patch.

7. **Smoke from a clean machine**
   - [ ] `npx @agentinit/cli@0.1.0 --version` prints `0.1.0`.

8. **Optional hardening**
   - [ ] Switch the package to [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) bound to this workflow, then remove `NPM_TOKEN` from repository secrets and from `release.yml`.
