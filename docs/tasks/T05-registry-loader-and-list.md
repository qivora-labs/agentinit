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
- [x] Loading `registry-sample` returns all fragments in `order`/`id` order.
- [x] Each invalid case (wrong folder, file name ≠ id, duplicate id, dangling `requires`) is reported; multiple errors appear in one message.
- [x] `findPackageRoot` works when called from `src/` (tests) and from the built `dist/cli.js`.
- [x] `list`, `list --category library`, and `list --json` produce the expected output for `registry-sample`.
- [x] `node dist/cli.js list` against the real (empty) registry prints "No fragments available." and exits `0`.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
node dist/cli.js list
node dist/cli.js list --json
```

## Commit
`feat(registry): load bundled registry and add list command`

## Notes
- `registry/.gitkeep` keeps the empty bundled registry in git (`package.json` `files` includes `registry/`). A missing directory is also empty (`ENOENT`), so `list` exits 0 before the content tasks add markdown.
- `meta/**` is skipped before parsing, including nested files. v0.1 does not own that folder (PRD §4.2).
- A fragment path must be `<folder>/<id>.md`. The file name match is case-sensitive. Folders map as `architectures` → `architecture`, `languages` → `language`, `frameworks` → `framework`, `libraries` → `library`, `workflows` → `workflow`.
- Every problem is one `AgentInitError`. Paths are sorted. Within a file the order is parse or location, then duplicate id, then `requires`, `conflictsWith`, `compatibleWith`. Reference checks use every id that parsed, including a fragment that also failed a location check. Any error fails the load, so those fragments are not returned.
- `Registry.fragments` and `byId` are sorted by `order`, then `id`. `list` text and JSON group by category (`architecture`, `language`, `framework`, `library`, `workflow`), then `order`, then `id`. Text columns are aligned across the rows being shown, with a blank line between categories. Empty text output is `No fragments available.` Empty JSON output is `[]`. Both exit 0.
- `--category` is a `list` option, not a global flag. An unknown value lists those five categories. Surrounding whitespace is trimmed.
- JSON is written straight to stdout. With `--json`, the logger sends `info` to stderr, which would hide the payload.
- `findPackageRoot` skips a `package.json` whose `name` is not `@agentinit/cli`. Invalid JSON on that walk is an error. `defaultRegistryDir()` uses `import.meta.url` from `locate.ts`. The bundle keeps that call, and `node dist/cli.js list` resolves the package root from `dist/cli.js`.
- picomatch 4 ships no types. Importing `tinyglobby` pulls in fdir's default import of picomatch, so `src/picomatch.d.ts` declares that module. No dependency was added.
- The sample `zustand` fragment references `typescript-strict`, `layered`, and `nextjs-app-router` so an id that exists is not reported as missing. `conflictsWith: [layered]` is only for that check.
- The T03 list stub assertion is now a successful `list`. `init` and `doctor` are still stubs.
- A minor changeset records the command for the changelog. It does not publish.
