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
- [x] Each change type is classified correctly from a crafted manifest + disk state.
- [x] Defaults match PRD §3.5 for every conflict kind; `--force` backs up before replacing.
- [x] Adopt keeps user content and appends the managed block.
- [x] Stale owned files are deleted only when unedited.
- [x] `dryRun` leaves the directory byte-for-byte unchanged (compare a tree hash before/after).
- [x] A simulated failure mid-apply (throw after temp writes) leaves no partial target files.
- [x] `.agentinit/.gitignore` contains `backups/` after a backup.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(io): apply file plans with conflicts, backups, and atomic writes`

## Notes
- `computeChanges` takes `{ ops }` (a `Plan` satisfies it) and does not import `plan/`. Ownership is the manifest key (`path` or `path#blockId`). A missing path is `create`, including when the manifest still lists it.
- A managed block is hashed as the inner text `upsertBlock` stores, with a trailing newline added when the op omitted one, then normalized to LF. Whole-file hashes use `contentHash` on the op text. CRLF and LF copies of the same text compare equal.
- An owned block that was removed from an existing file is `conflict-edited`, so `--yes` skips it instead of putting the block back. A missing file stays `create`. T28 can treat `create` as "file missing" and `conflict-edited` with no on-disk block as "block removed".
- A shared file with no marker for the planned block, and no manifest entry, is `conflict-unmanaged`. If that block is already present and its inner matches the plan, the change is `unchanged` and the next manifest records it. If the inner differs, it is `conflict-edited`, so Adopt does not overwrite text inside a marker we do not own.
- A manifest entry whose file or block is already gone is omitted. No change is reported, and the key is left out of `manifestFiles`.
- `--yes`: unmanaged managed block → Adopt; other unmanaged → Skip; edited (including a stale edited file or block) → Skip. `--force` wins over `--yes` and chooses Backup & replace for every conflict. With neither flag, a conflict needs a `Prompter` or `applyChanges` throws `NotInteractiveError`. The prompt shows a unified diff from the `diff` package, then Adopt (shared unmanaged only), Backup & replace, or Skip.
- Adopt appends the block and leaves every other byte alone. Backup & replace of a managed block writes a fresh file that contains the block, after copying the original to `.agentinit/backups/<timestamp>/<path>`. Skipped or unchanged blocks in that file are copied into the fresh file; a skipped block keeps its previous manifest hash. The timestamp comes from the injected `now` clock (`2026-11-02T01:10:00.000Z` → `20261102T011000000Z`) so the name has no colons.
- Stale unedited files are deleted with no backup. Stale unedited blocks are removed and the surrounding text stays; an empty result deletes the file. `--force` on a stale edit backs up first, then deletes the file or removes the block. A skipped edit keeps the previous manifest hash, so the next run still sees the edit.
- Whole-file updates keep the file's current line ending. New files and `createWithBlock` stay LF. A fresh managed block written over a CRLF file uses CRLF.
- `applyChanges` writes the manifest. Pass everything except `files` in `options.manifest`; the returned `manifestFiles` is merged in and `serializeManifest` runs last. Report actions are `created`, `updated`, `adopted`, `backed-up`, `skipped`, `deleted`, and `unchanged`, with a unified `diff` (empty for `unchanged`) and `backupPath` when a backup was made for that change.
- Temps are written in the destination directory and renamed only after all of them exist: `.agentinit/.gitignore`, then backups, then project files, then deletions, then the manifest. `beforeRename` runs in that gap. A throw removes the temps and any empty directories the apply created, and the target tree is unchanged.
- `.agentinit/.gitignore` is created or updated on every real apply, and renamed into place before any backup file, so `backups/` is present before the first backup. Only an exact line `backups/` or `/backups/` counts; a longer pattern such as `backups/old/` does not. `dryRun` returns the report and `manifestFiles` and does not create `.agentinit/` or anything else.
- A path must be a relative POSIX path with no `#`, `.`, or `..`. A symlink that resolves outside the project, and a broken symlink, are refused before any directory is created through it. Permission errors name the path. A parent path that is a file becomes `AgentInitError`.
