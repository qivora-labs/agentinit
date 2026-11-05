# T45 · Fragment Examples Follow `typescript-strict`

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M8 — Launch readiness | T42 | T47 | §4.4, §8.3 | M |

## Goal
The always-on rules and the scoped rules never contradict each other. Every code example in the registry follows the language rules it will be loaded alongside.

## Context
- `typescript-strict` (always-on) says: "**ALWAYS** write an explicit return type on every exported function, including small helpers … and React components."
- Several scoped fragments show exported functions without return types in their `## Contract` blocks. For example, `registry/libraries/tanstack-query.md` (`todoOptions`, `Todo`, `useAddTodo`) and `registry/frameworks/nextjs-app-router.md` (`export default async function Page(...)`). An agent sees both the rule and an example that breaks it.
- Explicit return types on React components are contested in the React community, and Next.js docs omit them. `typescript-strict` is selected for every project with `strict: true`, and it takes about two-thirds of the always-on tokens.
- The v0.1 rule-effectiveness eval (`docs/evals/results-v0.1.md`) scored mostly missing return types. Changing that directive invalidates part of the recorded result (PRD §8.3).

## Decisions (owner, before starting)
1. **React components.** Choose one and record it under **Notes**:
   - **A — keep the rule** and fix every example to comply. The eval result stands.
   - **B — soften the rule** to "every exported function except React components and framework entry files (`page`, `layout`, route handlers)". Fix the non-component examples. Then re-run the eval cells affected by return-type items (T1, T3, T4) before release.
   Recommended: **B** if adoption matters more than the recorded eval; **A** if the eval must stay intact for 0.1.0.

## Scope
1. Apply the decision to `registry/languages/typescript-strict.md` (and to `typescript.md` if it states the same rule). Bump `version` (minor if the directive changes, patch if only the examples change).
2. **Audit every `## Contract` block** in `registry/**` against the active language directives:
   - no `any`;
   - no postfix `!`;
   - explicit return types where the rule requires them;
   - `import type` for type-only imports.
   Fix the examples. Fragments that apply when `typescript` (standard) is selected must still read naturally, so prefer explicit types that are correct under both.
3. **Heuristic registry check** (`src/registry/check.ts`): a **warning** for a single-line `export function` or `export default function` signature in a `ts`/`tsx` fence with no return type annotation, unless decision B exempts it. Document that the check is a heuristic and doesn't parse multi-line signatures.
4. Update target and e2e snapshots.
5. If decision B: add a line to `docs/release-checklist.md` step 1 saying the affected eval cells must be re-run and recorded before publishing.

## Out of scope
- Changing other `typescript-strict` directives (`satisfies`, exhaustive `never`), except to keep examples consistent.
- Re-running the eval itself (owner, manual).

## Implementation notes
- Follow `.cursor/rules/registry-content.mdc`. Changing examples doesn't need new `sources`, but update `verifiedAt` if you re-check the docs.
- Fragment line budgets still apply after adding return types.

## Acceptance criteria
- [x] Decision recorded under **Notes**. PRD §4.4 example updated if it shows a non-compliant snippet.
- [x] No registry `## Contract` block contradicts the language directive it ships with (manual audit list under **Notes**: fragment → changes).
- [x] `pnpm registry:check` reports 0 warnings on the bundled registry and flags a non-compliant fixture example.
- [x] Snapshots updated. Always-on token estimate for `next15-src` still within budget.
- [x] A human reviewed the content changes.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm registry:check
```

## Commit
`fix(registry): align fragment examples with typescript-strict`

## Notes
### Owner decision (2026-11-06)
- **B** — soften `typescript-strict`: exported functions need explicit return types except React components and framework entry files (`page`, `layout`, route handlers). Re-run eval cells T1, T3, T4 before release (checklist line added).
- PRD §4.4 Next.js `Page` example omits a return type; that is allowed under B, so the PRD snippet was left unchanged.

### Contract audit (fragment → changes)
- `languages/typescript-strict.md` → directive exception + version `1.1.0`; `verifiedAt` 2026-11-06; Contract already compliant.
- `languages/typescript.md` → `amount` return type `: number`; version `1.0.1`.
- `libraries/tanstack-query.md` → `todoOptions` / `useAddTodo` return types; `import type` for `UseMutationResult`; PascalCase `Todo` left exempt; version `1.0.1`.
- `libraries/react-hook-form-zod.md` → `parseProfile` return type; `ProfileForm` left exempt; version `1.0.1`.
- `frameworks/fastify.md` → `userRoutes`: `Promise<void>`; version `1.0.2`.
- Next.js / React Vite / shadcn / tailwind / zustand / atomic-design Contracts → PascalCase components or framework entries only; no edits.
- express / express-4 / layered / feature-based / flat / vitest / playwright → already compliant or no matching exports.
- Anti-pattern snippets intentionally omit return types; the check skips them after an anti-pattern marker.

### Registry check
- Heuristic warning for single-line `export function` / `export default function` without a return type in `ts`/`tsx` fences; exempts PascalCase and framework entry names; does not parse multi-line signatures.
- Bundled registry: `0 errors, 0 warnings`. Unit tests cover a non-compliant fixture example.

### Tokens
- `next15-src` always-on estimate ~854 (was ~830); still under the 1,500 budget.

### Human review
- Content changes reviewed by the owner on 2026-11-06 (Content Tasks checklist).
