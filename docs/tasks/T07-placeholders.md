# T07 · Placeholder Rendering

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T04 | T08, T20 | §4.4 (Placeholders) | S |

## Goal
Render `{{src}}`, `{{pm}}`, and `{{scripts.<name>}}` in fragment bodies and globs, dropping lines whose placeholders can't be resolved.

## Context
- PRD §4.4 "Placeholders" paragraph defines the behavior, including the Bun special case.
- Pure module.

## Scope
`src/plan/placeholders.ts`:
- `PlaceholderContext = { src: '' | 'src/'; pm: PackageManager | null; scripts: Record<string, string> }` (script names that exist in `package.json`).
- `scriptCommand(pm, name)`: `npm run <name>`, `pnpm <name>`, `yarn <name>`, `bun run <name>`.
- `renderBody(text, ctx) → string`:
  - Replaces resolvable placeholders.
  - Drops any line containing an unresolvable `{{scripts.x}}` (script missing) or `{{pm}}` (when `pm` is `null`).
  - Drops a Markdown heading whose section became empty after dropping lines.
  - Leaves fenced code blocks' structure intact (never drops a fence line alone).
  - Unknown placeholder name (e.g., `{{foo}}`) → `AgentInitError`.
- `renderGlobs(globs, ctx) → string[]`: replaces `{{src}}`, collapses duplicate slashes, removes duplicates, keeps order.
- `findPlaceholders(text) → string[]` (used by T08 to validate fragments).

## Out of scope
- Deciding which scripts exist (T14).

## Acceptance criteria
- [ ] `{{src}}app/**/*.tsx` → `src/app/**/*.tsx` or `app/**/*.tsx`.
- [ ] `{{scripts.test}}` renders correctly for all four package managers (Bun uses `bun run test`).
- [ ] A list item using a missing script is dropped; a heading left empty is dropped; other content is untouched.
- [ ] With `pm: null`, every line using `{{pm}}` or `{{scripts.*}}` is dropped.
- [ ] `{{unknown}}` throws with the placeholder name in the message.
- [ ] Rendering is idempotent: rendering already-rendered text changes nothing.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(plan): render fragment placeholders`

## Notes
_Record decisions and discovered gaps here._
