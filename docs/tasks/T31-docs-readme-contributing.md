# T31 · README & CONTRIBUTING

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M6 — Quality & Launch | T27, T28 | T32 | §1, §3.1, §5.2, §5.4, §10 | M |

## Goal
Public-facing documentation that gets a new user to working rules in a minute and a new contributor to a merged fragment in five.

## Scope
- `README.md`:
  - Pitch, the scoped install command (`npx @agentinit/cli`), and a note that the unscoped `agentinit` package is unrelated.
  - Quick start for existing and new projects; demo GIF placeholder (`docs/demo.gif`) plus a `docs/demo.tape` script for [VHS](https://github.com/charmbracelet/vhs) so a human can record it.
  - Example generated file tree and token report (copy from a real `init` run on `next15-src`).
  - Supported stack table (frameworks, libraries) generated from `list --json`, and supported agents with **minimum versions** (verify each from official docs/changelogs; record sources in **Notes**).
  - Commands and flags (PRD §3.1), `doctor` in CI example (GitHub Actions snippet).
  - How it stays safe (managed blocks, manifest, backups) and "No telemetry."
  - FAQ: legacy `.cursorrules`, monorepos, JavaScript projects, Copilot surfaces that ignore `AGENTS.md`.
- `CONTRIBUTING.md`:
  - Dev setup and commands (from `AGENTS.md`).
  - "Add a fragment in 5 minutes": copy a template, fill frontmatter, follow the 3-part formula, run `pnpm registry:check`, open a PR. Include the rules from PRD §10.
  - Commit convention (no co-author trailers) and the task workflow in `docs/tasks/`.
- `registry/_template.md` is **not** added inside `registry/` (it would be loaded); put the template in `docs/fragment-template.md`.
- `SECURITY.md`: how to report vulnerabilities privately.

## Out of scope
- Recording the GIF (manual).
- Splitting the PRD (optional, after launch).

## Acceptance criteria
- [x] Every command and flag in the README matches `node dist/cli.js --help`.
- [x] The example tree in the README matches actual output for `next15-src`.
- [x] Minimum agent versions have sources recorded in **Notes**.
- [x] Following CONTRIBUTING from a clean clone, `pnpm registry:check` passes with a new sample fragment.
- [x] `pnpm check:package` passes with no warnings.

## Verify
```bash
pnpm build && node dist/cli.js --help
pnpm check:package
```

## Commit
`docs: add readme, contributing guide, and security policy`

## Notes
- Example tree + `Always-on tokens: 758` captured from `node dist/cli.js init --yes` on `tests/fixtures/next15-src` (2026-11-03).
- Fragment template lives at `docs/fragment-template.md` (not under `registry/`, so it is not loaded). Copying it to `registry/libraries/example-lib.md` and running `pnpm registry:check` → 0 errors, 0 warnings.
- Minimum agent versions (verified 2026-11-03):
  - **Cursor ≥ 0.45** — `.cursor/rules` project rules (`.mdc`) introduced: https://cursor.com/changelog/0-45-x ; current format: https://cursor.com/docs/rules
  - **Claude Code ≥ 2.1.84** — `.claude/rules/` since 2.0.64 (https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md); Skills since 2.0.20; YAML list `paths:` (what we emit) since 2.1.84; docs: https://code.claude.com/docs/en/claude-md
  - **Windsurf ≥ 1.12.25** — `AGENTS.md` support/fixes (2025-10-22): https://www.havoptic.com/r/windsurf-1.12.25 ; file-based `.windsurf/rules` earlier in Wave 8 (~1.8.2, 2025-05): https://devin.ai/blog/windsurf-wave-8-cascade-customization-features/ ; docs: https://docs.windsurf.com/windsurf/cascade/agents-md
  - **GitHub Copilot / VS Code ≥ 1.100** — `.instructions.md` + `applyTo` and `.prompt.md`: https://code.visualstudio.com/updates/v1_100 ; root `AGENTS.md` auto-attach in VS Code ≥ 1.104: https://code.visualstudio.com/updates/v1_104/ ; Copilot instructions overview: https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide
- `docs/demo.gif` recorded with `vhs docs/demo.tape` (uses `docs/demo-setup.sh` to run a local build against `next15-src`, since `@agentinit/cli` is not on npm yet).
