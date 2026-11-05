# T46 · `remove --all` & `--no-workflows`

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | T41, T43 | T48 | §1.4 UC5, §3.1, §3.5, §5.1, §6.2, §6.6, §7 | L |

## Goal
Make trying agentinit low-risk at launch. One command removes everything it generated, and teams that don't want slash-command workflows can leave out the 16 workflow files.

## Context
- `init` on `next15-src` with four agents writes 24 files in six directories. 16 of them are the same four workflows in four formats. PRD §5.5 makes workflows mandatory in v0.1.
- PRD UC5 ("Try and leave") and `remove --all` are scheduled for v0.2. A tool that writes 24 files needs a one-command exit to earn trust at launch.
- T41 provides `isOwnedPath`. T43 adds `selections.excluded` and is the last pre-publish change to the manifest schema before this one.

## Decisions (owner, before starting)
1. **Backups.** PRD §6.6 says `remove --all` deletes `.agentinit/`. That would also delete `.agentinit/backups/`, which can hold the user's original files from *Backup & replace*. Recommended: delete the manifest and `.agentinit/.gitignore`, keep `backups/` if it isn't empty, and print its path.
2. **Empty shared files.** After a managed block is removed, a shared file may contain only whitespace. The manifest doesn't record whether agentinit created the file. Recommended: delete the file only if nothing but whitespace remains.
3. **Workflow setting shape.** Recommended: `selections.workflows: boolean` (default `true`), since per-workflow selection is out of scope for v0.1 (PRD §4.4).

## Scope
1. **`agentinit remove --all`** (`src/commands/remove.ts`, registered in `src/main.ts`):
   - Requires a manifest; without one, exit `1` with the usual "run init" hint.
   - For every manifest file key: delete unedited owned files (hash matches) and remove unedited managed blocks along with their markers. Every byte outside the markers stays unchanged.
   - Edited files and blocks: interactive mode asks *Keep* (default) or *Delete after backup*. `--yes` keeps them and reports them. `--force` backs them up and deletes them.
   - Then handle the manifest and `.agentinit/` as in decision 1.
   - Supports `--dry-run` (prints the planned deletions, writes nothing) and `--json`.
   - `remove` with ids (v0.2) exits `1` with "Only `remove --all` is available in this version."
2. **`--no-workflows`** (`src/context.ts`, `src/commands/init.ts`, `src/plan/build-plan.ts`):
   - Sets `selections.workflows: false`, and the plan leaves out workflow `FileOp`s.
   - The setting is saved in the manifest, so re-runs keep it. *Customize* shows a yes/no "Include workflows (slash commands)?" with the saved value preselected.
   - Turning workflows off on a re-run removes previously generated workflow files through the existing stale-file path.
   - Next steps don't suggest `/new-feature` when workflows are off.
3. **Manifest** (`src/io/manifest.ts`): add `selections.workflows`. It is optional when read (defaults to `true`) and always written.
4. **Help and README**: `--help` lists `remove --all` and `--no-workflows`. README commands and flags tables updated (T48 does the final README pass).
5. **PRD**: move `remove --all` from v0.2 to v0.1 (§3.1, §6.6, §7). Document `--no-workflows` (§3.1 flags, §3.5 default, §5.5) and record decisions 1–3.

## Out of scope
- `add <id>`, `remove <id>`, `update` (v0.2).
- Selecting individual workflows.

## Implementation notes
- Reuse `src/io/managed-block.ts` for block removal and `src/io/apply.ts` for atomic writes, deletes, backups, and SIGINT handling. Don't add a second write path. Read `.cursor/rules/io-safety.mdc`.
- Every deletion goes through `isOwnedPath` (T41).
- Keep `commands/remove.ts` thin; deciding what to delete belongs in `io/`, as a `Change[]` computation.

## Acceptance criteria
- [ ] Owner decisions recorded under **Notes**, and the PRD updated.
- [ ] On `existing-claude-md` after `init --yes`, `remove --all --yes` restores `CLAUDE.md` byte-for-byte, deletes every generated file, and removes `.agentinit/manifest.json`.
- [ ] A hand-edited rule file survives `remove --all --yes` and is reported. With `--force`, it is backed up and then deleted.
- [ ] Backups made before removal are kept, and their path is printed.
- [ ] `remove --all --dry-run` writes nothing.
- [ ] `init --yes --no-workflows` on `next15-src` writes 8 files (4 rule files, `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `copilot-instructions.md`). A re-run without the flag keeps workflows off.
- [ ] Turning workflows off through *Customize* on a re-run deletes the old workflow files.
- [ ] Interrupting `remove --all` (SIGINT) leaves no partial files (same guarantee as `init`).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
cp -r tests/fixtures/existing-claude-md /tmp/ai-t46 && cp /tmp/ai-t46/CLAUDE.md /tmp/ai-t46-claude.orig
node dist/cli.js init --yes --cwd /tmp/ai-t46 && node dist/cli.js remove --all --yes --cwd /tmp/ai-t46
diff /tmp/ai-t46/CLAUDE.md /tmp/ai-t46-claude.orig && echo "CLAUDE.md restored"
```

## Commit
`feat(cli): add remove --all and --no-workflows`

## Notes
