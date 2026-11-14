# Workflow: Review a Task

## Purpose
Independently check that a finished task meets its acceptance criteria, the Definition of Done, and the repository's rules, before it is merged.

## Input
A task id (e.g., `T05`), given by the user. Review the current branch's changes against the pull request's **base branch** (not always `main`).

## Steps
1. Read the task file, the Definition of Done in `docs/tasks/README.md`, `AGENTS.md`, `ARCHITECTURE.md`, and the PRD sections the task lists. If the task is from a completed release, its index row may be in `docs/tasks/completed.md`.
2. Resolve the base branch as `$BASE` the same way as `docs/workflows/pr-summary.md` (open PR base, else `release/0.2` for 0.2 tasks, else `main`). State which base you used.
3. List the changed files (`git diff --stat $BASE...HEAD`) and read each change.
4. For each acceptance criterion, find the code **and** the test that prove it. Mark it ✅ proven, ⚠️ partially proven, or ❌ missing.
5. Check scope: flag changes that belong to other tasks or aren't listed in the task's **Scope**.
6. Check the area rules for every touched area (`.cursor/rules/*.mdc`), especially purity boundaries and write safety.
7. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` and the task's **Verify** commands; report results.
8. Check commits: conventional format, no `Co-authored-by:` or tool attribution.

## Output
- A table of acceptance criteria with status and evidence (`file:line` or test name).
- Findings grouped by severity — **Blocker**, **Should fix**, **Nit** — each with `file:line` and a suggested fix.
- A final verdict: **Ready to merge** or **Changes needed**.

## Guardrails
- **Read-only.** Never edit files, commit, or push during a review.
- Judge against the task file and PRD, not personal preference; label preferences as **Nit**.
- If the task file itself seems wrong, say so as a separate finding instead of reviewing against your own interpretation.
