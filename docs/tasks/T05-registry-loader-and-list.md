# T05 · Registry Loader & `list` Command

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T04 | T08, T19 | §3.1, §4.2, §4.4 | M |

## Goal
Load and validate every fragment in the bundled registry, and implement `agentinit list`.

## Context
- PRD §4.2 explains how the registry directory is located at runtime (nearest `package.json` above the running module, then `registry/`).
- The real registry is empty until T09–T13; tests use a sample registry under `tests/fixtures/registry-sample/`.

## Scope
- `src/registry/locate.ts`: `findPackageRoot(fromUrl)` walks up from `import.meta.url` to the nearest `package.json` whose `name` is `@agentinit/cli`; `defaultRegistryDir()` joins `registry/`.
- `src/registry/load.ts`: `loadRegistry(dir = defaultRegistryDir()): Promise<Registry>`:
  - Finds `**/*.md` with `tinyglobby`, parses each with `parseFragment`.
  - Validates: folder matches category (`architectures/` → `architecture`, `languages/`, `frameworks/`, `libraries/`, `workflows/`; `meta/` is skipped in v0.1), file name equals `<id>.md`, ids are unique, and `requires`/`conflictsWith`/`compatibleWith` reference existing ids.
  - Collects **all** errors and throws one `AgentInitError` listing them, rather than stopping at the first.
  - Returns `Registry = { fragments: Fragment[]; byId: Map<string, Fragment>; byCategory(category): Fragment[] }`, sorted by `order` then `id`.
- `tests/fixtures/registry-sample/`: a small valid registry (one fragment per category) plus `registry-invalid/` cases.
- `src/commands/list.ts`:
  - Human output grouped by category: `id`, `name`, `description` (aligned columns).
  - `--category <name>` filters; unknown category → error listing valid ones.
  - `--json` prints `[{ id, name, category, version, description }]` to stdout.
  - Empty registry prints "No fragments available." and returns `0`.

## Out of scope
- Selecting fragments for a project (T06).
- Team fragments in `.agentinit/fragments/` (v0.2).

## Implementation notes
- Accept the registry directory as a parameter everywhere so tests never depend on the real `registry/`.
- Sort file paths before parsing so error order is deterministic across operating systems.

## Acceptance criteria
- [ ] Loading `registry-sample` returns all fragments in `order`/`id` order.
- [ ] Each invalid case (wrong folder, file name ≠ id, duplicate id, dangling `requires`) is reported; multiple errors appear in one message.
- [ ] `findPackageRoot` works when called from `src/` (tests) and from the built `dist/cli.js`.
- [ ] `list`, `list --category library`, and `list --json` produce the expected output for `registry-sample`.
- [ ] `node dist/cli.js list` against the real (empty) registry prints "No fragments available." and exits `0`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js list
node dist/cli.js list --json
```

## Commit
`feat(registry): load bundled registry and add list command`

## Notes
_Record decisions and discovered gaps here._
