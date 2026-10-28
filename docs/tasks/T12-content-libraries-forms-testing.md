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
- [x] Three fragments exist and `pnpm registry:check` passes with no errors.
- [x] Testing fragments use placeholders for commands, not hard-coded `npm test`.
- [ ] Content checklist complete; a human reviewed the content.

## Verify
```bash
pnpm registry:check
```

## Commit
`feat(registry): add forms, vitest, and playwright fragments`

## Notes
- `verifiedAt` is 2026-10-28. Directives were checked against the official pages listed in each fragment's `sources`.
- Scope: `react-hook-form-zod` is `auto` with `{{src}}**/forms/**` and `{{src}}**/*.form` globs. Form components are not in one fixed folder, and `auto` still loads when a new form file is created. `vitest` is `glob` on `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, and `**/*.spec.tsx`. Those globs have no `{{src}}` prefix: test files often live outside `src/`, and `**/*` already includes `src/` when a source root exists. `playwright` is `glob` on `e2e/**/*.ts`, `**/e2e/**/*.ts`, and `**/*.e2e.ts`. `**/e2e/**` also matches `tests/e2e/`. Playwright's default `**/*.spec.ts` is omitted because it is the same glob Vitest uses.
- `react-hook-form-zod` detects `react-hook-form`, `zod`, and `@hookform/resolvers` together. `appliesTo` is `react-hook-form: ">=7"` and `zod: ">=4"`. `@hookform/resolvers` has no range. Current releases checked on 2026-10-28: React Hook Form 7.91.0, `@hookform/resolvers` 6.0.2, Zod 4.6.7. `compatibleWith` is `nextjs-app-router`, `nextjs-pages-router`, and `react-vite`.
- Zod 4 customizes a check with `{ error: "..." }`. `{ message: "..." }` still parses and is deprecated, so the contract uses `error`. `z.infer` is the output type. A schema that uses `.default()` or `.transform()` needs `z.input` and `z.output` instead of one `useForm` generic. `zodResolver` maps issues to `formState.errors`. Native inputs use `register`. A `value`/`onChange` component uses `Controller` and does not also `register`. `defaultValues` keeps the first render controlled. A numeric input uses `valueAsNumber` or `z.coerce.number()`. The label, `aria-invalid`, `role="alert"`, and `aria-describedby` come from the React Hook Form accessibility pages. Server code calls `safeParse` or `parse` on the same schema.
- `vitest` stays `vitest: ">=3"`. Current release is 5.0.5. The v3 line is 3.2.7. `it` and `test` are aliases. `vi.mock` is hoisted above imports in the v3 mocking guide, so the call stays at the top level of the test file for the whole `>=3` range. Fake timers are `vi.useFakeTimers`, `vi.advanceTimersByTime` or `vi.runAllTimers`, then `vi.useRealTimers`. `toMatchSnapshot` is for a large stable structure, and a snapshot update is reviewed. The suite runs with `{{scripts.test}}`.
- `playwright` stays `@playwright/test: ">=1.40"`. Current release is 1.64.1. Locators are `getByRole` with an accessible name, or `getByLabel` for a control. Assertions are web-first (`toBeVisible`, `toHaveText`). `page.waitForTimeout` and `frame.waitForTimeout` are documented as debugging-only. Each test owns its page, storage, and records. A page object is for locators or steps that appear in more than one test. The suite runs with `{{scripts.test}}`. `vitest` and `playwright` have no `compatibleWith`.
- The shared content checklist was re-checked for these three fragments. The shared checklist's human-review box stays open until T13 re-checks the fragments it adds. This task's human-review acceptance box stays open until a person reviews the content.
