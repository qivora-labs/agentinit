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
- [x] Four workflows exist with all five sections and `pnpm registry:check` passes.
- [x] `new-feature` has an explicit confirmation stop; `review-arch` is explicitly read-only.
- [x] No tool-specific syntax in the bodies.
- [ ] A human reviewed the content.

## Verify
```bash
pnpm registry:check
```

## Commit
`feat(registry): add new-feature, review-arch, refactor, and write-tests workflows`

## Notes
- `verifiedAt` is 2026-10-28. Workflows have no `appliesTo`. The steps come from PRD §5.5. Each `sources` URL is a page those steps were checked against the same day.
- `new-feature` cites [AGENTS.md](https://agents.md/). The closer `AGENTS.md` wins, which is what that page says. The file plan step stops and waits for confirmation. Silence is not confirmation. `{{scripts.typecheck}}`, `{{scripts.lint}}`, and `{{scripts.test}}` are separate lines so a missing script drops only that line. The page's sample `pnpm` commands and its `mv` migration snippet are not copied.
- `review-arch` is read-only: it never edits, creates, deletes, or applies a fix. An empty user's input means the uncommitted changes. Findings use **Blocker**, **Should fix**, and **Nit**, each with `file:line` and a suggested fix. Dependency direction is checked against `ARCHITECTURE.md`, so this fragment does not impose the Clean Architecture dependency rule on flat or feature-based projects. It cites AGENTS.md only for the case where that file states a constraint `ARCHITECTURE.md` does not.
- `refactor` cites [Michael Feathers, Characterization Testing](https://michaelfeathers.silvrback.com/characterization-testing) (2016-08-08). Missing coverage is pinned first: a test named `x`, a dummy expectation, then the actual result, then a name for that behavior. The observed result stays unless the user calls it a bug. Structure changes happen in small steps, with the three script placeholders after each step. Behavior and the public API stay put unless the user's input asks for a change.
- `write-tests` cites [Vitest, Testing in Practice](https://vitest.dev/guide/learn/testing-in-practice) and [Playwright best practices](https://playwright.dev/docs/best-practices). Vitest says not to mock the thing you are testing, and to cover the contract, edges, and errors. Playwright says to assert what the user can see, and to mock a third party you do not control rather than the app. The body stays library-neutral: use the active test-library rule, and mock a dependency only when that rule allows it. The suite runs with `{{scripts.test}}`.
- The user's input is named as such. Bodies do not use `$ARGUMENTS`, `@AGENTS.md`, or `argument-hint`.
- The shared content checklist was re-checked for these four fragments. A human still needs to review them before merge. The shared checklist's human-review box stays open.
