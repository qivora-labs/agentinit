---
description: Plan a feature, wait for confirmation, then implement it and run the project checks.
argument-hint: <feature-name> <short description>
---

## Purpose
Add one feature. Plan the files, wait for confirmation, then implement that plan.

## Input
The user's input: a feature name and a short description. If either part is missing, ask for it and stop.

## Steps
1. Read `AGENTS.md` and `ARCHITECTURE.md`. For each file you will edit, read the closest `AGENTS.md` in that file's directory tree. The closest file wins where they disagree.
2. Propose a file plan: each path to create or edit, its responsibility, and the active rules that apply. Then stop and wait for the user to confirm. Do not create or edit files before that confirmation.
3. After the user confirms, implement only the confirmed plan. Follow the active rules.
4. If a test-library rule is active, add tests for the feature's observable behavior and follow that rule.
6. Run `pnpm lint`.

## Output
List the files created or edited, the decisions you made, and the result of each check that ran.

## Guardrails
- **NEVER** write files before the user confirms the file plan. Silence is not confirmation.
- **NEVER** create or edit a path that is not in the confirmed plan.
- **NEVER** run network commands, install packages, or read secrets.
- If a check fails, fix the feature and run that check again. **NEVER** weaken a test to make it pass.
