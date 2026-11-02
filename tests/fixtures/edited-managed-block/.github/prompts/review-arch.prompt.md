---
description: Read-only review of boundaries, dependency direction, naming, and active rules.
argument-hint: "[path]"
---

## Purpose
Report architecture and rule problems. This review is read-only.

## Input
The user's input: an optional path. When the input is empty, review the uncommitted changes. When it names a path, review that path.

## Steps
1. Read `ARCHITECTURE.md` and the active rules. Read `AGENTS.md` when it states a constraint those files do not.
2. Check folder boundaries, dependency direction, and naming against `ARCHITECTURE.md`.
3. Check those same files against the active rules.

## Output
Group findings by severity: **Blocker**, **Should fix**, then **Nit**. Each finding includes `file:line`, what is wrong, and a suggested fix. If nothing is wrong, say so.

## Guardrails
- **Read-only.** **NEVER** edit, create, or delete files. **NEVER** apply a suggested fix.
- **NEVER** commit.
- **NEVER** run network commands, install packages, or read secrets.
- A preference that `ARCHITECTURE.md` and the active rules do not require is a **Nit**.
