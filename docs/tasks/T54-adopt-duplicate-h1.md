# T54 · No Duplicate H1 When Adopting an Existing File

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M9 — 0.1.1 patch | — | — | §5.1, §5.4, §6.1, §6.3 | M |

## Goal
Adopting an existing `AGENTS.md` or `ARCHITECTURE.md` doesn't add a second top-level heading.

## Context
Promoted from `backlog.md` P1.3.
- The `core` block (`src/targets/agents-md.ts`) starts with `# AGENTS.md`, and the `architecture` block (`src/targets/architecture-md.ts`) starts with `# ARCHITECTURE.md`.
- When the user's file already has its own H1 (for example `# AGENTS.md — Working on my-app`), adopting appends a block with a second H1. This repository's own `AGENTS.md` shows it.
- Targets are pure and never see disk, so they can't know whether the file already has an H1.

## Decisions (owner, before starting)
1. **How the plan learns about the H1.** Recommended: `io/` computes a fact (`hasH1` per shared file) during `computeChanges`, and the plan is built a second time with that fact only for shared files that already exist. Alternative: the block never carries an H1; a new file gets the H1 from a fixed first line written outside the block. That changes the output for every new project and needs a manifest hash migration.

## Scope
1. Apply decision 1 so that:
   - A **new** shared file keeps today's output byte-for-byte (H1 inside the block).
   - An **adopted** file whose content outside the block already has an ATX H1 (`# …`, outside fenced code) gets a block with no H1. The block's sections start at `##`.
   - An adopted file with no H1 keeps the block's H1.
2. **Stability:** once a file is managed, re-runs keep the same choice. The "has H1" fact is measured on the content **outside** the managed block, so the block's own H1 never flips the result.
3. **`doctor`:** computes changes the same way, so an adopted file is not reported as `outdated` or `rules-update` because of the heading.
4. **Dogfood:** re-run `init` on this repository. `AGENTS.md` and `ARCHITECTURE.md` each end up with one H1.
5. **PRD**: §6.1 / §6.3 (adoption keeps a single H1).
6. Add a `patch` changeset.

## Out of scope
- `CLAUDE.md` and `.github/copilot-instructions.md`, whose blocks have no H1.

## Implementation notes
- `plan/` and `targets/` stay pure: the fact enters as data in the target context, not through a disk read.
- Hashes are computed on the final block content, so an adopted block without an H1 has a different hash than a new one. Both are stable across re-runs.

## Acceptance criteria
- [x] Decision recorded under **Notes**, and the PRD updated.
- [x] `existing-claude-md`-style fixtures for `AGENTS.md` with an H1: after `init --yes`, the file has exactly one line starting with `# `.
- [x] A new project's `AGENTS.md` and `ARCHITECTURE.md` are byte-for-byte unchanged (snapshots).
- [x] Re-running prints "Already up to date", and `doctor` reports no issues.
- [x] This repository's `AGENTS.md` has one H1 after regenerating.
- [x] A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js init --yes && grep -c '^# ' AGENTS.md ARCHITECTURE.md && node dist/cli.js doctor
```

## Commit
`fix(targets): skip the block heading when adopting a file that has one`

## Notes
- **Decision 1:** `io.sharedFilesWithOutsideH1` reads existing `AGENTS.md` / `ARCHITECTURE.md` and detects an ATX H1 outside managed blocks (fences ignored). `init` / `doctor` rebuild the plan with `omitBlockH1` so adapters drop the block H1. New files keep today's H1-in-block output.
- Edge case: interactive **Backup & replace** of a file that had an outside H1 can write a block without an H1 once; the next `init` adds the H1 because outside content is gone. `--yes` always adopts for shared files, so this path is rare.
