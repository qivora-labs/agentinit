# ARCHITECTURE.md — `@agentinit/cli`

Where code belongs in this repository and which modules may depend on which. Hand-written; describes the planned v0.1 layout from [`docs/PRD.md`](docs/PRD.md) §4.

## Pipeline

```text
detect ──► resolve ──► plan ──► apply
(disk)     (pure)      (pure)   (disk)
```

`commands/` orchestrate the pipeline; `ui/` handles all interaction. `--dry-run` and `doctor` stop before `apply` writes anything.

## Folder Map

| Path | Responsibility | May touch disk | May prompt/print |
| :--- | :--- | :---: | :---: |
| `src/cli.ts` | Process entry: calls `run()`, sets exit code, listens for `SIGINT` | — | — |
| `src/interrupt.ts` | SIGINT flag. Defers exit while temp files exist so `apply` can delete them | — | — |
| `src/main.ts` | Argument parsing (`cac`), `RunContext`, error → exit code mapping | `stat` for `--cwd` | via `ui/` |
| `src/commands/` | One file per command; orchestration only | ✓ | via `ui/` |
| `src/detect/` | Read the project: packages, tsconfig, layout, workspaces, agent files | ✓ (read-only) | — |
| `src/registry/` | Fragment schema, parsing, loading (`load.ts`, `locate.ts`), resolution (`resolve.ts`), content checks (`check.ts`) | only `load.ts`, `locate.ts` | — |
| `src/plan/` | Placeholder rendering, token estimates, `buildPlan` | — | — |
| `src/targets/` | One adapter per output (`agents-md`, `architecture-md`, `cursor`, `claude`, `windsurf`, `copilot`) | — | — |
| `src/io/` | Hashing, manifest, managed blocks, change computation, apply | ✓ | — |
| `src/doctor/` | Pure drift checks used by `commands/doctor.ts` | — | — |
| `src/ui/` | Logger, `Prompter`, wizard, summary, formatting | — | ✓ |
| `src/types.ts`, `src/errors.ts`, `src/exit-codes.ts`, `src/context.ts` | Shared contracts | — | — |
| `src/compare-text.ts` | Code-unit string order shared by resolve, plan, targets, and the summary | — | — |
| `registry/` | Bundled rule and workflow fragments (content, not code) | — | — |
| `scripts/` | Repo tooling run with `tsx` (`check-registry.ts`, `smoke.ts`) | ✓ | ✓ |
| `tests/` | Unit tests mirroring `src/`, `tests/e2e/`, `tests/fixtures/` | ✓ (temp dirs) | — |
| `docs/` | PRD, task files, workflows, evals | — | — |

## Dependency Rules
- `commands/` → anything. Nothing imports from `commands/`.
- `ui/` → `types`, `errors`, `compare-text`, `registry` types, `detect` result types. `ui/` never touches disk.
- `plan/` and `targets/` → `types`, `registry` types, `plan/` helpers, `compare-text`. **Never** `detect/`, `io/`, `ui/`, `node:fs`, or `process`.
- `targets/*` adapters are independent of each other; shared helpers go in `plan/`.
- `io/` → `types`, `errors`, `ui/prompter` (interface only, for conflict questions).
- `detect/` → `types`, `errors`, `registry` (for `detect.files` candidates and `suggestFragments`).
- Pure modules receive time, randomness, and environment as parameters.

## Data Flow Types
- `detect/` produces a `DetectionResult` (greenfield, or a profile draft + notices).
- `ui/` (or `--yes` defaults) turns it into a `Selection`.
- `registry/resolve.ts` turns a `Selection` into ordered fragments + workflows + notices.
- `plan/` turns a `ProjectProfile` + fragments into `FileOp[]`.
- `io/` turns `FileOp[]` + manifest + disk state into `Change[]`, then applies them.

## Where New Things Go
- New agent output format → new file in `src/targets/`, registered in `plan/build-plan.ts`.
- New detection signal → new file in `src/detect/`, wired in `detect/index.ts`.
- New rule or workflow → a Markdown file in `registry/` (no code change).
- New command → `src/commands/<name>.ts`, registered in `src/main.ts`.

<!-- agentinit:begin id=architecture -->
# ARCHITECTURE.md

Describes the folders that exist today and the conventions for new code. Existing files stay where they are.

## Layout

None of the detected folders match a row in the architecture map.

## Other existing folders

These folders are already in the project:

- `src/commands`
- `src/detect`
- `src/doctor`
- `src/io`
- `src/plan`
- `src/registry`
- `src/targets`
- `src/ui`

## Conventions for new code

- **DEFAULT** to one folder per file type: `components/`, `hooks/`, `utils/`, and `types/` under `src/`.
- **ALWAYS** give a new file a single component, hook, or helper.
- **PREFER** `src/features/<feature>/` for new code once a type folder would mix a second domain.
- **NEVER** put a second domain into `components/`, `hooks/`, `utils/`, or `types/` to avoid a feature folder.
<!-- agentinit:end id=architecture -->
