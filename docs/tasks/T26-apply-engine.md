# T26 · Apply Engine

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M5 — Safe IO & Doctor | T25 | T27, T28 | §3.5, §6.2–§6.4 | L |

## Goal
Turn a plan into disk changes safely: classify every operation, resolve conflicts (interactive or by defaults), back up, write atomically, remove stale owned files, and produce the new manifest.

## Context
- PRD §6.3 (Adopt / Backup & replace / Skip), §6.4 (atomic writes, backups, `.agentinit/.gitignore`), §3.5 (`--yes` defaults for files).
- Uses the `Prompter` interface from T03 (`src/ui/prompter.ts`) for conflict questions.

## Scope
`src/io/changes.ts` — `computeChanges(root, plan, manifest) → Change[]` (read-only). Each change is one of:
- `create` (path doesn't exist),
- `update` (owned and hash matches manifest; content differs),
- `unchanged`,
- `conflict-unmanaged` (exists, not in manifest; for shared files: no markers),
- `conflict-edited` (owned, but hash differs from manifest),
- `delete-stale` (in manifest, not in plan — e.g., an agent was deselected; only if hash matches, otherwise `conflict-edited`).

`src/io/apply.ts` — `applyChanges(root, changes, options) → { manifestFiles, report }`:
- Resolution: interactive via `Prompter` (show a diff with `diff`), or defaults: shared unmanaged → Adopt; other unmanaged → Skip; edited → Skip; `--force` → Backup & replace for all conflicts.
- Backups: `.agentinit/backups/<timestamp>/<original-path>`; ensure `.agentinit/.gitignore` contains `backups/`.
- Atomic writes: write every file to a temp file in the same directory first, then rename all; the manifest is written last.
- `dryRun`: return the report and unified diffs; write nothing (not even `.agentinit/`).
- Report: per-file action (created, updated, adopted, backed up, skipped, deleted, unchanged) for T27 to print.

## Out of scope
- Running detection, planning, or printing (T27).

## Implementation notes
- Inject the clock (for backup timestamps) and the prompter so tests are deterministic.
- Use a temp project directory per test; assert on the final file tree and contents.

## Acceptance criteria
- [ ] Each change type is classified correctly from a crafted manifest + disk state.
- [ ] Defaults match PRD §3.5 for every conflict kind; `--force` backs up before replacing.
- [ ] Adopt keeps user content and appends the managed block.
- [ ] Stale owned files are deleted only when unedited.
- [ ] `dryRun` leaves the directory byte-for-byte unchanged (compare a tree hash before/after).
- [ ] A simulated failure mid-apply (throw after temp writes) leaves no partial target files.
- [ ] `.agentinit/.gitignore` contains `backups/` after a backup.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(io): apply file plans with conflicts, backups, and atomic writes`

## Notes
_Record decisions and discovered gaps here._
