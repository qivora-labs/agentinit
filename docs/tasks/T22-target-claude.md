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
- [ ] Snapshot tests for the `CLAUDE.md` block, each scope, and one workflow.
- [ ] `paths` is a YAML list; frontmatter round-trips through `yaml.parse`.
- [ ] Workflows and manual rules both set `disable-model-invocation: true`.
- [ ] No Claude file duplicates `always` content (it arrives via `@AGENTS.md`).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add claude code rules and skills output`

## Notes
_Record decisions and discovered gaps here._
