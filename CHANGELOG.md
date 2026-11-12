# @agentinit/cli

## 0.1.2

### Patch Changes

- 1bdd95f: When a manifest fails the schema but records a newer `cliVersion`, report an upgrade message instead of suggesting the file is corrupt or should be deleted.
- e8ae7f6: Resolve installed package versions and the package manager from the workspace lookup root when running inside a workspace package. If you previously initialized inside a monorepo package, re-run `init` — `doctor` may now report a different framework fragment for the version that is really installed.
- 27d7b97: Read locked package versions from `yarn.lock` (classic and berry) and text `bun.lock` when `node_modules` is absent, so `doctor` in CI selects the same fragments as a local `init`. Binary `bun.lockb` is still not parsed.

## 0.1.1

### Patch Changes

- 0df4e0e: When adopting an existing `AGENTS.md` or `ARCHITECTURE.md` that already has an H1, omit the managed block's heading so the file keeps a single top-level heading.
- 8005a2f: Cursor workflows move from `.cursor/commands/<id>.md` to `.cursor/skills/<id>/SKILL.md`. When Claude Code is also selected, Cursor skips its own workflow files and uses `.claude/skills/` instead, so each workflow appears once in Cursor's slash menu. Re-running `init` removes leftover `.cursor/commands` files from 0.1.0 (hand-edited ones are backed up first) so Cursor does not keep a second slash entry. Cursor's documented minimum is now 2.4 (Agent Skills).
- 86ea26d: `doctor` reports rule drift from another CLI version as a `rules-update` warning instead of failing CI. Same-version outdated files and hand edits stay errors.
- 567a75d: Correct `--no-workflows` help (no false default), kind-specific `doctor` edited fix text, and pack only `dist/cli.js` from `dist/`.
- 90b4c93: Tolerate unknown manifest keys (and preserve them on rewrite) so mixed CLI versions stay compatible. Older major/minor CLIs refuse to rewrite a newer project unless `--force`.
- 04381f3: Harden backup folder names with a random suffix, ignore managed-block markers inside fenced code, and report a corrupt manifest from `doctor` as `manifest-invalid` (exit 2) instead of a tool crash.

## 0.1.0

### Minor Changes

- a63622e: First public release. `npx @agentinit/cli` reads a TypeScript project, picks curated, version-aware rules for its stack, and writes them in the native format of Cursor, Claude Code, Windsurf, and GitHub Copilot. Always-on rules go once into a shared `AGENTS.md`. `doctor` then keeps those rules in sync with the project in CI.
  
  - **`init`** detects the framework, libraries, installed versions, `tsconfig.json` strictness, and folder layout, then shows a summary you can accept or customize before anything is written. `--yes` runs without prompts, and `--dry-run` previews the file tree and diffs without writing.
  - **Per-agent output**: scoped rules in `.cursor/rules`, `.claude/rules`, `.windsurf/rules`, and `.github/instructions`. Four workflows (`/new-feature`, `/refactor`, `/review-arch`, `/write-tests`) are written as each agent's slash commands, skills, or prompts. `--no-workflows` leaves them out.
  - **`ARCHITECTURE.md`** describes the folders that exist today, including framework folders such as `app/` and `routes/`, and states conventions for new code without asking agents to move existing files.
  - **Version-aware registry**: Next.js App Router 16.3+ and 15, Pages Router, React + Vite, Express 5 and 4, Fastify, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, Vitest, Playwright, TypeScript and TypeScript Strict, and five architectures (Flat, Feature-Based, Layered, Atomic Design, Modular). `list` shows each fragment's supported version range.
  - **Safe re-runs**: generated content lives in managed blocks or manifest-tracked files, so hand-written text is never touched. Edited files prompt (or are skipped with `--yes`), replaced files are backed up, and agentinit only ever writes or deletes files it owns. Re-running with nothing changed writes nothing.
  - **Opt out of a fragment**: deselect a detected fragment in *Customize* and it stays excluded on re-runs and in `doctor`.
  - **`doctor`** is a read-only drift check for CI. Errors (missing, edited, or outdated files, unselected matches, unsupported versions) exit `2`. Warnings (legacy `.cursorrules`, an always-on token budget over 1,500) don't fail the build.
  - **`remove --all`** deletes every file and managed block agentinit generated. Edited files are kept unless you choose to back them up and delete them (or pass `--force`), and earlier backups are never deleted.
  - No accounts, API keys, network calls at runtime, or telemetry.
