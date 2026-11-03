---
name: write-tests
description: Cover a target's observable behavior with the active test library.
argument-hint: <target>
disable-model-invocation: true
---

## Purpose
Add tests for one target, using the test library named by the active rules.

## Input
The user's input: a target, such as a file, module, or behavior. If it is missing, ask for it and stop.

## Steps
1. Read the active rules. Use the test library those rules name. If more than one test library is active, use the library whose rules match this target. If no test library is active, stop and say so.
2. Cover observable behavior: the happy path, edge cases a real caller can trigger, and the error paths.
3. Assert a return value, a thrown error, a callback the caller passed in, or something a user can see. Follow the active test-library rule for file layout, mocks, and assertions.
4. Run `pnpm test`.

## Output
List the tests written, what each one covers, and the result of the test command.

## Guardrails
- **NEVER** mock the unit under test. Mock a dependency only when the active test-library rule allows it.
- **NEVER** change the target's behavior so a new test passes. If a test fails because the target is wrong, report the failure.
- **NEVER** run network commands, install packages, or read secrets.
