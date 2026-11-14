# T69 · Module System in JavaScript Rules

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M11 — JavaScript projects | T62 | T70 | §3.3, §4.4, §5.1 | S–M |

## Goal
A JavaScript project's always-on language rules state whether the project uses ES modules or CommonJS, so agents do not put `import` into a CommonJS package (or the reverse).

## Context
New for 0.2 (approved 2026-11-13); a slice of backlog P2.4. T60 already detects `package.json` `type`. That alone is wrong for Next.js and Vite: those projects write `import` in `.js` files without `"type": "module"` because the bundler handles it. Stating CommonJS for them would be harmful.

TypeScript projects keep today's language fragments unchanged (no new module-system line required for 0.2).

## Decisions (owner, before starting)
Record the answers under **Notes** and in the PRD.
1. **How the fact is derived.** Recommended: treat the module system as **ES modules** when a bundler framework is selected (`nextjs-app-router`, `nextjs-app-router-15`, `nextjs-pages-router`, `react-vite`, and any later bundler ids). Otherwise use `package.json` `"type": "module"` → ESM, else CommonJS. Alternative: sample a bounded number of source files (more accurate, slower, P2.4-sized).
2. **Placeholder name.** Recommended: `{{moduleSystem}}` (or `{{modules}}`) rendering a short phrase such as `ES modules` / `CommonJS` for use in the JavaScript language fragments. Unknown / unset → line drops via existing unresolvable-placeholder behavior (greenfield without a choice).
3. **Where it appears.** Recommended: only in `javascript` and `javascript-jsdoc` (T59) directive or boundary text. Not in TypeScript language fragments in 0.2.

## Scope
1. **Profile / selection context**: ensure plan receives the derived module-system fact (from detection + selected frameworks). Recompute on each run; do not store in the manifest.
2. **Placeholder** (`src/plan/placeholders.ts`): register the new known placeholder; document it in PRD §4.4.
3. **Fragments**: update the two JavaScript language fragments to use the placeholder in one clear directive or boundary sentence.
4. **`check-registry`**: accept the new placeholder as known.
5. Tests: Express-style package without `"type": "module"` → CommonJS line; Next.js / Vite selection → ESM line even without `"type": "module"`; TypeScript profile → no change to typescript / typescript-strict bodies.
6. PRD: brief note under §3.3 or §5.1; strike or annotate backlog P2.4 that this slice shipped in T69.
7. Changeset: `minor` (new always-on text for JS projects) or fold into the JavaScript minor.

## Out of scope
- Full project-conventions section (rest of P2.4).
- Import-style sampling (relative vs alias).
- Changing Node's actual `package.json` or running package managers.

## Implementation notes
- Plan stays pure: derive from profile fields + selection frameworks passed in, not from disk.
- Avoid contradicting Express/Fastify fragments; they may show `import` in TS examples while a CJS JS project gets CommonJS language guidance — that is intentional.
- Keep the always-on token budget in mind (≤ ~1,500).

## Acceptance criteria
- [ ] Decisions recorded under **Notes**, and the PRD / backlog P2.4 note updated.
- [ ] JavaScript + Express (no `"type": "module"`): language rules mention CommonJS.
- [ ] JavaScript + Next.js or React + Vite: language rules mention ES modules even without `"type": "module"`.
- [ ] TypeScript language fragment output unchanged.
- [ ] Unknown placeholder in greenfield drops the line without failing the plan.
- [ ] A changeset exists if shipping alone.

## Verify
```bash
pnpm registry:check
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`feat(plan): state module system in javascript language rules`

## Notes
Recommendations match the 2026-11-13 planning session. Confirm the bundler framework id list when new frameworks land.
