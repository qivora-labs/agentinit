# T21 · Cursor Target

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M4 — Targets | T20 | T27, T28 | §5.2, §5.3, §5.4 (Cursor) | S |

## Goal
Generate Cursor rule files and commands from the target context.

## Context
- Cursor reads `AGENTS.md` itself, so `always` fragments produce **no** Cursor files.
- `globs` in `.mdc` frontmatter is a **comma-separated string**, not a YAML list.
- Verify the current `.mdc` and `.cursor/commands/` formats against Cursor's docs before implementing.

## Scope
`src/targets/cursor.ts` registered in the plan's adapter map:
- `glob` → `.cursor/rules/agentinit-<id>.mdc` with `description`, `globs: a,b`, `alwaysApply: false`.
- `auto` → same path with `description`, **no** `globs`, `alwaysApply: false` (agent-decided).
- `manual` → same path with no `description` and no `globs`, `alwaysApply: false` (`@`-mention only).
- Workflows → `.cursor/commands/<id>.md` (plain Markdown body; no frontmatter unless Cursor's current docs require it).
- Frontmatter is written by hand-rolled serialization so `globs` stays unquoted; descriptions containing `:` or `#` are quoted safely.

## Out of scope
- Shared outputs (T20).

## Acceptance criteria
- [ ] Snapshot tests for one fragment of each scope and one workflow.
- [ ] `globs` serializes as `src/app/**/*.ts,src/app/**/*.tsx`.
- [ ] A description with a colon is quoted and remains valid YAML (round-trip test with `yaml.parse`).
- [ ] No Cursor file is produced for `always` fragments.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add cursor rules and commands output`

## Notes
_Record decisions and discovered gaps here._
