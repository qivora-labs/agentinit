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
- [ ] Snapshot tests for each scope and one workflow.
- [ ] Oversized rule file produces a clear error.
- [ ] No Windsurf file is produced for `always` fragments.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(targets): add windsurf rules and workflows output`

## Notes
_Record decisions and discovered gaps here._
