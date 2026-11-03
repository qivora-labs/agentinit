# T40 · Terminal Output Guardrails

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M7 — UX polish | T34, T35, T36, T37, T38, T39 | — | §3.1 (terminal presentation) | M |

## Goal
Lock in the polished terminal experience with tests that drive the real CLI in a pseudo-terminal, and make every line fit the terminal width.

## Context
- Most UI tests use a fake prompter and a captured stream, so they never see what Clack draws. The UX review had to drive `dist/cli.js` in a pty with a terminal emulator to find wrapped hints, the tree leaking out of the rail, and uncolored diffs.
- At 72 columns, long hints and next-step lines wrap past the rail and lose the `│` prefix.

## Scope
1. **Width fitting** (`src/ui/display-text.ts`): a pure `fitToWidth(text, width, prefix)` that wraps at word boundaries and repeats the rail prefix on wrapped lines. Callers pass `process.stdout.columns` in from `main.ts` (default 80). Use it for notices, next steps, the token line, and report rows.
2. **Narrow terminals**: below 60 columns, `formatBanner` falls back to the text banner, and report rows drop the folder column.
3. **Pty harness** (`tests/helpers/pty.ts`): spawn `dist/cli.js` in a pseudo-terminal, send keys with a delay, and return the rendered screen as text with color codes removed. Pick a dev dependency for the pty and screen model (for example `node-pty` with `@xterm/headless`), and ask before adding it, per `AGENTS.md`. If no native dependency is acceptable, use `script(1)` on macOS and Linux and skip on Windows.
4. **Screen snapshots** (`tests/e2e/screens.test.ts`), each at 72 and 120 columns:
   - existing project (`next15-src`): start → detection card → review card → report
   - greenfield (`empty`): every wizard step and the next steps
   - conflict (`existing-claude-md`): diff note and question
   - up-to-date re-run
   - `doctor` healthy and with one issue
   - `NO_COLOR=1` and `TERM=dumb` variants of the existing-project report
5. **Line checks** in the same test: no rendered line is wider than the terminal, and every line between the first rail line and the closing `└` starts with a rail glyph or is part of a Clack box.
6. Run the screen tests in CI on Ubuntu and macOS. Skip on Windows unless the chosen pty works there.

## Out of scope
- New UI behavior. Any visual change found here goes back to the owning task's area as a fix, with a note in this file.

## Implementation notes
- Build before the screen tests (`pnpm build` in the test setup or a separate `pnpm test:screens` script).
- Wait for output to settle instead of using fixed sleeps where possible: poll until the screen stops changing for 150 ms.
- Copy fixtures to temp dirs; never run `init` in `tests/fixtures/`.

## Acceptance criteria
- [ ] `fitToWidth` unit tests cover word wrap, long words, color codes, and the rail prefix.
- [ ] Screen snapshots exist for every flow in scope at 72 and 120 columns.
- [ ] No line exceeds the terminal width in any snapshot.
- [ ] Every framed line starts with a rail glyph.
- [ ] Below 60 columns, the text banner is used.
- [ ] CI runs the screen tests on Ubuntu and macOS.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`test(ui): snapshot rendered terminal screens and fit output to width`

## Notes
