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
- [ ] Every command and flag in the README matches `node dist/cli.js --help`.
- [ ] The example tree in the README matches actual output for `next15-src`.
- [ ] Minimum agent versions have sources recorded in **Notes**.
- [ ] Following CONTRIBUTING from a clean clone, `pnpm registry:check` passes with a new sample fragment.
- [ ] `pnpm check:package` passes with no warnings.

## Verify
```bash
pnpm build && node dist/cli.js --help
pnpm check:package
```

## Commit
`docs: add readme, contributing guide, and security policy`

## Notes
_Record decisions and discovered gaps here._
