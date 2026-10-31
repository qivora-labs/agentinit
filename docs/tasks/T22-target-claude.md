# T22 · Claude Code Target

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M4 — Targets | T20 | T27, T28 | §5.2, §5.3, §5.4 (Claude Code) | M |

## Goal
Generate `CLAUDE.md`, path-scoped rules, and skills for Claude Code.

## Context
- Claude Code reads `CLAUDE.md`, not `AGENTS.md`; `CLAUDE.md` imports it with an `@AGENTS.md` line.
- Verify current formats in Claude Code docs: `.claude/rules/*.md` (`paths` frontmatter) and `.claude/skills/<name>/SKILL.md` (frontmatter fields).

## Scope
`src/targets/claude.ts` registered in the adapter map:
- `CLAUDE.md` managed block `claude`: `@AGENTS.md` on its own line plus one short line telling Claude that scoped rules live in `.claude/rules/`.
- `glob` and `auto` → `.claude/rules/agentinit-<id>.md` with `paths:` as a YAML list (Claude has no description-based rule activation; `auto` uses its glob fallback).
- `manual` → `.claude/skills/agentinit-<id>/SKILL.md` with `name`, `description`, `disable-model-invocation: true`.
- Workflows → `.claude/skills/<id>/SKILL.md` with `name: <id>`, `description`, `argument-hint` (from `argumentHint`), `disable-model-invocation: true`.

## Out of scope
- Shared outputs (T20).

## Acceptance criteria
- [x] Snapshot tests for the `CLAUDE.md` block, each scope, and one workflow.
- [x] `paths` is a YAML list; frontmatter round-trips through `yaml.parse`.
- [x] Workflows and manual rules both set `disable-model-invocation: true`.
- [x] No Claude file duplicates `always` content (it arrives via `@AGENTS.md`).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add claude code rules and skills output`

## Notes
- Checked [Claude Code memory](https://code.claude.com/docs/en/claude-md) and [skills](https://code.claude.com/docs/en/skills) on 2026-10-31. `CLAUDE.md` imports with a bare `@AGENTS.md` line (backticks would keep it literal). Path-scoped rules use a `paths` YAML list of quoted globs. A rule with no `paths` field loads at launch. Skill frontmatter uses `name`, `description`, `argument-hint`, and `disable-model-invocation`.
- `CLAUDE.md` is managed block `claude` (`target: 'claude'`). The inner content is `@AGENTS.md` plus one line pointing at `.claude/rules/`. Markers stay in `src/io/`.
- Manual skill `name` is the fragment id, so the command is `/<id>` (PRD §5.3). The directory is `agentinit-<id>`. Workflow `name` is also the id, at `.claude/skills/<id>/SKILL.md`. Registry ids are unique, so the two commands cannot collide.
- A `glob` or `auto` fragment whose rendered glob list is empty is omitted. Writing the file without `paths` would load that scoped body every session.
- Every `paths` entry is double-quoted. A leading `*` is a YAML alias, which is how `**/*.ts` renders when `srcDir` is empty. `auto` uses that same list and has no `description` field.
- `argument-hint` is omitted when `argumentHint` is absent. A value that is not a plain YAML scalar is one double-quoted string (`[path]`, a colon, a boolean-like name such as `on`, or a number such as `15` or `1e2`).
- Plan tests that selected `claude` to mean "an agent with no adapter" now select `windsurf`.
