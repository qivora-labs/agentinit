---
name: refactor
description: Pin current behavior with tests, then change structure in small steps.
argument-hint: <target> <goal>
disable-model-invocation: true
---

## Purpose
Change structure only. Behavior and the public API stay as they are unless the user's input asks for a change.

## Input
The user's input: a target and a goal. If either part is missing, ask for it and stop.

## Steps
1. Read `AGENTS.md`, `ARCHITECTURE.md`, and the active rules that apply to the target.
2. If tests do not already cover the target's observable behavior, write characterization tests before any edit. Follow the active test-library rule. Start from a test named `x` with a dummy expected value, run it, copy the actual result into the assertion, and name the test for that behavior. Keep the observed result unless the user has called it a bug.
3. Wait until those characterization tests pass before changing structure.
4. Refactor toward the goal in small steps. After each step, run:
   - `pnpm lint`

## Output
Summarize the structural changes, the tests that pin current behavior, and each check result. State that behavior and the public API are unchanged, or quote the request that allowed a change.

## Guardrails
- **NEVER** change observable behavior or the public API unless the user's input asks for that change.
- **NEVER** change structure while characterization tests are missing or failing.
- **NEVER** edit a characterization test to hide a behavior change the refactor introduced.
- **NEVER** run network commands, install packages, or read secrets.
