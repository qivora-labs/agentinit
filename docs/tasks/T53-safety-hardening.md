# T53 · Low-Severity Safety Hardening

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M9 — 0.1.1 patch | T50 | — | §6.1, §6.4, §6.5 | M |

## Goal
Close three low-severity gaps from the pre-launch code review: backup folder collisions, marker-like lines that make a file unreadable, and a corrupt manifest that `doctor` reports as a crash rather than a failed check.

## Context
Promoted from `backlog.md` P1.2.
- **Backups:** `.agentinit/backups/<stamp>/` uses the injected clock with millisecond resolution (`backupStamp` in `src/io/apply.ts`). Two runs in the same millisecond share one folder, and the second can overwrite the first's copies.
- **Marker lines:** `findBlocks` in `src/io/managed-block.ts` treats any whole line `<!-- agentinit:begin id=… -->` as a marker, including inside fenced code blocks. A user who documents agentinit inside their `AGENTS.md` (for example, in a code sample) gets a parse error, and every command fails on that file.
- **Corrupt manifest:** invalid JSON or a schema failure throws `AgentInitError`, so `doctor` exits `1`. CI can't tell "the rules are broken" (exit `2`) from "the tool crashed" (exit `1`).

## Decisions (owner, before starting)
1. **Markers inside fenced code.** Recommended: **ignore** them; they're documentation, not markers. Alternative: keep rejecting them, with a message that names the line and suggests indenting it.

## Scope
1. **Backup folder names** (`backupStamp` in `src/io/apply.ts`): append a short random suffix to the timestamp folder (`20261109T051000123Z-3f9a`). Randomness is injected through the apply options the same way as `now`, so tests stay deterministic.
2. **Fenced code** (`src/io/managed-block.ts`): apply decision 1. Recognize ```` ``` ```` and `~~~` fences of three or more characters, per CommonMark. Writing a block must still refuse inner content that contains a real marker line.
3. **Corrupt manifest in `doctor`** (`src/commands/doctor.ts`, `src/doctor/checks.ts`): catch manifest read and parse errors and report a `manifest-invalid` issue (severity error, under the `manifest` check). The message includes the parse error, and the fix is the existing recover hint. Exit `2`. Later checks are skipped, as with `not-initialized`. `init` and `remove` keep exiting `1`.
4. **PRD**: §6.1 (fenced markers), §6.4 (backup folder names), §6.5 (`manifest-invalid`).
5. Add a `patch` changeset.

## Out of scope
- Cleaning up old backups automatically.
- Repairing a corrupt manifest.

## Implementation notes
- Read `.cursor/rules/io-safety.mdc`. Byte-for-byte preservation tests outside blocks must keep passing, plus a new one with a fenced example marker.
- T50 changes manifest parsing; build the `doctor` error mapping on its final error types.

## Acceptance criteria
- [x] Decision recorded under **Notes**, and the PRD updated.
- [x] Two applies with the same injected timestamp write to different backup folders.
- [x] An `AGENTS.md` with a marker line inside a fenced code block adopts and updates normally, and the fenced lines are unchanged (decision "ignore").
- [x] Invalid JSON in `.agentinit/manifest.json`: `doctor` exits `2` with `manifest-invalid`, and `--json` reports it with `severity: "error"`.
- [x] A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`fix(io): harden backups, fenced markers, and corrupt manifest reporting`

## Notes
- **Decision 1:** ignore marker lines inside CommonMark fenced code (` ``` ` / `~~~`, length ≥ 3). Writing a block still refuses inner content that contains a real marker line.
- Backup folders are `<stamp>-<4-hex>`; `backupSuffix` is injectable on apply options (and through `run` for tests) the same way as `now`.
- `manifest-invalid` uses `MANIFEST_RECOVER_HINT` from `src/io/manifest.ts`; checklist skips later checks like `not-initialized`.
