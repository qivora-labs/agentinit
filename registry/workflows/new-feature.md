---
id: new-feature
name: New feature
category: workflow
version: 1.0.0
order: 50
description: Plan a feature, wait for confirmation, then implement it and run the project checks.
argumentHint: "<feature-name> <short description>"
sources:
  - https://agents.md/
verifiedAt: 2026-10-28
---

## Purpose
Add one feature. Plan the files, wait for confirmation, then implement that plan.

## Input
The user's input: a feature name and a short description. If either part is missing, ask for it and stop.

## Steps
1. Read `AGENTS.md` and `ARCHITECTURE.md`. When a closer `AGENTS.md` sits beside the files you will edit, read that file too. The closer file wins where they disagree.
2. Propose a file plan: each new path, its responsibility, and the active rules that apply. Then stop and wait for the user to confirm. Do not create or edit files before that confirmation.
3. After the user confirms, implement only the confirmed plan. Follow the active rules.
4. If a test-library rule is active, add tests for the feature's observable behavior and follow that rule.
5. Run `{{scripts.typecheck}}`.
6. Run `{{scripts.lint}}`.
7. Run `{{scripts.test}}`.

## Output
List the files created or edited, the decisions you made, and the result of each check that ran.

## Guardrails
- **NEVER** write files before the user confirms the file plan. Silence is not confirmation.
- **NEVER** add files that are not in the confirmed plan.
- **NEVER** run network commands, install packages, or read secrets.
- If a check fails, fix the feature and run that check again. **NEVER** weaken a test to make it pass.
