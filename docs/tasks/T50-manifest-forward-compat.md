# T50 · Manifest Forward Compatibility & Public API Rules

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M9 — 0.1.1 patch | T49 | T53 | §6.2, §6.6, §9 | M |

## Goal
A manifest written by a newer agentinit doesn't break an older CLI's `doctor` in CI, and an older CLI never silently downgrades a project's rules. The compatibility promises that apply now that 0.1.0 is public are written down.

## Context
- `manifestSchema`, `selectionsSchema`, and each file entry in `src/io/manifest.ts` are `.strict()`. Any key the running CLI doesn't know fails parsing with exit `1`.
- 0.1.0 is already published with that behavior and can't be changed. The goal is to make 0.1.1 and later tolerant, so the strict window stays as short as possible.
- Teams mix versions: README PR #54 recommends pinning `doctor` in CI, while teammates may run a newer `npx @agentinit/cli init` locally.
- `serializeManifest` writes only known keys, so an older CLI that rewrites a newer manifest drops whatever it doesn't know.

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Unknown keys when rewriting.** Recommended: **preserve** them, in their original position after the known keys, so an older CLI never deletes data a newer one wrote. Alternative: drop them with a warning.
2. **An older CLI writing to a newer project.** Recommended:
   - Same major and minor, older patch: warn and continue.
   - Older minor or major: `init` and `remove --all` exit `1` with "This project was set up with agentinit 0.2.0. Run `npx @agentinit/cli@0.2.0` or newer." `--force` overrides.
   - `doctor` only warns (T49 covers its content checks).

## Scope
1. **Tolerant parsing** (`src/io/manifest.ts`): unknown keys at the top level, in `selections`, and in file entries parse without error. Known keys keep their validation, including T41's owned-path rules for `files` keys. Unknown keys are kept or dropped according to decision 1.
2. **Version guard** (`src/commands/init.ts`, `src/commands/remove.ts`, `src/commands/doctor.ts`): compare `manifest.cliVersion` with the running version and apply decision 2. Treat an invalid `cliVersion` as unknown: warn, never block.
3. **Notices**: one line in the detection card or command header, for example "Set up with agentinit 0.2.0 · running 0.1.1". Include it in `--json` as a notice.
4. **Public API rules**: add a "Compatibility" section to `CONTRIBUTING.md`, and a short pointer in the hand-written part of `AGENTS.md`:
   - Published fragment ids never change; deprecate and replace them instead.
   - Manifest changes in 0.x are additive and optional only. Readers ignore unknown keys from 0.1.1 on.
   - `--json` shapes and exit codes are public. Breaking changes need a minor release (pre-1.0) and a `BREAKING CHANGE` note in the changeset.
5. **PRD**: §6.2 forward-compatibility policy, plus decision 2 in §3.4 and §6.6.
6. Add a `patch` changeset.

## Out of scope
- A separate `manifestVersion` field: adding a key would break 0.1.0 readers, which are strict.
- Migrating manifests between versions.

## Implementation notes
- With zod, prefer `.passthrough()` / `.catchall(z.unknown())` on the three objects, then strip known keys when collecting extras. Keep `formatIssues` messages for known-key failures.
- Read `.cursor/rules/io-safety.mdc`. The manifest is still written last and atomically.

## Acceptance criteria
- [ ] Owner decisions recorded under **Notes**, and the PRD updated.
- [ ] A manifest with an extra top-level key, an extra `selections` key, and an extra file-entry key parses. `doctor` treats it like the same manifest without them.
- [ ] Under decision 1 "preserve": `init --yes` rewrites the manifest and keeps the extra keys byte-for-byte in value.
- [ ] `cliVersion: "0.2.0"` with a running `0.1.1`: `init --yes` exits `1` with the upgrade message, and `init --yes --force` proceeds. A patch-only difference warns and proceeds.
- [ ] `CONTRIBUTING.md` has the Compatibility section.
- [ ] A `patch` changeset exists.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`fix(io): tolerate unknown manifest keys and guard against older clis`

## Notes
