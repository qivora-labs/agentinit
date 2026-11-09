# T52 · Small Fixes for 0.1.1

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M9 — 0.1.1 patch | T49 | — | §3.1, §6.5 | S |

## Goal
Fix three small defects that shipped in 0.1.0: a backwards-reading help line, a `doctor` fix message that's wrong for whole-file outputs, and a `files` setting that can pack stray build output.

## Context
- `agentinit --help` prints `--no-workflows   Skip slash-command workflow files on init (default: true)`. cac appends `(default: true)` to negated flags, so it reads as if workflows are skipped by default.
- `EDITED_FIX` in `src/doctor/checks.ts` is: "Move your text outside the agentinit markers, then run `npx @agentinit/cli init`, or exclude the fragment with \*Customize\*." It's used for every `edited` issue:
  - Whole-file outputs (`.cursor/rules/*.mdc`, workflow files) have no markers.
  - `*Customize*` prints literally in a terminal.
  - Workflows can't be excluded one by one; only `--no-workflows` exists.
- `package.json` has `"files": ["dist", "registry"]`. Before 0.1.0, a local `dist/test/` folder (from running `init` inside `dist/`) showed up in `npm pack --dry-run`. CI builds from a clean checkout, so the published tarball was clean, but a local `pnpm release` (the checklist's recovery path) would have shipped it.

## Scope
1. **Help text** (`src/main.ts`): `--help` shows `--no-workflows` without `(default: true)`, for example `--no-workflows   Skip slash-command workflow files`. Use a cac option or a help callback; don't fork cac. Add a test on the help output.
2. **Edited fix text** (`src/doctor/checks.ts`): choose the fix by output kind:
   - Managed block: "Move your text outside the agentinit markers in `<file>`, then run `npx @agentinit/cli init`."
   - Rule file: "Run `npx @agentinit/cli init` and choose Backup & replace, or exclude `<fragment id>` under Customize."
   - Workflow file: "Run `npx @agentinit/cli init` and choose Backup & replace, or pass `--no-workflows`."
   No Markdown emphasis in terminal strings. `--json` `fix` gets the same text.
3. **Package contents** (`package.json`): `"files": ["dist/cli.js", "registry"]`. The smoke test (`scripts/smoke.ts`) must still pass, and `pnpm check:package` must stay clean.
4. Add a `patch` changeset.

## Out of scope
- Other help text changes, and any change to `doctor` severities (T49).

## Implementation notes
- `doctor/checks.ts` is pure. The output kind can come from the `DriftChange` (`blockId` present means managed block) and the owned-path pattern (`src/owned-paths.ts`) for rule vs. workflow.
- If T49 changes `checks.ts` first, rebase onto it rather than merging conflicting messages.
- Update the `doctor-issue-*` screen snapshots.

## Acceptance criteria
- [ ] `node dist/cli.js --help` shows `--no-workflows` with no "(default: true)".
- [ ] An edited managed block, an edited rule file, and an edited workflow file each show the matching fix text, with no `*` characters.
- [ ] `npm pack --dry-run` lists only `dist/cli.js` from `dist/`, even when other files exist under `dist/`.
- [ ] Smoke test passes. A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:package && pnpm smoke
mkdir -p dist/junk && touch dist/junk/x && npm pack --dry-run 2>&1 | grep dist/ ; rm -rf dist/junk
node dist/cli.js --help | grep workflows
```

## Commit
`fix(cli): correct no-workflows help, doctor fix text, and package files`

## Notes
