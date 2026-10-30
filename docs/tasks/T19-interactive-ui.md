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
- [x] Wizard happy path with the fake prompter produces the expected `Selection`; library list excludes incompatible options.
- [x] Choosing "Other TypeScript project" yields `frameworks: []` and offers only framework-agnostic libraries; the summary shows "Framework: none detected" for such projects.
- [x] Summary "Use detected" returns the draft unchanged; "Customize" changes are reflected.
- [x] Low-confidence architecture prompts even when "Use detected" is chosen.
- [x] Every row of PRD §3.5 has a unit test for `nonInteractiveSelection`.
- [x] Cancelling at any prompt yields exit code `130`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(ui): add greenfield wizard, detection summary, and non-interactive defaults`

## Notes
- The wizard, summary, and `--yes` path return `PromptedSetup`: a resolver `Selection` plus `agents`. Agents are not fragment ids, so they are not fields on `Selection`. `--agents` is an optional override on `runGreenfieldWizard`, `confirmDetected`, and `nonInteractiveSelection`; when set, the agent prompt is skipped.
- `nonInteractiveSelection` takes a discriminated input (`greenfield`, `javascript`, `monorepo`, `existing`) because the first three rows have no draft. Error rows are returned as `AgentInitError`, not thrown. JavaScript and monorepo messages match `detectProject`. Greenfield tells the user to run again without `--yes`. That is not `NotInteractiveError`, whose hint says to pass `--yes`.
- File rows (`adopt` / `skip` / `skip`) are `FILE_DEFAULTS` on the success result. `io/` cannot import `src/ui/` beyond the prompter interface, so T26 repeats those three values.
- Below the git root, `--yes` sets `useGitRoot: false`. Interactive `confirmGitRoot` defaults to stay (`initialValue: false`).
- Low confidence is `< 0.7`. `--yes` sets architecture to `flat`, marks that id `manual`, and adds a `low-confidence-architecture` notice. The interactive "Use this configuration" path still asks, with `flat` as the initial value. Confidence `0.7` keeps the detected id. Customize asks for architecture once; it does not add a second low-confidence prompt.
- "Use this configuration" copies the draft and marks those ids `detected`, except the low-confidence architecture answer, which is `manual`. Customize marks every chosen id `manual`.
- Framework and library groups are the PRD §3.2 presentation order. Labels, descriptions, and `compatibleWith` come from the registry. An id with no group is offered under Other. `other-typescript-project` is a sentinel, not a fragment id, and becomes `frameworks: []`. Clack has no option groups; `PromptOption.group` is prefixed onto the label in the clack adapter.
- An empty library list skips the multiselect. The summary prints `Framework: none detected` and "No framework rules matched; generating base rules." when `frameworks` is empty. `resolveSelection` still emits `no-framework` later; the summary does not wait for it.
- `promptConflicts` asks keep one / keep both for each pair from `resolveSelection`. Keep one drops the other id from `frameworks`, `libraries`, and `origin`. Dropping the language or architecture id throws, because those fields need a replacement the prompt does not choose.
