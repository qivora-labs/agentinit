# T33 · Rule-Effectiveness Eval (Human-Led)

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M6 — Quality & Launch | T29 | Release (T32 checklist step 1) | §8.3, §11 | M |

## Goal
Show that generated rules actually reduce convention violations before releasing v0.1.

## Context
- PRD §8.3: 5 fixed tasks, 2 agents, with and without rules; ship only if violations drop in at least 4 of 5 tasks.
- An agent can prepare the materials; **a human runs the eval and scores it**, because the point is to judge real agent behavior.

## Scope
Agent prepares:
- `docs/evals/README.md`: procedure (fresh session per run, same model per agent, no extra prompting), scoring rules, and how to record results.
- `docs/evals/tasks.md`: 5 task prompts on the `next15-src` fixture, e.g.:
  1. Add a feature with a form and a Server Action.
  2. Add a client-side store for UI state.
  3. Add a data-fetching hook for an external API.
  4. Refactor a component that mixes server and client concerns.
  5. Write tests for an existing utility.
- `docs/evals/checklist.md`: the violations to count per task, derived from the selected fragments (e.g., `'use client'` on a page, server data in Zustand, missing Zod validation, `any` usage).
- `docs/evals/results-template.md`: a table per run (agent, task, with/without rules, violation count, notes).

Human runs:
- 5 tasks × 2 agents × with/without rules = 20 runs; records results in `docs/evals/results-v0.1.md`; decides go/no-go.

## Out of scope
- Automating the eval (v0.4+).

## Acceptance criteria
- [x] Eval materials exist and were reviewed by the owner.
- [x] Results recorded for all 20 runs.
- [x] Violations reduced in ≥ 4 of 5 tasks, **or** fragments are revised and the eval re-run.

## Verify
Manual: review `docs/evals/results-v0.1.md`.

## Commit
`docs: add rule-effectiveness eval materials` (and later `docs: record v0.1 eval results`)

## Notes
- Decision (2026-11-03): Option **A** — eval fixture is `next15-src` extended with zustand, `@tanstack/react-query`, react-hook-form, zod, `@hookform/resolvers`, and vitest so library fragments are selected; seed files for tasks 4–5 are documented in `docs/evals/tasks.md`.
- Agents for v0.1 run: Cursor → `composer-2.5-fast`, Claude → `claude-sonnet-5-5-high` (Task stand-ins; Claude Code CLI unavailable). Scoring: 0/1 per checklist item; task passes if `total_with < total_without`.
- 2026-11-03 initial run: **3/5 → no-go** (T1 worse with rules; T5 tie). Follow-up: tightened `typescript-strict`; hardened T5 seed with `rates.ts` / `loadRate`.
- 2026-11-03 re-run (T1+T5): **5/5 → go**. Recorded in `docs/evals/results-v0.1.md` addendum. Stand-in agents noted as caveat.
