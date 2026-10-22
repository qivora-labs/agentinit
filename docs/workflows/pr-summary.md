# Workflow: Pull Request Summary

## Purpose
Draft the pull request title and description for the current branch so a person can open the pull request.

## Input
None. Describe commits already on this branch compared with `main`.

## Steps
1. If `git status` shows uncommitted changes, stop. Tell the user to commit first (`/commit-changes`). Do not describe uncommitted work as part of the pull request.
2. Read `git log --oneline main...HEAD` and `git diff main...HEAD`. If the branch has no commits ahead of `main`, stop and say so.
3. Write a title in Conventional Commits form: `<type>(<optional scope>): <imperative lowercase subject>`, no trailing period, ≤ 72 characters. Match the branch's actual change. When the branch has several commits, the title names the overall change, not only the latest commit.
4. Write the description:

```markdown
## Summary
- <1–3 bullets: what changed and why>

## Test plan
- [ ] <commands or checks that prove the change, including the task Verify commands and `pnpm lint && pnpm typecheck && pnpm test && pnpm build` when those apply>
```

## Output
The branch name, the title, and the description, ready to copy.

## Guardrails
- Do not push, and do not run `gh pr create` or any other command that opens a pull request.
- Base the summary only on committed changes against `main`.
