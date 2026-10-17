# T08 · `check-registry` Script

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T05, T07 | T09–T13 | §4.4, §8.2, §10 | M |

## Goal
A CI-enforced quality gate for registry content, so content tasks (T09–T13) get fast, specific feedback.

## Context
- PRD §4.4 (3-part formula and its mechanical check, budgets, section requirements) and §10 (contribution rules).
- Reuse `loadRegistry` (T05) and `findPlaceholders` (T07) instead of re-implementing them.

## Scope
- Add `tsx` as a dev dependency and the script `"registry:check": "tsx scripts/check-registry.ts"` to `package.json`.
- `src/registry/check.ts` (pure checks, unit-tested) + `scripts/check-registry.ts` (thin runner). Checks:
  - Everything `loadRegistry` validates (schema, folders, ids, references).
  - Body ≤ 120 lines (frontmatter excluded).
  - Rule fragments: at least one directive keyword (`ALWAYS`, `NEVER`, `PREFER`, `FORBID`, `DEFAULT`) and at least one fenced code block.
  - Architecture fragments: `## Summary` (≤ 10 non-empty lines) and `## Map` sections.
  - Workflow fragments: `## Purpose`, `## Input`, `## Steps`, `## Output`, `## Guardrails` sections.
  - Placeholders are all known (`src`, `pm`, `scripts.<name>`).
  - **Warning only:** `verifiedAt` older than 6 months.
  - **Forbidden phrases** (error): instructions to run `curl`/`wget`, `npm install`/`pnpm add`/`yarn add`, read `.env` files, or move/rename existing files. Keep the list in one constant so it's easy to extend.
- Output: one line per problem, `path: [error|warning] message`; summary count; exit `1` if any error.
- Add a `pnpm registry:check` step to `.github/workflows/ci.yml` (after lint).

## Out of scope
- Writing real fragments (T09–T13).

## Implementation notes
- Pass "today" into the freshness check as a parameter so tests are deterministic.
- The forbidden-phrase check should ignore content inside Anti-Pattern code blocks only if clearly marked; when in doubt, flag it and let a human decide.

## Acceptance criteria
- [ ] Unit tests cover each check with a passing and failing case.
- [ ] `pnpm registry:check` passes on the (empty) real registry and on `registry-sample`.
- [ ] Running it against a fixture with errors prints every problem and exits `1`; warnings alone exit `0`.
- [ ] CI runs the check.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(registry): add registry content checks for ci`

## Notes
_Record decisions and discovered gaps here._
