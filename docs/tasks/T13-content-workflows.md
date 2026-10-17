# T13 · Content: Workflows

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T08 | T29 | §5.5 | M |

## Goal
Four workflow fragments (slash commands) that implement the specifications in PRD §5.5.

## Context
- PRD §5.5 defines input, steps, and output for each workflow. These files become `.cursor/commands/`, `.claude/skills/`, `.windsurf/workflows/`, and `.github/prompts/` files, so write them **agent-neutral** (no tool-specific syntax).
- Each workflow body has sections `## Purpose`, `## Input`, `## Steps`, `## Output`, `## Guardrails` (enforced by T08).
- Reference project commands with placeholders (`{{scripts.typecheck}}`, `{{scripts.lint}}`, `{{scripts.test}}`); lines with missing scripts are dropped automatically.

## Scope
`registry/workflows/` (`category: workflow`, `order: 50`):
- `new-feature.md` — `argumentHint: "<feature-name> <short description>"`. Must **stop and wait for confirmation** after proposing the file plan.
- `review-arch.md` — `argumentHint: "[path]"`. **Read-only**: must explicitly forbid editing files; findings grouped by severity with `file:line` and a suggested fix.
- `refactor.md` — `argumentHint: "<target> <goal>"`. Characterization tests first when coverage is missing; behavior and public API unchanged unless requested.
- `write-tests.md` — `argumentHint: "<target>"`. Uses the test library from active rules; never mocks the unit under test.

## Out of scope
- How each agent formats these files (T21–T24).
- `/agentinit-customize` (v0.2).

## Implementation notes
- Refer to `AGENTS.md` and `ARCHITECTURE.md` by name; every agent can read them.
- Phrase the argument as "the user's input" rather than tool-specific variables like `$ARGUMENTS`; targets can add tool-specific wiring later if needed.
- Keep each workflow ≤ 60 lines; workflows are loaded only when invoked, but shorter prompts are followed more reliably.

## Acceptance criteria
- [ ] Four workflows exist with all five sections and `pnpm registry:check` passes.
- [ ] `new-feature` has an explicit confirmation stop; `review-arch` is explicitly read-only.
- [ ] No tool-specific syntax in the bodies.
- [ ] A human reviewed the content.

## Verify
```bash
pnpm registry:check
```

## Commit
`feat(registry): add new-feature, review-arch, refactor, and write-tests workflows`

## Notes
_Record decisions and discovered gaps here._
