# T48 · Release Gate, Docs Accuracy & Launch Hygiene

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | T42, T43, T46, T47 | Launch (`docs/release-checklist.md`) | §1.5, §3.1, §5.4 (minimum versions), §9 | M |

## Goal
Nothing gets published without passing the same checks as a pull request. The README and `list` describe what the CLI actually does at `0.1.0`, and the first changelog reads like a product release.

## Context
- `.github/workflows/ci.yml` has its `push: main` trigger commented out, so `main` is never verified after a merge.
- `.github/workflows/release.yml` publishes with `pnpm release` (`pnpm build && changeset publish`). It runs no lint, tests, registry check, `doctor`, or smoke test.
- `.changeset/` holds three `minor` changesets (`cli-command-shell.md`, `registry-list.md`, `initial-release.md`) and three empty ones. The `0.1.0` changelog would list internal milestones such as "Add command routing…".
- The README says **Cursor ≥ 0.45** for `.cursor/rules`, `.cursor/commands`, and reading `AGENTS.md`. 0.45 introduced `.mdc` rules only; custom commands and `AGENTS.md` support came in later releases. The sources for these minimum versions live in `docs/tasks/T31-docs-readme-contributing.md`, which is not a user-facing page.
- `list` doesn't show `appliesTo`, so users can't see that a fragment covers only certain versions (for example, Next.js App Router `>=16.3.0`).
- The bin is named `agentinit`, the same as the unrelated unscoped npm package (PRD §1.5). `npx agentinit` runs the other tool, and global installs clash. This is very hard to change after launch.

## Decisions (owner, before starting)
1. **Bin and package naming.** Record one under **Notes** and in PRD §1.5: keep `agentinit` as the bin (accept the collision); add a second, distinct bin alias; or try to acquire the unscoped `agentinit` name. This only needs to be decided, not implemented, unless the choice changes `package.json`.

## Scope
1. **CI on `main`** (`.github/workflows/ci.yml`): re-enable `push: branches: [main]`.
2. **Gate publishing** (`.github/workflows/release.yml`): add a `verify` job (install, lint, `registry:check`, typecheck, build, test, `node dist/cli.js doctor`, `check:package`, smoke). The `release` job `needs: verify`. Keep `id-token: write` only on the `release` job.
3. **Changesets**: delete `cli-command-shell.md`, `registry-list.md`, and the three empty changesets. Rewrite `initial-release.md` as the single `minor` entry: a short paragraph and a bullet list of user-facing capabilities, including the T41–T47 behavior. Confirm with `pnpm changeset status`.
4. **Compatibility page**: move the minimum agent versions and their sources from T31 Notes to `docs/compatibility.md`. Re-verify each one against the official changelogs today, one minimum per output kind (rules, workflows/commands, `AGENTS.md`). Link it from the README in place of the T31 link.
5. **`list` shows version ranges** (`src/commands/list.ts`): the text output adds the `appliesTo` range after the description, for example `next >=15 <16.3.0`. `--json` adds an `appliesTo` field. Update tests and the README "Supported stack" table with the ranges.
6. **README final pass**:
   - Example output and file counts after T44 and T46.
   - `--no-workflows`, `remove --all`, fragment opt-out (`excluded`), and `doctor` warnings vs errors.
   - A short "How this relates to `/init` in your agent" paragraph: agent-generated project notes and agentinit's vetted framework rules plus CI drift checks complement each other.
   - A sentence listing other agents that read root `AGENTS.md`; verify each against its official docs before naming it.
   - Re-record `docs/demo.gif` if the interactive output changed (`vhs docs/demo.tape`).
7. **Release checklist** (`docs/release-checklist.md`): step 1 also requires all M8 tasks to be `done`, plus the T45 eval re-run if decision B was chosen. Step 3 also requires `docs/compatibility.md`.

## Out of scope
- npm Trusted Publishing (already an optional checklist step).
- Making the repository public or publishing (owner, manual).

## Implementation notes
- Validate both workflows with `actionlint` if it is available.
- Changesets v3 / `changesets/action@v2` details are in T32 Notes.
- README claims about third-party tools must cite a source in `docs/compatibility.md`.

## Acceptance criteria
- [ ] Naming decision recorded under **Notes** and in PRD §1.5.
- [ ] CI runs on pushes to `main`. `release` cannot run unless `verify` passed.
- [ ] `pnpm changeset status` proposes `@agentinit/cli@0.1.0` from exactly one changeset.
- [ ] `docs/compatibility.md` lists re-verified minimum versions with sources. The README links to it and no longer links to `docs/tasks/`.
- [ ] `list` and `list --json` show `appliesTo` ranges.
- [ ] README examples match real output from the current build on `next15-src`.
- [ ] `docs/release-checklist.md` updated.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:package
pnpm changeset status
node dist/cli.js list
node dist/cli.js list --json
```

## Commit
`ci: gate releases on verification and refresh launch docs`
(Split if it reads better: `ci: run ci on main and gate release on verify`, `feat(cli): show version ranges in list`, `docs: refresh readme and add compatibility page`.)

## Notes
