# T42 · Version Coverage & Resolve Consistency

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | — | T43, T45 | §3.3 step 3, §3.6, §4.2, §4.4, §8.2, §9 | L |

## Goal
Common real-world versions of the two most-used frameworks (Next.js 15 App Router and Express 4) get framework rules. When a framework isn't matched, the manifest, notices, and re-runs all agree on what was selected.

## Context
Running `init --yes` during the pre-launch review:
- A Next 15.5 project (`src/app`, `tailwindcss@4`, `zustand@4`, `vitest@2`) got **no** framework or library rules. `nextjs-app-router` has `appliesTo: next >=16.3.0`, so Next 15.x and 16.0–16.2 are skipped.
- Tailwind was then dropped with "Tailwind CSS was skipped — it targets a different framework." The real reason is that no framework was left in the plan.
- The manifest still wrote `"libraries": ["tailwind"]` while `fragments` had no `tailwind`. Root cause:
  - `manifestBody` (`src/commands/init.ts`, around line 710) writes `profile.libraries`, not the ids that resolved.
  - `suggestFragments` (`src/registry/resolve.ts`) ignores `compatibleWith`, so detection keeps suggesting a library that resolve will drop.
- Express 4, still the largest share of installed Express, gets nothing, because `express` has `appliesTo: >=5`.
- `frameworksForRouters` in `src/detect/index.ts` maps Next.js router folders onto the two existing Next.js fragment ids.

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **Version policy.** Recommended: "Each framework is covered for its current major and the previous one. A new fragment id is added per range when the guidance differs." Alternative: one fragment per framework, with directives limited to what holds across its range.
2. **Next.js ids.** Recommended: keep `nextjs-app-router` for `>=16.3.0` (published ids never change) and add `nextjs-app-router-15` for `>=15.0.0 <16.3.0`. It contains only directives that hold across that range.
3. **Express ids.** Recommended: keep `express` for `>=5` and add `express-4` for `>=4 <5`.

## Scope
1. **Registry content** (follow `docs/workflows/write-fragment.md` and `.cursor/rules/registry-content.mdc`): author the two new fragments. Verify every directive against the official docs for that version range. Fill in `sources` and `verifiedAt`.
2. **Router mapping** (`src/detect/index.ts`): an App Router project selects whichever App Router fragment's `appliesTo` matches the detected `next` version. Pages Router behavior is unchanged.
3. **Notices** (`src/registry/resolve.ts`, `src/ui/format.ts`): don't print "`next@15.5.2` detected — no matching rules yet" when another fragment for the same package matched. When a `compatibleWith` library is dropped because no framework was selected, say so. For example: "Tailwind CSS needs a supported framework (Next.js, React + Vite); none was selected."
4. **Detection respects `compatibleWith`**: once frameworks are chosen in `detect/index.ts`, drop suggested libraries that have `compatibleWith` and no compatible framework selected. That way detection, the saved selections, and resolve agree.
5. **Manifest records what resolved** (`src/commands/init.ts` `manifestBody`): `selections.frameworks` and `selections.libraries` contain only ids present in the resolved fragments.
6. **Fixtures and tests**: add `tests/fixtures/next15-app` (Next 15.5, `src/app`, `tailwindcss@4`) and `tests/fixtures/express4-ts`. Add e2e assertions and update tree snapshots. Add a re-run test showing the Next 15 fixture reaches "Already up to date."
7. **PRD**: add the version policy (§4.4 or §9), the new fragment ids (§4.2 registry tree), the new fixtures (§8.2), and the clearer notice (§3.6).

## Out of scope
- React 18 / Vite 5, Zustand 4, Vitest 2, and other older majors. They are tracked in `docs/tasks/backlog.md` (Phase 1).
- Showing version ranges in `list` (T48).
- Changing `typescript-strict` (T45).

## Implementation notes
- `appliesTo` ranges for the same package must not overlap. Add a `check-registry` error for two framework fragments with the same `detect.packages` and overlapping `appliesTo`.
- `resolve.ts` is pure (`.cursor/rules/pure-modules.mdc`).
- The fragment budgets (120 lines) and the always-on budget still apply.

## Acceptance criteria
- [x] Owner decisions recorded under **Notes**, and the PRD updated.
- [x] `init --yes` on `next15-app` writes App Router rules and Tailwind rules. The manifest's `selections` and `fragments` agree.
- [x] `init --yes` on `express4-ts` writes Express 4 rules.
- [x] `next15-src` (Next 16.3) output is byte-for-byte unchanged.
- [x] A Next.js project with no supported version gets one clear notice, and no library is reported as "targets a different framework".
- [x] Re-running on `next15-app` prints "Already up to date."
- [x] `pnpm registry:check` passes and rejects overlapping `appliesTo` ranges in a test fixture.
- [x] A human reviewed the new fragment content (Content Tasks checklist in `docs/tasks/README.md`).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm registry:check
cp -r tests/fixtures/next15-app /tmp/ai-t42 && node dist/cli.js init --yes --cwd /tmp/ai-t42 && cat /tmp/ai-t42/.agentinit/manifest.json
node dist/cli.js init --yes --cwd /tmp/ai-t42   # expect "Already up to date."
```

## Commit
`feat(registry): cover next.js 15 app router and express 4`
(If the resolve and manifest fixes land as a separate commit: `fix(registry): keep detected libraries in step with resolved fragments`.)

## Notes
### Owner decisions (2026-11-05)
1. Version policy: each framework covers its current major and the previous one; new fragment id per range when guidance differs.
2. Next.js: keep `nextjs-app-router` for `>=16.3.0`; add `nextjs-app-router-15` for `>=15.0.0 <16.3.0`.
3. Express: keep `express` for `>=5`; add `express-4` for `>=4 <5`.

### Implementation clarifications
- Overlapping `appliesTo` check requires the same `detect.packages` **and** the same globs, so App Router and Pages Router may both cover `next`.
- Unsupported-version notices are deduped to one per package when no fragment for that package matched.
- Version-split siblings collapse to the current-major id when the version is unknown.
- Content Tasks checklist completed; human reviewed `nextjs-app-router-15` and `express-4` on 2026-11-05.
