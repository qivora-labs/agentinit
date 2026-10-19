# Workflow: Write a Registry Fragment

## Purpose
Author or revise one rule or workflow fragment in `registry/` that users' AI agents can follow reliably.

## Input
A fragment id (e.g., `zustand`) and, for new fragments, its category. Given by the user.

## Steps
1. Read `.cursor/rules/registry-content.mdc`, PRD §4.4 and §10, and the content task that owns the fragment (T09–T13), if any.
2. If the fragment exists, read it and note what's outdated or missing.
3. Determine the version range to support. Find the **current official documentation** for that version and list the pages you'll rely on. If you can't access official docs, **stop and tell the user**.
4. Draft the frontmatter: `id`, `name`, `category`, `version` (bump minor for content changes, major for meaning changes), `order`, `description`, `scope` and `globs` (rules), `detect`, `appliesTo`, `requires`/`conflictsWith`/`compatibleWith` as needed, `sources`, `verifiedAt` (today).
5. Write the body:
   - Rules: Boundary → Directives → Good vs. Anti-Pattern code block.
   - Architecture: also `## Summary` (≤ 10 lines) and `## Map`.
   - Workflows: `## Purpose`, `## Input`, `## Steps`, `## Output`, `## Guardrails`.
6. Cross-check every directive against the listed sources. Remove anything you couldn't verify.
7. Run `pnpm registry:check` and fix all errors.
8. Render a preview if the CLI exists (`node dist/cli.js init --dry-run --cwd <fixture>`) and check the fragment reads well in each agent's output.

## Output
The fragment file, plus a summary: sources used, scope/glob choice and why, and anything intentionally left out.

## Guardrails
- Never instruct agents to move existing files, run network commands, install packages, read secrets, or disable safeguards.
- No generic advice; every directive must be specific to this library or pattern.
- Stay within 120 lines (workflows: 60).
- A human must review the content before merge.
