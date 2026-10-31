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
- [x] Snapshot tests for the pointer block, each scope, and one workflow.
- [x] `applyTo` is a single quoted comma-separated string.
- [x] Frontmatter round-trips through `yaml.parse`.
- [x] Notes record which docs pages were used to confirm the formats.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add github copilot instructions and prompts output`

## Notes
- Checked [Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [VS Code custom instructions](https://code.visualstudio.com/docs/agent-customization/custom-instructions), [VS Code prompt files](https://code.visualstudio.com/docs/agent-customization/prompt-files), and [Prompt files for GitHub Copilot](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-files) on 2026-11-01. GitHub.com path-specific files use `applyTo` as one quoted comma-separated string (`applyTo: "**/*.ts,**/*.tsx"`). Optional `excludeAgent` is `"code-review"` or `"cloud-agent"`. That page does not list `description`. VS Code instruction files do: `description` loads the file when the task matches, and `applyTo` attaches it when a matching file is created or edited. Prompt files live in `.github/prompts/*.prompt.md`. Their frontmatter includes `description`, `name`, `argument-hint`, `agent` (`ask`, `agent`, `plan`, or a custom agent), `model`, and `tools`. There is no `mode` field.
- The pointer is managed block `copilot` on `.github/copilot-instructions.md` (`target: 'copilot'`). Inner content tells Copilot to follow `AGENTS.md` at the repository root and that scoped rules are in `.github/instructions/`. It is prose, not an `@AGENTS.md` import. Markers stay in `src/io/`. `always` text is not copied (PRD §5.1, §13). Inline mode stays out of scope.
- `glob` and `auto` both write `.github/instructions/agentinit-<id>.instructions.md` with `description` and `applyTo`. `description` is included because the VS Code docs support it. GitHub.com still keys off `applyTo`, so the PRD §5.3 glob fallback stays. `applyTo` is always one double-quoted string, including a single pattern and a value that starts with `*` (`applyTo: "**/*.tsx,**/*.css"`). A leading `*` is a YAML alias. This is not a YAML list and not one pair of quotes per pattern.
- A `glob` or `auto` fragment whose rendered glob list is empty is omitted. GitHub.com code review ignores an instruction file with no `applyTo`. `excludeAgent` is omitted, so both code review and the cloud agent read the file. A glob that itself contains a comma would be ambiguous in this field; the registry schema does not forbid that.
- `manual` writes `.github/prompts/agentinit-<id>.prompt.md` with `description` only. Workflows write `.github/prompts/<id>.prompt.md` with `description` and `argument-hint` when `argumentHint` is present. `argument-hint` is the documented argument field. `agent` is left unset, so the prompt runs with the current agent. `name` is omitted because the filename is the slash command.
- A description or argument hint that is not a plain YAML scalar is one double-quoted string (a colon, a hash, a leading `[`, a boolean-like value, or a number such as `15` or `1e2`).
- The shared-only plan test now selects no agents. Cursor and Windsurf selection tests expect the Copilot paths when `copilot` is selected.
