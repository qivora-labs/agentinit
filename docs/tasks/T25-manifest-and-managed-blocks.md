# T25 · Manifest & Managed Blocks

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M5 — Safe IO & Doctor | T03 | T26 | §6.1, §6.2, §6.4 (line endings) | M |

## Goal
Read/write the manifest with stable hashes, and safely insert, update, or remove managed blocks inside user files without touching anything else.

## Context
- PRD §6.1 marker format, §6.2 manifest shape and hashing rules (normalize to LF before hashing).
- This is the foundation of the "never overwrite user content" promise; be strict and test edge cases thoroughly.

## Scope
`src/io/hash.ts`:
- `contentHash(text) → string`: SHA-256 hex of the text with line endings normalized to LF (`\r\n` and a lone `\r` become `\n`).

`src/io/manifest.ts`:
- zod schema matching PRD §6.2 (`cliVersion`, `mode`, `selections`, `fragments`, `files` keyed by path or `path#blockId`).
- `readManifest(root) → Manifest | null` (missing → `null`; invalid → `AgentInitError` suggesting how to recover).
- `serializeManifest(manifest) → string`: stable key order, 2-space indent, trailing newline (so diffs are clean).
- Manifest path constant: `.agentinit/manifest.json`.

`src/io/managed-block.ts`:
- Markers: `<!-- agentinit:begin id=<id> -->` / `<!-- agentinit:end id=<id> -->`.
- `findBlocks(text) → Block[]` with positions and inner content.
- `upsertBlock(text, id, inner) → string`: replaces inner content of an existing block; otherwise appends the block at the end, separated by one blank line. Preserves every byte outside the block, and uses the file's existing line ending (CRLF files get CRLF in the inserted block).
- `removeBlock(text, id) → string`.
- Malformed markers (begin without end, end without begin, nested, duplicate ids) → `AgentInitError` naming the file; never guess.
- `createWithBlock(id, inner) → string` for new files.

## Out of scope
- Deciding when to write, conflicts, backups (T26).

## Acceptance criteria
- [x] Hash is identical for LF and CRLF versions of the same content.
- [x] Manifest round-trips (`serialize` → `read`) and its serialization is stable across runs.
- [x] `upsertBlock` on a file with surrounding user content leaves that content byte-for-byte identical (property-style test with several inputs).
- [x] CRLF file keeps CRLF everywhere after an upsert.
- [x] Each malformed-marker case throws a readable error.
- [x] `removeBlock` leaves no leftover blank-line growth after repeated add/remove cycles.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(io): add manifest, content hashing, and managed blocks`

## Notes
- `findBlocks`, `upsertBlock`, and `removeBlock` take a `file` path so malformed-marker errors can name the file. The task signatures omitted it; callers (T26) know the path.
- `contentHash` normalizes line endings to LF. `\r\n` is replaced before a lone `\r`, so a CRLF pair stays one newline.
- Manifest keys follow PRD §6.2 order (`cliVersion`, `mode`, `selections`, `fragments`, `files`). `fragments` and `files` keys are sorted by UTF-16 code unit. Selection arrays keep the order they were given.
- `language` is `typescript-strict` | `typescript`, `mode` is `existing` | `greenfield`, and `agents` entries are the four v0.1 targets. A file key is a relative POSIX path, or that path plus `#` and a block id. `sha256` is 64 lowercase hex digits. Unknown keys are rejected.
- Missing manifest returns `null`. Invalid JSON or schema throws `AgentInitError` with a hint to fix `.agentinit/manifest.json` or delete it and run `agentinit init`.
- Markers must occupy a whole line (optional surrounding spaces or tabs). Text that merely contains a marker is user content.
- Inserted newlines use CRLF when the file contains any `\r\n`; otherwise LF. Bytes outside the inner span are not rewritten, so a mixed file keeps its existing endings outside the edit. `createWithBlock` and an empty file use LF.
- Appending inserts exactly one line ending before the block (none on an empty file). A file that already ends in a newline gets one blank line; an existing trailing blank line stays and one more is added; a file with no trailing newline gets the marker on the next line. Removing drops that one line ending when the block is at the end of the file, or when another managed block follows after a blank line, so add/remove cycles restore the original bytes. The following block counts only when `findBlocks` recorded it there; a line that merely resembles a marker stays, blank line included. A block at the start of the file has no leading separator, so the separator in front of the next block is dropped instead and the file does not gain a leading blank line. Other text after a block stays byte-for-byte, including its blank lines.
- Block content must not contain a whole-line begin or end marker. `upsertBlock` and `createWithBlock` throw rather than write a file the next parse cannot read. Marker text that shares a line with other content is allowed.
- A begin/end id mismatch throws and is not paired. `removeBlock` throws when the id is absent. Block ids must be non-empty and must not contain whitespace, `#`, `\`, or `>`, so `path#id` manifest keys stay unambiguous.
