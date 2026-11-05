# T41 · Restrict Manifest Paths to Agentinit-Owned Files

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | — | T43, T46 | §5.2, §6.2, §6.4 | M |

## Goal
A committed manifest can only ever make agentinit write or delete files agentinit itself generates. A forged or badly merged manifest entry can no longer delete user files.

## Context
- `fileKeyProblem` in `src/io/manifest.ts` accepts any relative path. It rejects only empty keys, backslashes, absolute paths, and newlines. It does not reject `.` or `..` segments, and it does not check that the path is one agentinit writes.
- `computeChanges` (`src/io/changes.ts`) turns a manifest key that the plan no longer produces into `delete-stale`. `decide()` in `src/io/apply.ts` approves `delete-stale` without a prompt, including with `--yes`.
- Repro from the pre-launch review: add `"secret-notes.txt": { "sha256": "<sha256 of its content>" }` to `.agentinit/manifest.json`, then run `init --yes`. The report prints `secret-notes.txt (deleted)` and the file is gone. The same works for `package.json`, `.github/workflows/ci.yml`, or `.git/config`.
- The manifest is committed (PRD §6.2), so anyone who can open a PR can add such an entry.

## Scope
1. **One list of owned paths** — a new pure module, `src/owned-paths.ts`, exporting `isOwnedPath(path: string): boolean` and `isOwnedBlockKey(path: string, blockId: string): boolean`. Owned paths are exactly the outputs in PRD §5.2:
   - Shared managed-block files: `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `.github/copilot-instructions.md` (only with a `#<blockId>` key).
   - Rule files: `.cursor/rules/agentinit-<id>.mdc`, `.claude/rules/agentinit-<id>.md`, `.windsurf/rules/agentinit-<id>.md`, `.github/instructions/agentinit-<id>.instructions.md`.
   - Workflow and manual files: `.cursor/commands/<id>.md`, `.claude/skills/<id>/SKILL.md`, `.windsurf/workflows/<id>.md`, `.github/prompts/<id>.prompt.md`.
   - `<id>` follows the registry id pattern from `src/registry/schema.ts`. Reuse that pattern; don't copy it.
2. **Manifest validation** (`src/io/manifest.ts`): `fileKeyProblem` also rejects `.`, `..`, and empty path segments, and any key that fails `isOwnedPath` / `isOwnedBlockKey`. The message names the key and says it is not a file agentinit writes. The hint stays `RECOVER_HINT`.
3. **Defense in depth** (`src/io/apply.ts`): before deleting (`delete-stale`) or replacing a file, assert `isOwnedPath`. Throw `AgentInitError` if it fails. That way a bug elsewhere can't turn into a deletion.
4. **Adapters stay in sync**: add a test that builds the plan for every e2e fixture, every target, and every registry fragment, and asserts that every `FileOp.path` passes `isOwnedPath`. Adding an output format without updating `owned-paths.ts` must fail this test.
5. Update `ARCHITECTURE.md` (folder map: `src/owned-paths.ts` is a shared contract, pure) and add a sentence to PRD §6.2 saying manifest keys are limited to agentinit-owned paths.

## Out of scope
- Allowing users to register their own owned paths (team fragments, v0.2).
- Changing what counts as a conflict or how stale files are reported.

## Implementation notes
- `src/owned-paths.ts` must not touch disk, `process`, or the clock (`.cursor/rules/pure-modules.mdc`). Targets may import it. `io/` may import it, because it is a shared contract like `compare-text.ts`.
- Read `.cursor/rules/io-safety.mdc` before editing `src/io/`.
- Existing fixture manifests (`tests/fixtures/edited-managed-block/.agentinit/manifest.json`) and the dogfood manifest must still parse.

## Acceptance criteria
- [ ] A manifest key for `secret-notes.txt`, `package.json`, `.git/config`, `.cursor/rules/../../x.mdc`, or `.cursor/rules/custom.mdc` (no `agentinit-` prefix) fails to parse. The error names the key.
- [ ] `AGENTS.md` without `#<blockId>` fails. `AGENTS.md#core` passes.
- [ ] The pre-launch repro deletes nothing and exits `1` with a readable message.
- [ ] A unit test that hands `applyChanges` a `delete-stale` change for a non-owned path throws and leaves the file in place.
- [ ] The "every plan path is owned" test covers all fixtures and all four targets.
- [ ] All existing tests, the dogfood `doctor`, and the smoke test pass.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js doctor
```

## Commit
`fix(io): limit manifest paths to files agentinit writes`

## Notes
