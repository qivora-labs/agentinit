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
- [ ] Eval materials exist and were reviewed by the owner.
- [ ] Results recorded for all 20 runs.
- [ ] Violations reduced in ≥ 4 of 5 tasks, **or** fragments are revised and the eval re-run.

## Verify
Manual: review `docs/evals/results-v0.1.md`.

## Commit
`docs: add rule-effectiveness eval materials` (and later `docs: record v0.1 eval results`)

## Notes
_Record decisions and discovered gaps here._
