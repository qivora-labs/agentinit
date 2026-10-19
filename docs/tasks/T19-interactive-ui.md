# T19 · Wizard, Summary & `--yes` Defaults

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M3 — Detection | T05, T06, T18 | T27 | §3.2, §3.3 (steps 3–5), §3.5 | L |

## Goal
All user interaction for `init`: the greenfield wizard, the existing-project summary and customization, agent selection, and the non-interactive defaults table — behind a testable prompt interface.

## Context
- PRD §3.2 lists the wizard steps; §3.3 the summary flow; §3.5 the exact `--yes` behavior for every prompt.
- Option lists come from the registry (names, `compatibleWith`), never hard-coded.

## Scope
- Use the `Prompter` interface and fake prompter from T03 (`src/ui/prompter.ts`).
- `src/ui/wizard.ts`: `runGreenfieldWizard(prompter, registry) → Selection` — framework (grouped by type, plus "Other TypeScript project (library, CLI, scripts)" → `frameworks: []`, PRD §3.6), strictness, libraries filtered by `compatibleWith`, architecture (Feature-Based recommended), agents (all preselected).
- `src/ui/summary.ts`: `confirmDetected(prompter, draft, registry) → Selection` — summary box (stack, versions, package manager, layout, architecture with confidence, notices); "Use this configuration / Customize"; customize lets the user change language, frameworks, libraries, architecture; low-confidence architecture always prompts.
- `src/ui/agents.ts`: agent multiselect with preselection from detection.
- `src/ui/git-root.ts`: when running below the git root, ask whether to use the git root instead (default: stay).
- `src/ui/conflicts.ts`: ask how to handle `conflicts` from `resolveSelection` (keep one / keep both).
- `src/ui/defaults.ts`: **pure** `nonInteractiveSelection(draft, options) → Selection | AgentInitError` implementing every row of PRD §3.5 (greenfield → error; low confidence → `flat` + notice; agents → preselected or all four; below git root → stay).
- `src/ui/format.ts`: human-readable formatting for detection and resolver notices.

## Out of scope
- File conflict prompts (Adopt / Backup & replace / Skip) — T26.
- Wiring into the `init` command — T27.

## Implementation notes
- Keep the wizard and summary as functions of `(prompter, data) → result` with no filesystem access.
- `--agents` overrides both the prompt and the preselection.

## Acceptance criteria
- [ ] Wizard happy path with the fake prompter produces the expected `Selection`; library list excludes incompatible options.
- [ ] Choosing "Other TypeScript project" yields `frameworks: []` and offers only framework-agnostic libraries; the summary shows "Framework: none detected" for such projects.
- [ ] Summary "Use detected" returns the draft unchanged; "Customize" changes are reflected.
- [ ] Low-confidence architecture prompts even when "Use detected" is chosen.
- [ ] Every row of PRD §3.5 has a unit test for `nonInteractiveSelection`.
- [ ] Cancelling at any prompt yields exit code `130`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(ui): add greenfield wizard, detection summary, and non-interactive defaults`

## Notes
_Record decisions and discovered gaps here._
