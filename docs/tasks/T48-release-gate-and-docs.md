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
- [x] Naming decision recorded under **Notes** and in PRD §1.5.
- [x] CI runs on pushes to `main`. `release` cannot run unless `verify` passed.
- [x] `pnpm changeset status` proposes `@agentinit/cli@0.1.0` from exactly one changeset.
- [x] `docs/compatibility.md` lists re-verified minimum versions with sources. The README links to it and no longer links to `docs/tasks/`.
- [x] `list` and `list --json` show `appliesTo` ranges.
- [x] README examples match real output from the current build on `next15-src`.
- [x] `docs/release-checklist.md` updated.

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
- **Naming decision (owner, 2026-11-07): keep `agentinit` and accept the collision.** The package stays `@agentinit/cli` (the owner holds the `@agentinit` npm org) and keeps a single bin, `agentinit`. `package.json` doesn't change. Recorded in PRD §1.5.
  - `npx @agentinit/cli` and `npx @agentinit/cli@0.1.0` run the sole bin regardless of its name. After a global install, users run `agentinit --help`.
  - Accepted collision: `npx agentinit` resolves to the unrelated unscoped package (v1.28.0, active, same space), and global installs of both packages clash on the `agentinit` bin. The README keeps its "unscoped package is unrelated" note.
  - No second bin alias. npm treats same-file aliases as one bin, but `pnpm dlx` picks only a sole bin or one named after the unscoped package name (`cli`). It fails with `DLX_MULTIPLE_BINS` otherwise.
  - Acquiring the unscoped name was rejected: the package is actively maintained, so npm's dispute policy wouldn't transfer it.
- **Release gate.** `release.yml` sets `permissions: {}` at the top. `verify` (ubuntu, Node 22) gets `contents: read` plus `actions: write` for the pnpm cache, the same as CI. `release` keeps `contents`/`pull-requests: write` and is the only job with `id-token: write`. `actionlint` (run through the `rhysd/actionlint` Docker image) reports 0 errors for both workflows.
- **`list` ranges.** Text output appends `<package> <range>` after the description, two spaces after it. Several packages are sorted by name and joined with `, ` (`react >=19, vite >=6`). `--json` always includes `appliesTo`, as `{}` for fragments without a range (all workflows, languages, architectures, and `shadcn`), so consumers don't need a presence check.
- **Changesets.** Only `initial-release.md` remains (`minor`). `pnpm changeset status` prints `@agentinit/cli -> 0.1.0` from `.changeset/initial-release.md`.
- **Re-verified minimums (2026-11-07)**, in `docs/compatibility.md`:
  - Cursor goes from 0.45 to **1.6**. Rules need 0.45 and commands need 1.6. No official changelog from 0.49 through 2.2 announces `AGENTS.md`, so that floor is recorded as "not pinned", with the docs statement and October 2025 forum reports.
  - Claude Code stays at **2.1.84** (rules `paths:` list). Skills date from 2.0.20 and appear in the slash menu from 2.1.0; `@` imports date from 0.2.107. No changelog entry introduces `disable-model-invocation`; its first mention is a 2.1.110 fix.
  - Windsurf stays at **1.12.25** (`AGENTS.md`). Rules and workflows date from 1.8.2.
  - Copilot in VS Code goes from 1.100 to **1.104** (`AGENTS.md`). Description-only `auto` instructions need 1.102 (on-demand loading); `applyTo` and `.prompt.md` need 1.100.
  - PRD §5.4 now points at `docs/compatibility.md` instead of only the README.
- **README.** Other agents that read root `AGENTS.md`, each checked against its official docs: OpenAI Codex, Amp, and opencode. Jules was left out because its changelog announces a shutdown on 2026-12-31. The `/init` paragraph names Claude Code and opencode, whose docs describe `/init`.
- **Demo.** The interactive flow on `next15-src` now asks the low-confidence architecture question (T44), so `docs/demo.tape` waits for it. Rows went from 60 to 72 and the font from 13 to 12 so the final report fits without scrolling. `docs/demo.gif` was re-recorded.
- **Follow-ups found (not fixed here):**
  - Cursor's commands docs now redirect to skills (`/migrate-to-skills`, Cursor 2.4+), and Cursor also loads `.claude/skills/`. With both Cursor and Claude Code selected, Cursor may list each workflow twice. Consider writing `.cursor/skills` or skipping Cursor commands when Claude is selected.
  - Windsurf (now Devin Desktop) 3.6.22 says workflows are being deprecated in favor of skills.
  - `--help` prints `--no-workflows … (default: true)` (from cac), which reads backwards.
  - The `doctor` `edited` fix prints a literal `*Customize*` and mentions agentinit markers even for whole-file outputs such as `.cursor/rules/*.mdc`, which have none.
