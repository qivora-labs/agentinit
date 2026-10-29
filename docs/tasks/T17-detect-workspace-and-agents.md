# T17 · Monorepo, Git Root & Existing Agent Files

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M3 — Detection | T03 | T18 | §3.3 (Existing agent files, Monorepo, Subdirectory), §3.5 | S |

## Goal
Detect monorepo roots, whether the CLI runs below the git root, and which agent configurations already exist.

## Scope
`src/detect/workspace.ts`:
- `isMonorepoRoot(root, pkgJson) → { isRoot: boolean; tool?: string }`: `pnpm-workspace.yaml`, `package.json` `workspaces`, `turbo.json`, `nx.json`, `lerna.json` in `root`.
- `findGitRoot(start) → string | null`: walks up for `.git` (directory **or** file, for worktrees and submodules).

`src/detect/existing-agents.ts`:
- `findExistingAgentFiles(root) → string[]`: POSIX paths that exist among `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.cursor/`, `.cursorrules`, `.windsurfrules`, `.windsurf/`, `.devin/`, `.github/copilot-instructions.md`, `.github/instructions/`.
- `preselectAgents(files) → AgentTarget[]`: `.cursor/` or `.cursorrules` → `cursor`; `CLAUDE.md` or `.claude/` → `claude`; `.windsurf/`, `.windsurfrules`, or `.devin/` → `windsurf`; `copilot-instructions.md` or `.github/instructions/` → `copilot`. Empty result means "all four" (applied by the caller, per PRD §3.5).
- `findLegacyFiles(root) → string[]`: `.cursorrules`, `.windsurfrules` (used for warnings and `doctor`).

## Out of scope
- Handling a monorepo beyond detection (v0.3).

## Acceptance criteria
- [x] Each monorepo marker is detected; a workspace **package** (no markers in its own folder) is not a root.
- [x] `findGitRoot` works with a `.git` directory and a `.git` file; returns `null` outside a repo.
- [x] Agent files and preselection mapping are covered for every agent, plus the empty case.
- [x] `AGENTS.md` alone preselects nothing (it's shared, not agent-specific).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): detect monorepos, git root, and existing agent files`

## Notes
- Tool ids are `pnpm`, `npm`, `turbo`, `nx`, and `lerna`. First match wins, in that order, so a pnpm workspace that also has `turbo.json` is reported as `pnpm`.
- `package.json` `workspaces` (a non-empty string array, or a non-empty `packages` array) is reported as `npm` (PRD §3.3). Yarn uses the same field, so it has no separate id. An empty array is not a root. Marker files must be files.
- Markers are checked only in the given directory. A package folder with none of them is not a root, even when its parent is.
- `lerna.json` is a monorepo marker in PRD §3.3. Tool id is `lerna`.
- `readPackageJson` (T14) does not copy `workspaces`. T18 must pass a `pkgJson` that includes the field, or extend the reader. Otherwise npm and yarn workspace roots are missed.
- `findGitRoot` returns `path.resolve`'d directory that contains `.git`. A `.git` file (worktree or submodule) returns that working tree, not the main repository named inside the file.
- `findExistingAgentFiles` returns the candidate POSIX literals in scan order. Directory candidates must be directories, so a file named `.cursor` is ignored.
- `preselectAgents` returns `[]` when nothing agent-specific matches, including `AGENTS.md` alone. The caller applies all four (PRD §3.5). Agents are returned once, in `cursor`, `claude`, `windsurf`, `copilot` order.
- `.devin/` preselects `windsurf` (PRD §3.3). Windsurf also ships as Devin Desktop (see T23). `.windsurf/` is the same. v0.1 still writes `.windsurf/`.
