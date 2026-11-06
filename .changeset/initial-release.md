---
"@agentinit/cli": minor
---

First public release. `npx @agentinit/cli` reads a TypeScript project, picks curated, version-aware rules for its stack, and writes them in the native format of Cursor, Claude Code, Windsurf, and GitHub Copilot. Always-on rules go once into a shared `AGENTS.md`. `doctor` then keeps those rules in sync with the project in CI.

- **`init`** detects the framework, libraries, installed versions, `tsconfig.json` strictness, and folder layout, then shows a summary you can accept or customize before anything is written. `--yes` runs without prompts, and `--dry-run` previews the file tree and diffs without writing.
- **Per-agent output**: scoped rules in `.cursor/rules`, `.claude/rules`, `.windsurf/rules`, and `.github/instructions`. Four workflows (`/new-feature`, `/refactor`, `/review-arch`, `/write-tests`) are written as each agent's slash commands, skills, or prompts. `--no-workflows` leaves them out.
- **`ARCHITECTURE.md`** describes the folders that exist today, including framework folders such as `app/` and `routes/`, and states conventions for new code without asking agents to move existing files.
- **Version-aware registry**: Next.js App Router 16.3+ and 15, Pages Router, React + Vite, Express 5 and 4, Fastify, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, Vitest, Playwright, TypeScript and TypeScript Strict, and five architectures (Flat, Feature-Based, Layered, Atomic Design, Modular). `list` shows each fragment's supported version range.
- **Safe re-runs**: generated content lives in managed blocks or manifest-tracked files, so hand-written text is never touched. Edited files prompt (or are skipped with `--yes`), replaced files are backed up, and agentinit only ever writes or deletes files it owns. Re-running with nothing changed writes nothing.
- **Opt out of a fragment**: deselect a detected fragment in *Customize* and it stays excluded on re-runs and in `doctor`.
- **`doctor`** is a read-only drift check for CI. Errors (missing, edited, or outdated files, unselected matches, unsupported versions) exit `2`. Warnings (legacy `.cursorrules`, an always-on token budget over 1,500) don't fail the build.
- **`remove --all`** deletes every file and managed block agentinit generated. Edited files are kept unless you choose to back them up and delete them (or pass `--force`), and earlier backups are never deleted.
- No accounts, API keys, network calls at runtime, or telemetry.
