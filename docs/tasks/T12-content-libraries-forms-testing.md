# T12 · Content: React Hook Form + Zod, Vitest, Playwright

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T08 | T29 | §3.2, §4.4, §5.3, §10 | M |

## Goal
Three library fragments for forms/validation and testing.

## Context
- Follow the **Content Tasks Checklist** in `docs/tasks/README.md`.
- `detect.packages` requires **all** listed packages, which matters for the combined forms fragment.
- Testing fragments should reference project commands through `{{scripts.test}}` placeholders so they adapt to the package manager.

## Scope
`registry/libraries/` (`category: library`, `order: 40`):

| File | `detect.packages` | `appliesTo` (verify) | Scope & globs (suggested) |
| :--- | :--- | :--- | :--- |
| `react-hook-form-zod.md` | `react-hook-form`, `zod`, `@hookform/resolvers` | `react-hook-form: ">=7"`, `zod: ">=4"` | `auto`: form component globs |
| `vitest.md` | `vitest` | `vitest: ">=3"` | `glob`: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx` |
| `playwright.md` | `@playwright/test` | `>=1.40` | `glob`: `e2e/**/*.ts`, `**/*.e2e.ts` (check common conventions) |

Topics to cover (verify each):
- **RHF + Zod:** one schema as the source of truth (`z.infer` for types), `zodResolver`, reuse the same schema on the server, accessible error messages, controlled vs. uncontrolled inputs.
- **Vitest:** test behavior not implementation, `describe`/`it` naming, `vi.mock` boundaries, fake timers, no snapshot overuse, run with `{{scripts.test}}`.
- **Playwright:** locators by role/label, web-first assertions, no fixed waits, isolated test data, page object usage only when it reduces duplication.

- `vitest` and `playwright` have **no** `compatibleWith`, so TypeScript projects without a framework (PRD §3.6) still get them; `react-hook-form-zod` sets `compatibleWith` to the React-based frameworks.

## Out of scope
- Jest support (not in v0.1).

## Acceptance criteria
- [ ] Three fragments exist and `pnpm registry:check` passes with no errors.
- [ ] Testing fragments use placeholders for commands, not hard-coded `npm test`.
- [ ] Content checklist complete; a human reviewed the content.

## Verify
```bash
pnpm registry:check
```

## Commit
`feat(registry): add forms, vitest, and playwright fragments`

## Notes
_Record decisions and discovered gaps here._
