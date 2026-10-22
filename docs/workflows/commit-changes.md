# Workflow: Commit Changes

## Purpose
Commit the full working tree with this repository's commit conventions.

## Input
None. Commit staged files, unstaged edits, and new files that belong in the repo.

## Steps
1. Read `.cursor/rules/git-commits.mdc`.
2. Inspect `git status`, `git diff` (staged and unstaged), and `git log` so the message matches recent style.
3. If there is nothing to commit, stop and say so.
4. Leave secrets unstaged (`.env`, credential files, private keys). Tell the user what you left out. Do not commit those files.
5. Group the remaining changes into logical commits:
   - One logical change → one commit.
   - A few unrelated changes that split cleanly → one conventional commit each.
   - Mixed changes that cannot be split cleanly → stop and ask before committing.
6. Commit each group. Subject: `<type>(<optional scope>): <imperative lowercase subject>` with no trailing period, ≤ 72 characters. Add a body only to explain why. Never add `Co-authored-by:` or any tool attribution.
7. Run `git status` and confirm the intended files are committed.

## Output
Each new commit hash and subject, plus any files left unstaged and why.

## Guardrails
- Do not push.
- Do not update git config.
- Do not skip hooks (`--no-verify`) or bypass signing (`--no-gpg-sign`).
- Do not amend unless the user explicitly asks.
