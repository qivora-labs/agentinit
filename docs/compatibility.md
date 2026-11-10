# Agent Compatibility

The oldest version of each agent that loads each kind of file `@agentinit/cli` writes. Older versions silently ignore newer formats, so a rule that never loads looks the same as a rule the agent chose to ignore.

**Last verified: 2026-11-10**, against each vendor's official changelog or release notes. Re-verify every row before each release (`docs/release-checklist.md`, step 3). Cursor workflows re-verified against [Agent Skills](https://cursor.com/docs/skills) and [Changelog 2.4](https://cursor.com/changelog/2-4).

## Minimums

The **Minimum** column in the README is the highest floor in each agent's rows below.

### Cursor — minimum 2.4

| Output | What we write | Since | Source |
| :--- | :--- | :--- | :--- |
| Rules | `.cursor/rules/agentinit-*.mdc` (`description`, `globs`, `alwaysApply`) | 0.45 | [Changelog 0.45](https://cursor.com/changelog/0-45-x): "`.cursor/rules`: Users can write several repository-level rules to disk". Current format: [Rules](https://cursor.com/docs/rules) |
| Workflows | `.cursor/skills/<id>/SKILL.md`, run as `/<id>` (omitted when Claude Code is also selected) | 2.4 | [Changelog 2.4](https://cursor.com/changelog/2-4): Agent Skills. Directories: [Agent Skills](https://cursor.com/docs/skills) (`.cursor/skills/`, and for compatibility `.claude/skills/`). Help: [Skills](https://cursor.com/help/customization/skills) |
| `AGENTS.md` | Root `AGENTS.md` | Not pinned | [Rules → AGENTS.md](https://cursor.com/docs/rules): "Cursor supports AGENTS.md in the project root and subdirectories." No changelog entry from 0.49 through 2.2 announces it. |

- **`AGENTS.md` has no documented first version.** Community reports on Cursor 1.7.44–1.7.54 (October 2025) say the root file was not attached automatically ([forum](https://forum.cursor.com/t/support-agents-md/133414)). Use a current release if always-on rules matter.
- **Skills replace commands.** Cursor 2.4+ loads project skills from `.cursor/skills/` and, for compatibility, `.claude/skills/`. When both Cursor and Claude Code are selected, agentinit writes workflows only under `.claude/skills/` so Cursor does not list each one twice. Cursor-only projects still get `.cursor/skills/`. Legacy `.cursor/commands/` from 0.1.0 are removed on the next `init` when unedited.
- **`argument-hint` is intentional.** Cursor-only workflow skills include `argument-hint` when the fragment sets it, matching Claude Code skills (PRD §5.4). [Agent Skills](https://cursor.com/docs/skills) does not list that field; unknown frontmatter keys are ignored.

### Claude Code — minimum 2.1.84

| Output | What we write | Since | Source |
| :--- | :--- | :--- | :--- |
| Rules | `.claude/rules/agentinit-*.md` with a YAML list in `paths:` | 2.1.84 | [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) 2.1.84: "Rules and skills `paths:` frontmatter now accepts a YAML list of globs". `.claude/rules/` itself: 2.0.64. |
| Workflows | `.claude/skills/<id>/SKILL.md`, run as `/<id>` | 2.1.0 | CHANGELOG 2.0.20: "Added support for Claude Skills". 2.1.0: skills are "visible in the slash command menu by default". Docs: [Skills](https://code.claude.com/docs/en/skills) |
| `AGENTS.md` | `CLAUDE.md` managed block containing `@AGENTS.md` | 0.2.107 | CHANGELOG 0.2.107: "CLAUDE.md files can now import other files". Docs: [Memory → imports](https://code.claude.com/docs/en/memory) |

- Workflow skills set `disable-model-invocation: true` so they run only when you type the command. No changelog entry announces that field. Its first mention is a fix in 2.1.110, and it is documented in [Skills](https://code.claude.com/docs/en/skills). A version that ignores it may also start a workflow on its own.
- Claude Code 2.1.277 and later also read `AGENTS.md` directly, but only when the project has no `CLAUDE.md` ([Memory → AGENTS.md](https://code.claude.com/docs/en/memory)). agentinit writes `CLAUDE.md`, so the import above is what loads `AGENTS.md`.

### Windsurf (Devin Desktop) — minimum 1.12.25

| Output | What we write | Since | Source |
| :--- | :--- | :--- | :--- |
| Rules | `.windsurf/rules/agentinit-*.md` (`trigger`, `globs`) | 1.8.2 | [Changelog](https://docs.devin.ai/desktop/changelog) 1.8.2 (May 7, 2025): "Rules files are saved in the workspace, under .windsurf/rules" |
| Workflows | `.windsurf/workflows/<id>.md`, run as `/<id>` | 1.8.2 | Changelog 1.8.2: "Workflow files are saved in the workspace, under .windsurf/workflows" |
| `AGENTS.md` | Root `AGENTS.md` (always on) | 1.12.25 | Changelog 1.12.25 (October 23, 2025): "Support and fixes for AGENTS.md" |

- **Workflows are being deprecated.** Changelog 3.6.22 (July 29, 2026): "workflow surfaces explain that workflows are being deprecated in favor of skills". v0.1 still writes `.windsurf/workflows`.

### GitHub Copilot in VS Code — minimum 1.104

| Output | What we write | Since | Source |
| :--- | :--- | :--- | :--- |
| Rules | `.github/instructions/agentinit-*.instructions.md` (`description`, `applyTo`) | 1.102 | [VS Code 1.100](https://code.visualstudio.com/updates/v1_100): `.instructions.md` with `applyTo`. [VS Code 1.102](https://code.visualstudio.com/updates/v1_102): "the large language model can load instructions on demand" from their descriptions, which `auto` rules without `applyTo` rely on. |
| Workflows | `.github/prompts/<id>.prompt.md` | 1.100 | [VS Code 1.100](https://code.visualstudio.com/updates/v1_100): "Prompt files use the `.prompt.md` file suffix". Docs: [Prompt files](https://code.visualstudio.com/docs/agent-customization/prompt-files) |
| `AGENTS.md` | Root `AGENTS.md`, plus a pointer in `.github/copilot-instructions.md` | 1.104 | [VS Code 1.104](https://code.visualstudio.com/updates/v1_104): "when you have an `AGENTS.md` file in your workspace root(s), it is automatically picked up" (setting `chat.useAgentsMdFile`, on by default) |

- Before 1.104, `.github/copilot-instructions.md` still loads, but it only points to `AGENTS.md` ([repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide)). Some JetBrains Copilot features see only that pointer.

## Other agents that read root `AGENTS.md`

agentinit doesn't write files for these agents, but they load the always-on rules in `AGENTS.md`:

| Agent | Source |
| :--- | :--- |
| OpenAI Codex | [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md): "Codex reads `AGENTS.md` files before doing any work." |
| Amp | [AGENTS.md](https://ampcode.com/docs/customize/agents-md): `AGENTS.md` files in the working directory and its parents "are always included". |
| opencode | [Rules](https://opencode.ai/docs/rules/): "Place an `AGENTS.md` in your project root for project-specific rules." |

## Agent `/init` commands

The README compares agentinit with the `/init` commands some agents ship:

- Claude Code: "Run `/init` to generate a starting CLAUDE.md automatically" ([Memory](https://code.claude.com/docs/en/memory)).
- opencode: "`/init` scans the important files in your repo … and then creates or updates `AGENTS.md`" ([Rules](https://opencode.ai/docs/rules/)).
