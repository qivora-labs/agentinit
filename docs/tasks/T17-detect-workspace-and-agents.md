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
- [ ] Each monorepo marker is detected; a workspace **package** (no markers in its own folder) is not a root.
- [ ] `findGitRoot` works with a `.git` directory and a `.git` file; returns `null` outside a repo.
- [ ] Agent files and preselection mapping are covered for every agent, plus the empty case.
- [ ] `AGENTS.md` alone preselects nothing (it's shared, not agent-specific).

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(detect): detect monorepos, git root, and existing agent files`

## Notes
_Record decisions and discovered gaps here._
