# Workflow: Implement a Task

## Purpose
Implement exactly one task from `docs/tasks/` so it can be reviewed and merged as one PR.

## Input
A task id (e.g., `T05`), given by the user.

## Steps
1. Open `docs/tasks/README.md`. Find the task's row; if any dependency is not `done`, **stop** and tell the user which ones are missing.
2. Read, in this order: the task file, `AGENTS.md`, `ARCHITECTURE.md`, and every PRD section the task lists.
3. Check the branch: if not on `task/<id>-<slug>`, propose creating it and wait for the user.
4. Restate the goal in two or three sentences and list the files you plan to create or change. If anything in the task is ambiguous or conflicts with the PRD or existing code, **stop and ask** before writing code.
5. Implement only what **Scope** lists. Before editing an area, read its rule file (see "Area-Specific Rules" in `AGENTS.md`).
6. Write or update tests for every behavior in **Acceptance criteria**.
7. Run the task's **Verify** commands, then `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Fix failures; don't skip or weaken tests to make them pass.
8. In the task file: check off acceptance criteria and record decisions or discovered gaps under **Notes**.
9. In `docs/tasks/README.md`: set the task's status to `done`.
10. Commit with the task's suggested message (adjust if the change differs), following `.cursor/rules/git-commits.mdc`.

## Output
A short summary: what changed (files), how each acceptance criterion is satisfied, verify results, notes or follow-ups, and the commit hash.

## Guardrails
- One task per session. Don't start the next task.
- Don't edit files outside the task's scope except small, necessary changes (e.g., exporting a type); list those in the summary.
- Don't add runtime dependencies without asking.
- Don't change the PRD without the user's approval; when approved, update it in the same commit.
- Never add `Co-authored-by:` trailers or tool attribution to commits.
