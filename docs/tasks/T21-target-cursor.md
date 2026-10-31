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
- [x] Snapshot tests for one fragment of each scope and one workflow.
- [x] `globs` serializes as `src/app/**/*.ts,src/app/**/*.tsx`.
- [x] A description with a colon is quoted and remains valid YAML (round-trip test with `yaml.parse`).
- [x] No Cursor file is produced for `always` fragments.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add cursor rules and commands output`

## Notes
- Checked [Cursor rules](https://cursor.com/docs/rules) on 2026-10-31. `globs` is a comma-separated string. File-scoped rules auto-attach when `globs` is set and `alwaysApply` is false. Agent-decided rules are `description` plus `alwaysApply: false` and no `globs`. Manual rules are `alwaysApply: false` with both `description` and `globs` omitted. The docs' file-scoped example omits `description`; this adapter still writes it, and a present `globs` field keeps the rule file-scoped.
- Cursor's docs separate multiple globs with a comma and, in one table, a space (`docs/**/*.md, docs/**/*.mdx`). Serialization follows PRD §5.4 and has no space: `src/app/**/*.ts,src/app/**/*.tsx`.
- A joined `globs` value that is not a YAML plain scalar is one double-quoted string (`globs: "**/*.test.tsx,*.test.ts"`). A leading `*` is an alias, which is how `vitest` globs and `{{src}}**/*` render when `srcDir` is empty. Safe values stay unquoted. This is not a YAML list and not one pair of quotes per pattern.
- [Plugin commands](https://cursor.com/docs/reference/plugins) may include optional `name` and `description` frontmatter. Workflows stay the rendered body only, matching this repo's `.cursor/commands/*.md` files.
- Rule and workflow ops are whole files (`kind: 'file'`, `target: 'cursor'`).
- A `glob` fragment whose rendered glob list is empty omits `globs`. An empty `globs:` value is not a pattern. A glob that itself contains a comma would be ambiguous in this field; the registry schema does not forbid that.
