# Launch Checklist — `@agentinit/cli@0.1.0`

Manual steps for making the repository public and publishing the first release. Automated release setup lives in `.github/workflows/release.yml` (changesets "Version Packages" PR → publish with provenance via `NPM_TOKEN`).

**Do not merge the "Version Packages" PR while the repository is private.** npm provenance requires a public repository; publishing from a private repo will fail or produce a package without a provenance attestation. Complete step 5 before step 6.

## Checklist

1. **v0.1 readiness**
   - [ ] Every v0.1 task in `docs/tasks/README.md` is `done`.
   - [ ] CI (including smoke) is green on `main`.
   - [ ] Rule-effectiveness check (T33) passed and is recorded under `docs/evals/`.

2. **Secret scan**
   - [ ] `gitleaks detect` over the full history reports no findings.

3. **Repository files**
   - [ ] `README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, and `.github/CODEOWNERS` are present.

4. **Repository settings**
   - [ ] Branch protection on `main`: required status checks, required pull request reviews.
   - [ ] Secret scanning and push protection enabled.
   - [ ] Dependabot alerts enabled.
   - [ ] Repository secret `NPM_TOKEN` set (classic or granular token with publish access to `@agentinit`).
   - [ ] Actions → General → "Allow GitHub Actions to create and approve pull requests" enabled (needed for the Version Packages PR).

5. **Make the repository public**
   - [ ] Settings → General → Danger Zone → Change repository visibility → Public.

6. **Publish `0.1.0`**
   - [ ] Confirm a "Version Packages" PR exists proposing `@agentinit/cli@0.1.0` (opened/updated by the Release workflow on pushes to `main` that leave pending changesets).
   - [ ] Merge that PR.
   - [ ] Confirm the Release workflow publishes and `@agentinit/cli@0.1.0` appears on npm with a provenance badge.

7. **Smoke from a clean machine**
   - [ ] `npx @agentinit/cli@0.1.0 --version` prints `0.1.0`.

8. **Optional hardening**
   - [ ] Switch the package to [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) bound to this workflow, then remove `NPM_TOKEN` from repository secrets and from `release.yml`.
