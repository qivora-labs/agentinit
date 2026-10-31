# T23 · Windsurf Target

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M4 — Targets | T20 | T27, T28 | §4.4 (Budgets), §5.2, §5.3, §5.4 (Windsurf) | S |

## Goal
Generate Windsurf rule files and workflows.

## Context
- Windsurf reads root `AGENTS.md` as always-on, so `always` fragments produce no Windsurf files.
- Windsurf (now also shipped as Devin Desktop) prefers `.devin/rules/` but still reads `.windsurf/rules/`; v0.1 writes `.windsurf/` (PRD §5.2).
- Rule files are limited to 12,000 characters. Verify current trigger names and workflow format in the Windsurf/Devin docs.

## Scope
`src/targets/windsurf.ts` registered in the adapter map:
- `glob` → `.windsurf/rules/agentinit-<id>.md` with `trigger: glob`, `globs: a,b`.
- `auto` → same path with `trigger: model_decision` and `description`.
- `manual` → same path with `trigger: manual`.
- Workflows → `.windsurf/workflows/<id>.md` in the documented workflow format.
- Any generated rule file ≥ 12,000 characters → plan error naming the fragment.

## Out of scope
- `.devin/` output (revisit if Windsurf drops `.windsurf/` support).

## Acceptance criteria
- [x] Snapshot tests for each scope and one workflow.
- [x] Oversized rule file produces a clear error.
- [x] No Windsurf file is produced for `always` fragments.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add windsurf rules and workflows output`

## Notes
- Checked [Devin CLI rules](https://docs.devin.ai/cli/extensibility/rules.md), [Devin Local customizations](https://docs.devin.ai/desktop/cascade/memories), and [Cascade workflows](https://docs.devin.ai/desktop/cascade/workflows) on 2026-10-31. `.windsurf/rules/*.md` still loads. `trigger` is `always_on`, `glob`, `model_decision`, or `manual`. The rules page also lists `agent`. The glob example is `globs: "**/*.test.ts"`. Workflows are still read from `.windsurf/workflows/<name>.md` (`.devin/workflows/` is preferred). The filename is the slash command. A workflow file has a description and steps, is manual-only, and is limited to 12,000 characters. Cascade workflows are legacy: Devin Local does not run them and the docs say to migrate them to skills. v0.1 still writes `.windsurf/` (PRD §5.2). `.devin/` stays out of scope.
- `globs` is one comma-separated scalar. A value that is not a YAML plain scalar is one double-quoted string (`globs: "**/*.test.tsx,*.test.ts"`). A leading `*` is an alias, which is how `vitest` globs and `{{src}}**/*` render when `srcDir` is empty. Safe values stay unquoted, matching PRD §5.4. This is not a YAML list and not one pair of quotes per pattern.
- `auto` writes `trigger: model_decision` and `description`. The extra `agent` trigger is not used. `manual` is `trigger: manual` only. Glob rules omit `description`; the official glob example and PRD §5.4 do too.
- A `glob` fragment whose rendered glob list is empty is omitted. `trigger: glob` without `globs` never matches. A glob that itself contains a comma would be ambiguous in this field; the registry schema does not forbid that.
- Workflows are `description` frontmatter plus the rendered body. `argumentHint` is not a Windsurf field. No title heading is added; the body already starts with its own sections.
- The rule budget is the generated file's string length, including frontmatter and the trailing newline. 12,000 or more throws `AgentInitError` naming the fragment id. Workflow files have the same documented limit, but PRD §4.4 and this task only enforce rule files.
- Rule and workflow ops are whole files (`kind: 'file'`, `target: 'windsurf'`).
- Plan tests that selected `windsurf` to mean "an agent with no adapter" now select `copilot`.
