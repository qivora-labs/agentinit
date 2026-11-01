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
- `contentHash(text) → string`: SHA-256 hex of the text with `\r\n` → `\n`.

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
- `contentHash` replaces `\r\n` with `\n` only. A lone `\r` stays in the hashed text.
- Manifest keys follow PRD §6.2 order (`cliVersion`, `mode`, `selections`, `fragments`, `files`). `fragments` and `files` keys are sorted by UTF-16 code unit. Selection arrays keep the order they were given.
- `language` is `typescript-strict` | `typescript`, `mode` is `existing` | `greenfield`, and `agents` entries are the four v0.1 targets. A file key is a relative POSIX path, or that path plus `#` and a block id. `sha256` is 64 lowercase hex digits. Unknown keys are rejected.
- Missing manifest returns `null`. Invalid JSON or schema throws `AgentInitError` with a hint to fix `.agentinit/manifest.json` or delete it and run `agentinit init`.
- Markers must occupy a whole line (optional surrounding spaces or tabs). Text that merely contains a marker is user content.
- Inserted newlines use CRLF when the file contains any `\r\n`; otherwise LF. Bytes outside the inner span are not rewritten, so a mixed file keeps its existing endings outside the edit. `createWithBlock` and an empty file use LF.
- Appending adds the fewest newlines that leave exactly one blank line before the block. Removing a block at end of file also drops one preceding blank line, so add/remove cycles on a normal file do not grow. A file that already ended with a blank line loses that one line. A file with no trailing newline gains one after an add/remove cycle. User content after a block is left byte-for-byte, including its blank lines.
- A begin/end id mismatch throws and is not paired. `removeBlock` throws when the id is absent. Block ids must be non-empty and must not contain whitespace or `>`.
