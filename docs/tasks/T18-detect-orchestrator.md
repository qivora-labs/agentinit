# T18 · Detection Orchestrator

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M3 — Detection | T06, T14, T15, T16, T17 | T19, T28 | §3.2 (trigger), §3.3, §4.1, §4.3 | M |

## Goal
One function that inspects a directory and returns either "greenfield" or a fully detected project profile draft with notices.

## Context
- PRD §3.2 defines the greenfield trigger (ignorable files list includes `.agentinit/`).
- PRD §3.3 defines the order of checks and their failure modes.

## Scope
`src/detect/index.ts`:
- `detectProject(root, registry) → DetectionResult`:
  - **Greenfield:** no `package.json` and only ignorable entries → `{ mode: 'greenfield', gitRoot, existingAgentFiles }`.
  - No `package.json` but other files present → `AgentInitError` ("No package.json found. Run inside a TypeScript project or an empty folder.").
  - **Existing:**
    1. Monorepo root → `AgentInitError` with instructions (exit `1`).
    2. TypeScript gate.
    3. Packages, package manager, scripts, marker files (`detect.files` candidates from the registry).
    4. `tsconfig` → suggested language.
    5. Layout, folders, architecture inference.
    6. Existing agent files, legacy files, preselected agents, git root (`belowGitRoot` flag).
    7. `suggestFragments` → frameworks and libraries; Next.js fragments filtered by detected routers (App → `nextjs-app-router`, Pages → `nextjs-pages-router`, both → both).
  - Returns `{ mode: 'existing', draft: Omit<ProjectProfile, 'agents'> & { suggestedAgents }, notices, warnings }`.
- Notices/warnings are structured (discriminated union), not strings; T19 formats them.

## Out of scope
- Prompts and `--yes` defaults (T19).
- Reading the manifest / re-run logic (T27).

## Acceptance criteria
End-to-end detection tests on fixtures (create minimal ones; T29 completes the full set):
- [ ] `empty` (only `README.md`, `.git/`) → greenfield.
- [ ] Folder with random files but no `package.json` → readable error.
- [ ] `pnpm-monorepo` root → error with instructions; its package folder → existing.
- [ ] `js-only` → `UnsupportedProjectError`.
- [ ] `next15-src` → frameworks `['nextjs-app-router']`, `srcDir: 'src'`, correct package manager and scripts.
- [ ] `next-app-and-pages` → both Next.js fragments.
- [ ] `tailwind-v3` → no Tailwind fragment + `unsupported-version` notice.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): orchestrate project detection into a profile draft`

## Notes
_Record decisions and discovered gaps here._
