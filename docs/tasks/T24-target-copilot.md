# T24 · GitHub Copilot Target

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M4 — Targets | T20 | T27, T28 | §5.2, §5.3, §5.4 (Copilot), §13 | M |

## Goal
Generate Copilot repository instructions, path-specific instructions, and prompt files.

## Context
- Copilot reads `AGENTS.md` in many surfaces but not all (PRD §13); `.github/copilot-instructions.md` holds a pointer.
- Verify current formats in GitHub's docs: `.github/instructions/*.instructions.md` (`applyTo`, and whether `description` is supported) and `.github/prompts/*.prompt.md` (frontmatter fields such as `description`, `argument-hint`, `agent`/`mode`).

## Scope
`src/targets/copilot.ts` registered in the adapter map:
- `.github/copilot-instructions.md` managed block `copilot`: a short pointer — follow `AGENTS.md` at the repo root; scoped rules are in `.github/instructions/`.
- `glob` and `auto` → `.github/instructions/agentinit-<id>.instructions.md` with `applyTo: "a,b"` (quoted string). Add `description` if the current docs support it.
- `manual` → `.github/prompts/agentinit-<id>.prompt.md`.
- Workflows → `.github/prompts/<id>.prompt.md` with `description` and the documented argument field.

## Out of scope
- Inline mode for surfaces that ignore `AGENTS.md` (v0.2).

## Acceptance criteria
- [ ] Snapshot tests for the pointer block, each scope, and one workflow.
- [ ] `applyTo` is a single quoted comma-separated string.
- [ ] Frontmatter round-trips through `yaml.parse`.
- [ ] Notes record which docs pages were used to confirm the formats.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add github copilot instructions and prompts output`

## Notes
_Record decisions and discovered gaps here._
