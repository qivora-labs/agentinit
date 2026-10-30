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
- [x] `empty` (only `README.md`, `.git/`) → greenfield.
- [x] Folder with random files but no `package.json` → readable error.
- [x] `pnpm-monorepo` root → error with instructions; its package folder → existing.
- [x] `js-only` → `UnsupportedProjectError`.
- [x] `next15-src` → frameworks `['nextjs-app-router']`, `srcDir: 'src'`, correct package manager and scripts.
- [x] `next-app-and-pages` → both Next.js fragments.
- [x] `tailwind-v3` → no Tailwind fragment + `unsupported-version` notice.
- [x] `node-cli-ts` (TypeScript CLI, no web framework) → existing mode, `frameworks: []`, no error (PRD §3.6).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): orchestrate project detection into a profile draft`

## Notes
- Greenfield looks only at the directory's own entries. Ignorable names are `.git` (file or directory), `README.md`, `LICENSE`, `.gitignore`, `.editorconfig`, and a `.agentinit` directory. A file named `.agentinit` is not ignorable. An empty directory is greenfield. Anything else without `package.json` throws `No package.json found. Run inside a TypeScript project or an empty folder.` (exit 1). `.git` is created in the temp copy; committing a `.git` directory would nest a repository.
- The monorepo check runs before the TypeScript gate, so a JavaScript monorepo root gets the monorepo error. Message: `This directory is a monorepo root (${tool}). Run inside a single package.` Exit 1. A returned draft has `isMonorepo: false` because a root throws. v0.1 does not walk upward, so a package inside a monorepo is not flagged.
- `suggestedAgents` is the raw preselection. An empty list stays empty; T19 applies all four (PRD §3.5). `belowGitRoot` is only on the existing result: true when a git root exists and is not this directory. Greenfield returns `gitRoot` and `existingAgentFiles`.
- `draft.root` is `path.resolve` of the path that was passed in. Null resolved versions are omitted from `draft.packages` (`ProjectProfile.packages` is `Record<string, string>`) and are still passed to `suggestFragments`, which emits `unknown-version`.
- Next.js ids are filtered after `suggestFragments`. Notices are kept when a router directory is absent, so an unknown `next` version still reports both fragments even if only one router remains. `no-framework` is not emitted here; `resolveSelection` emits it when the selection is resolved.
- `next15-src` resolves `next` to `16.3.0` because `nextjs-app-router` `appliesTo` is `>=16.3.0`. Next 15 produces `unsupported-version` for that fragment and does not select it. The Pages fragment still matches `>=13` and is dropped when `pages/` is absent. The fixture name matches PRD §8.2.
- Warnings are `unresolved-tsconfig-extends` (the message the tsconfig reader already produces) and `legacy-agent-file`. Registry notices stay on `notices`. Marker candidates are the unique `detect.files` lists from rule fragments, in registry order.
