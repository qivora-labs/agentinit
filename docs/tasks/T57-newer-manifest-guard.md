# T57 · Version Guard Before Manifest Value Checks

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M10 — 0.1.2 patch | — | backlog J1 | §3.4, §6.2, §6.5, §6.6 | S |

## Goal
An older CLI that meets a manifest written by a newer release tells the user to run the newer version. It never tells them to fix or delete the manifest.

## Context
Promoted from `backlog.md` P1.8.
- T50 made unknown manifest **keys** tolerant. An unknown **value** in a known field still fails `manifestSchema`, and `parseManifest` in `src/io/manifest.ts` runs before `assessCliCompat` in `init`, `remove`, and `doctor`.
- Reproduced with 0.1.1 on 2026-11-12, using a manifest with `cliVersion: "0.2.0"` and `selections.language: "javascript"`:
  - `init --yes` exits `1` with *"selections.language: Invalid option: expected one of "typescript-strict"|"typescript"`* and the hint *"Fix .agentinit/manifest.json, or delete it and run `agentinit init` again."*
  - `doctor` reports `manifest-invalid` with the same fix.
  - Control: the same manifest with only `cliVersion` changed gives the correct message, *"This project was set up with agentinit 0.2.0. Run `npx @agentinit/cli@0.2.0` or newer."*
- The advice is harmful. Without the manifest, the next `init` treats every generated file as one it doesn't own.
- v0.2 writes `language: "javascript"` (backlog J1). `selections.agents` and `mode` are closed sets too, so a new agent target (backlog P3.3) would fail the same way.
- 0.1.0 and 0.1.1 keep the old message. Shipping this before 0.2 keeps that window short (PRD §6.2).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **`doctor` on a newer manifest it cannot read.** Recommended: an **error** (exit `2`), reported under the existing `manifest-invalid` kind with the message *"`.agentinit/manifest.json` was written by a newer agentinit (0.2.0)."* and the fix *"Run doctor with `@agentinit/cli@0.2.0` or newer."* `doctor` cannot run any other check, so exit `0` would be a false pass. This is an exception to "`doctor` never blocks on version alone" (PRD §6.6), limited to a manifest it cannot parse. Alternatives: a new issue kind such as `newer-manifest`, or a warning with exit `0`.
2. **Open language ids.** The backlog proposed accepting any kebab-case id in `selections.language` and checking it against the registry. Recommended: leave that to J1. The version guard alone fixes the message, and J1 changes the `Language` type everywhere anyway. Alternative: do it here.

## Scope
1. **Detect the case** (`src/io/manifest.ts`): when the file is valid JSON but fails the schema, read `cliVersion` from the parsed data. If it is valid semver and newer than the running CLI (major, minor, or patch), raise an error that carries that version instead of the schema message and the recover hint.
2. **`init` and `remove --all`:** exit `1` with the existing `olderCliMessage` text and print the version notice, as the `behind` path does today. `--force` does not override this case, because there are no readable selections to continue with. Nothing is written.
3. **`doctor`:** apply decision 1.
4. **`--json`:** the notice *"Set up with agentinit \<manifest\> · running \<cli\>"* is included, as it is for a readable newer manifest.
5. **Docs:** PRD §3.4, §6.2, and §6.5 or §6.6 per decision 1. Add one line to the Compatibility section of `CONTRIBUTING.md`: a new value in a closed manifest field (`language`, `agents`, `mode`) needs a minor release, and from 0.1.2 older readers answer with the upgrade message.
6. Add a `patch` changeset.

## Out of scope
- Accepting `javascript` as a language (backlog J1).
- A `manifestVersion` field, and migrating manifests between versions.
- Any change for a manifest whose `cliVersion` is the same, older, missing, or not valid semver. Those keep today's `manifest-invalid` path.

## Implementation notes
- `src/io/` doesn't know the running version. Either pass it in, or let the error carry the manifest's version and have the commands decide. `src/cli-compat.ts` already has the comparison and both message builders.
- A manifest that parses and is merely newer keeps its current behavior, including `--force`.
- Read `.cursor/rules/io-safety.mdc`. This path must write nothing, including the manifest.

## Acceptance criteria
- [x] Decisions recorded under **Notes**, and the PRD updated.
- [x] `cliVersion: "0.2.0"` with `selections.language: "javascript"`, running 0.1.2: `init --yes` exits `1` with the upgrade message and no "delete it" hint. `init --yes --force` does the same. The manifest is byte-for-byte unchanged.
- [x] `remove --all --yes` behaves the same way on that manifest.
- [x] `doctor` on that manifest follows decision 1, in text and in `--json`.
- [x] An unknown `selections.agents` value and an unknown `mode` from a newer `cliVersion` give the same results.
- [x] An unknown language with the same or an older `cliVersion`, or with an invalid `cliVersion`, is still `manifest-invalid` with the recover hint.
- [x] A readable manifest with only a newer `cliVersion` behaves as before (the existing tests pass unchanged).
- [x] A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`fix(io): report a newer manifest as an upgrade, not a corrupt file`

## Notes
Owner decisions, 2026-11-12. The PRD is updated when the task is implemented.
- **Decision 1:** `doctor` reports an unreadable newer manifest as an **error** (exit `2`) under the existing `manifest-invalid` kind, with the "written by a newer agentinit" message and the "run doctor with that version or newer" fix. No new issue kind.
- **Decision 2:** open language ids are left to backlog J1. T57 keeps the closed `language` set and only changes the message.
- Implemented 2026-11-13: `readManifest(root, runningVersion)` peeks `cliVersion` after a schema failure; if it is valid semver newer than the running CLI (including patch), throws `NewerUnreadableManifestError` with `olderCliMessage` and no recover hint. `init`/`remove` print the version notice and exit `1` even with `--force`. `doctor` uses decision 1 messages and includes the version notice in `--json`.
