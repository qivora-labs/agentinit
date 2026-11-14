# Workflow: Pull Request Summary

## Purpose
Draft the pull request title and description for the current branch so a person can open the pull request.

## Input
None. Describe commits already on this branch compared with the pull request's **base branch** (not always `main`).

## Steps
1. If `git status` shows uncommitted changes, stop. Tell the user to commit first (`/commit-changes`). Do not describe uncommitted work as part of the pull request.
2. Resolve the base branch as `$BASE`:
   1. If this branch already has an open pull request, use its base (`gh pr view --json baseRefName -q .baseRefName`).
   2. Else if `origin/release/0.2` (or local `release/0.2`) exists and the user is working on a 0.2 task (`task/T5…`–`task/T7…` or an explicit ask), use `release/0.2`.
   3. Else use `main`.
   State which base you used.
3. Read `git log --oneline $BASE...HEAD` and `git diff $BASE...HEAD`. If the branch has no commits ahead of `$BASE`, stop and say so.
4. Write a title in Conventional Commits form: `<type>(<optional scope>): <imperative lowercase subject>`, no trailing period, ≤ 72 characters. Match the branch's actual change. When the branch has several commits, the title names the overall change, not only the latest commit.
5. Write the description:

```markdown
## Summary
- <1–3 bullets: what changed and why>

## Test plan
- [ ] <commands or checks that prove the change, including the task Verify commands and `pnpm lint && pnpm typecheck && pnpm test && pnpm build` when those apply>
```

## Output
The branch name, the base branch (`$BASE`), the title, and the description, ready to copy.

## Guardrails
- Do not push, and do not run `gh pr create` or any other command that opens a pull request.
- Base the summary only on committed changes against `$BASE`.
