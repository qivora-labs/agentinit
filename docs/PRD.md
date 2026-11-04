# `@agentinit/cli` — Product Requirements & Architecture

> **One-Line Pitch:** An open-source, zero-config CLI (`npx @agentinit/cli`) that detects your TypeScript project's stack and generates scoped, version-aware AI coding agent rules, slash-command workflows, and an `ARCHITECTURE.md` for Cursor, Claude Code, Windsurf, and GitHub Copilot — then checks that they stay in sync with your project.

---

## 1. Executive Summary

### 1.1 The Problem
Modern software engineering relies heavily on AI coding agents (Cursor, Claude Code, Windsurf, GitHub Copilot, Codex). However:
1. **Context Drift:** Agents lack architectural memory on new or existing projects, leading to inconsistent patterns, leaky abstractions, and deprecated syntax for the project's actual library versions.
2. **Rule Fatigue:** Developers repeatedly rewrite or copy-paste `AGENTS.md`, `CLAUDE.md`, and Cursor rules across projects, and keep each tool's format in sync by hand.
3. **Prompt Blindness:** Many developers don't know how to write structured, token-efficient rules or workflow prompts that agents reliably follow.
4. **Context Bloat:** A single 1,500-line rule file, or the same rules duplicated across several tool-specific files, overwhelms the agent's context window and gets critical constraints ignored.
5. **Silent Rot:** Rules are written once and never updated. After a library upgrade or a new dependency, agents follow outdated guidance and nobody notices.

### 1.2 The Solution
A fast CLI that acts as **ESLint + Prettier for AI coding agent rules**: it generates correct rules (`init`) and checks they stay correct (`doctor`).
- **100% CLI & open source:** no web dashboard, sign-ups, API keys, token costs, or telemetry.
- **Smart detection:** reads `package.json`, installed versions, lockfiles, `tsconfig.json`, and folder layout, or guides empty repositories through a short wizard.
- **Curated registry:** stitches reviewed, version-aware Markdown fragments into tool-native configuration.
- **Write once, no duplication:** always-on rules are written once to `AGENTS.md`; scoped rules go to each tool's native scoped format.
- **Safe and repeatable:** never overwrites user-written content; re-running is idempotent; `doctor` detects drift and fails CI.

### 1.3 Target Users

| Persona | Situation | What they need | v0.1 priority |
| :--- | :--- | :--- | :--- |
| **Solo developer** | Building a TypeScript web app with one or two agents | Good rules in under a minute, without learning each tool's format | Primary |
| **Tech lead** (team of 3–15) | Team members use different agents in the same repo | One consistent, committed rule set; CI check that it stays current | Primary |
| **Open-source maintainer** | Contributors arrive with their own agents | Contributors' agents follow project conventions | Secondary |

### 1.4 Key Use Cases
- **UC1 — Existing repo:** run `npx @agentinit/cli` in a Next.js repo, confirm the detected stack, get rules for every agent the team uses.
- **UC2 — New project:** run it in an empty folder, answer a short wizard, get rules + `ARCHITECTURE.md`, scaffold the app, re-run to refine.
- **UC3 — Mixed-agent team:** one command writes Cursor, Claude Code, Windsurf, and Copilot files with no duplicated content.
- **UC4 — Keep rules current:** after adding a library, re-run `init`; in CI, `doctor` fails when rules drift from `package.json`.
- **UC5 — Try and leave:** remove everything AgentInit generated with one command (v0.2), leaving user content intact.

### 1.5 Positioning
- An unrelated unscoped `agentinit` npm package exists in the same space. Docs and the README always show the scoped command (`npx @agentinit/cli`).
- Other tools already compile one rule source to many agents (e.g., `ruler`, `rulesync`). Our differentiation is the **curated, version-aware registry + auto-detection + workflows + `ARCHITECTURE.md` + drift detection**, not multi-agent compilation alone.

### 1.6 Non-Goals
- Generating application code or installing project dependencies.
- Creating folders, moving files, or running framework generators (`create-next-app`, `create vite`).
- Calling any LLM or remote API at runtime.
- Supporting JavaScript-only, Python, Go, or mobile projects in v0.1 (see roadmap).

### 1.7 Terminology
- **Fragment:** one Markdown rule or workflow file in `registry/`, with YAML frontmatter.
- **Target:** an agent output adapter (Cursor, Claude Code, Windsurf, Copilot). `AGENTS.md` is always written and is not a selectable target.
- **Profile:** the detected (or wizard-provided) description of a project.
- **Managed block:** a marked section inside a shared file that AgentInit owns.
- **Manifest:** `.agentinit/manifest.json`, the record of selections and generated content.

---

## 2. Core Product Pillars

| Pillar | Name | Description | Output Artifact(s) |
| :--- | :--- | :--- | :--- |
| **1** | **Scoped Micro-Rules Engine** | Compiles modular rules so agents only load relevant context. Always-on content is written once. | `AGENTS.md`, `.cursor/rules/*.mdc`, `.claude/rules/*.md`, `.windsurf/rules/*.md`, `.github/instructions/*.instructions.md` |
| **2** | **Pre-Built Workflows** | Generates structured slash commands (§5.5) so developers can trigger senior-level workflows without writing prompts. | `.cursor/commands/*.md`, `.claude/skills/*/SKILL.md`, `.windsurf/workflows/*.md`, `.github/prompts/*.prompt.md` |
| **3** | **Architecture Map** | Describes the project's **current** layout, what belongs where, and allowed dependency directions. Target conventions apply to new code only. No folders are created or moved. | `ARCHITECTURE.md` |
| **4** | **Composable Fragment Registry** | Atomic, version-aware Markdown fragments with validated frontmatter and cited sources, bundled in the npm package and contributed via PRs. | Internal `registry/**/*.md` |
| **5** | **Zero-API Customizer** *(v0.2)* | A slash command that uses the developer's own IDE agent to interview them about business logic and write domain rules into a managed section. | `/agentinit-customize` in every target |
| **6** | **Safe Lifecycle & Drift Detection** | Managed blocks, a manifest with content hashes, idempotent re-runs, and a read-only `doctor` check (v0.1); `add` / `remove` / `update` in v0.2. | `.agentinit/manifest.json` |

---

## 3. User Experience & CLI Workflows

### 3.1 Command Interface
```bash
# Default interactive mode (detects existing vs. empty repo; re-syncs if already initialized)
npx @agentinit/cli
npx @agentinit/cli init

# Non-interactive mode (detected defaults, never prompts, never overwrites user content)
npx @agentinit/cli init --yes

# Preview the files that would be written, with diffs, without touching disk
npx @agentinit/cli init --dry-run

# Target specific agents
npx @agentinit/cli init --agents cursor,claude

# Check that generated rules match the project (read-only; exit 2 on issues)
npx @agentinit/cli doctor

# Browse available fragments
npx @agentinit/cli list
npx @agentinit/cli list --category library

# Lifecycle (v0.2)
npx @agentinit/cli add zustand tanstack-query
npx @agentinit/cli remove zustand
npx @agentinit/cli remove --all
npx @agentinit/cli update
```

**Global flags**

| Flag | Behavior |
| :--- | :--- |
| `--yes`, `-y` | Never prompt; use the defaults in §3.5. Required when stdin is not a TTY. |
| `--dry-run` | Print the planned file tree and diffs for files that already exist; write nothing. New files are listed, not diffed. |
| `--agents <list>` | Comma-separated subset of `cursor,claude,windsurf,copilot`. `AGENTS.md` is always written. |
| `--cwd <path>` | Run against another directory. |
| `--force` | Replace unmanaged and edited files after backing them up (§6.4). |
| `--json` | Machine-readable output (for `init`, `list`, `doctor`, and `--dry-run`). |

**Exit codes:** `0` success · `1` error (including unsupported project) · `2` `doctor` found issues · `130` cancelled by the user.

**Terminal presentation.** On a Unicode TTY, `init` always opens (first run and every re-run) with a blank gap, then a gray tracked "Qivora Labs" kicker, then the Needle block wordmark: AGENT in the terminal foreground, INIT in cyan, then the tagline "rules for the agents in this repo". A terminal without Unicode, or narrower than 60 columns, prints `Qivora Labs` above `AGENT  INIT` in those same two colors. `list` and `doctor` open with a one-line header instead (the product name in the terminal foreground, then the command name in gray), because they are run often. Status lines use icons, and the session closes with a bottom rule. Interactive `init` uses the existing Clack spinner while it reads the project and while it writes or previews rules, and skips the spinner when a conflict prompt is about to take the terminal. `--help` on a TTY prints the wordmark above the help text and does not print a closing rule.

On a TTY, the `init` report groups written files by agent (count and folder per agent, shared files by name) instead of printing every path. The full file tree is printed by `--dry-run`, by the review step's "Preview changes" (§3.2 step 6, §3.3 step 6), and on a stream that is not a TTY. Text inside the Clack frame fits the terminal width: prompt hints are kept short and long lines wrap under the rail instead of past it.

`--json`, `--version`, and a stream that is not a TTY stay plain: no wordmark, no icons, and no color. `--version` prints only the version. A closing line that only exists as chrome (such as "Rules written.") is omitted from pipes. `NO_COLOR` and `TERM=dumb` disable color. Generated files are never styled. The palette is cyan for INIT, the diamond, and info; AGENT uses the terminal foreground. Green is success, yellow is warnings, and red is errors. This uses `@clack/prompts` and `picocolors` only.

### 3.2 Flow A: Empty / Greenfield Project
Triggered when the directory contains no `package.json` and nothing other than ignorable files (`.git`, `README.md`, `LICENSE`, `.gitignore`, `.editorconfig`, `.agentinit/`).

1. **Framework** (single list, grouped by type):
   - *Web frontend:* React (Vite)
   - *Full-stack web:* Next.js (App Router), Next.js (Pages Router)
   - *Backend / API:* Node.js + Express, Node.js + Fastify
   - *Other:* Other TypeScript project (library, CLI, scripts) — no framework rules; base rules only (§3.6)
2. **TypeScript Strictness:** `Strict (strict compiler options, no any)` — *recommended* · `Standard`
3. **Libraries** (multi-select, filtered by framework compatibility):
   - *State & Data:* Zustand, TanStack Query
   - *Styling & UI:* Tailwind CSS v4, shadcn/ui
   - *Forms & Validation:* React Hook Form + Zod
   - *Testing:* Vitest, Playwright
4. **Architecture:** `Feature-Based` (`src/features/<domain>`) — *recommended* · `Layered / Clean` · `Atomic Design` · `Flat / Minimal`
5. **Target Agents** (multi-select, all pre-selected): Cursor · Claude Code · Windsurf · GitHub Copilot. Each option's hint names the folder it writes.
6. **Review & Write:** before anything is written, a review card shows the file count per agent, the shared files, the always-on token estimate against its budget, and how many existing files will need a decision (§6.3). Options: *Write files* (default) · *Preview changes* (prints the dry-run output, then returns to the card) · *Change setup* (runs steps 1–5 again with the current answers preselected). Then it writes rules + `ARCHITECTURE.md`. The project-commands section of `AGENTS.md` is omitted because no `package.json` exists yet.
7. **Next step hint:** prints the matching generator command (e.g., `pnpm create next-app@latest`) and recommends re-running `npx @agentinit/cli` after scaffolding (§3.4). For "Other TypeScript project", it only recommends re-running after creating `package.json`. The generator command is highlighted as a command, not printed as a plain status line.

The wizard opens with one line saying that no `package.json` was found and a new project is being set up. Each question shows its position (for example, "2 of 5"); the count drops by one when the library step is skipped or `--agents` skips the agent step.

> Some framework generators refuse to run in a non-empty directory. The hint tells users to scaffold first when possible, or to scaffold into a subfolder and move files.

Greenfield mode requires interactive input: with `--yes` it exits with code `1` and asks the user to run interactively.

### 3.3 Flow B: Existing Project (Auto-Detection)
Triggered when `package.json` exists in the target directory.

**Monorepo root (checked first):** a root is `pnpm-workspace.yaml` (pnpm), a non-empty `package.json` `workspaces` field (npm; Yarn uses the same field and has no separate id), `turbo.json` (Turborepo), `nx.json` (Nx), or `lerna.json` (Lerna). v0.1 prints *"This directory is a monorepo root (pnpm). Run inside a single package."* (the parentheses hold `pnpm`, `npm`, `turbo`, `nx`, or `lerna`) and exits with code `1`, before the TypeScript gate. A JavaScript monorepo root gets this message.

1. **TypeScript Gate:** the project must have `tsconfig.json` or a `typescript` dependency. Otherwise the CLI prints *"JavaScript projects aren't supported yet"* and exits with code `1`, writing nothing.
2. **Repository Scan:**
   - **Packages:** resolves real versions from `node_modules/<pkg>/package.json`, then the lockfile, then the semver range in `package.json` (handles `^`, `~`, `workspace:*`, `catalog:`, `npm:` aliases).
   - **Marker files:** detects tools that aren't npm packages (e.g., shadcn/ui via `components.json`).
   - **Package manager:** `packageManager` field, then lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `package-lock.json`).
   - **Scripts:** only scripts that actually exist (`build`, `dev`, `lint`, `test`, `typecheck`) are documented, using the detected package manager.
   - **TypeScript:** parses `tsconfig.json` as JSONC, resolves `extends`, reads `strict` (suggests `typescript-strict` when `true`) and `paths` aliases.
   - **Layout:** `src/` vs. root; Next.js `app/` and/or `pages/` (both fragments are selected when both exist); architecture inference with a confidence score.
   - **Existing agent files:** `AGENTS.md`, `CLAUDE.md`, `.cursor/`, `.cursorrules`, `.claude/`, `.windsurfrules`, `.windsurf/`, `.devin/`, `.github/copilot-instructions.md`, `.github/instructions/`. `.devin/` is Windsurf's directory in Devin Desktop and preselects `windsurf`, the same as `.windsurf/` and `.windsurfrules`. v0.1 still writes `.windsurf/` (§5.2).
   - **Subdirectory:** if run below the git root, notes it and offers to use the git root instead.
3. **Version Check:** a detected package whose version is outside every fragment's `appliesTo` range (e.g., Tailwind v3 when only a v4 fragment exists) is skipped with a notice: *"tailwindcss@3 detected — no matching rules yet."*
   - No supported framework detected (e.g., a CLI, library, or an unsupported framework) → continue with base rules (§3.6).
4. **Summary Confirmation:** a formatted box showing the detected stack, package manager, layout, and architecture. Labels are aligned in one column and values in another. Each framework or library shows the version of the package it was detected from; other package versions are not listed. Architecture confidence is shown in words (*likely* at ≥ 0.7); the number is shown only below 0.7, next to the question it triggers.
   - *"Use this configuration, or customize?"*
   - Low-confidence architecture (< 0.7) prompts instead of guessing.
5. **Agent Selection:** multi-select, pre-selecting agents whose config already exists (all four if none).
6. **Review:** the same review card as §3.2 step 6. *Change setup* goes to the customize prompts, then agent selection.
7. **Conflict Resolution:** per existing unmanaged file (§6.3).
8. **Write & Report:** writes files, then prints the report (grouped by agent on a TTY, §3.1), the always-on token estimate against its budget, and next steps: review the changes with `git diff`, try a workflow such as `/new-feature`, and run `npx @agentinit/cli doctor` to check for drift. Next steps for an existing project are TTY-only chrome.

### 3.4 Re-Running `init`
`init` is idempotent and is the update path in v0.1.
- When a manifest exists, its selections become the defaults. The CLI re-detects the project and lists framework and library ids that were added or removed. Layout is included when a greenfield manifest meets a new `package.json`. The manifest does not store package versions, so a version change is left out of that list. Unsupported-version notices and legacy-file warnings are included in the same summary.
- Content is regenerated under the safe-write rules in §6. If nothing changed, nothing is written and the CLI prints *"Already up to date."* Those notices and warnings are still printed.
- Interactive re-run: when the saved selections still match detection and no file would change, the CLI says so first (*"Already up to date"* with the file and agent counts), then asks *Done* (default) · *Change setup*. It does not ask "Use this configuration, or customize?" in that case.
- A greenfield manifest followed by a scaffolded project switches to existing mode automatically, keeping the chosen architecture and agents, and adds the project-commands section.

### 3.5 Non-Interactive Defaults (`--yes`)
Every prompt has a defined non-interactive answer:

| Prompt | Default with `--yes` |
| :--- | :--- |
| Greenfield wizard | Exit `1`: interactive input required |
| JavaScript-only project | Exit `1` |
| Monorepo root | Exit `1` with instructions to run inside a package |
| Below the git root | Stay in the current directory |
| Use detected configuration | Yes |
| Low-confidence architecture | `flat` (makes the fewest structural claims), with a notice |
| Agent selection | Agents whose config already exists; all four if none |
| Review before writing | Skipped; files are written directly |
| Already up to date: Done or Change setup | Done |
| Existing unmanaged shared file | Adopt (§6.3) |
| Existing unmanaged non-shared file | Skip and report |
| Managed content edited by hand | Skip and report |

`conflictsWith` checks apply only to manual selections. Detected packages are always honored, even if their fragments normally conflict (a project really using Jest and Vitest gets both).

### 3.6 Projects Without a Supported Framework
TypeScript libraries, CLIs, scripts, and projects using a framework the registry doesn't cover yet are **supported with base rules**:
- Generated: architecture, language, compatible libraries, workflows, `ARCHITECTURE.md`, and project commands.
- Libraries with `compatibleWith` are dropped (they target specific frameworks); libraries without it (e.g., Vitest) are kept.
- The summary shows *"Framework: none detected"* and a notice: *"No framework rules matched; generating base rules."* With `--yes`, this is not an error.
- `doctor` doesn't report a missing framework as an issue.

---

## 4. Technical Architecture

### 4.1 Pipeline
**detect → resolve → plan → apply**

- `detect` builds a `ProjectProfile` from disk (or from wizard answers).
- `resolve` selects registry fragments for that profile (compatibility, `appliesTo`, requires/conflicts).
- `plan` turns fragments into a list of `FileOp`s per target. **Pure and snapshot-tested.**
- `apply` is the only step that touches disk: diff, conflict prompts, atomic writes, backups, manifest update. `--dry-run` stops before `apply`; `doctor` compares the plan with disk and never writes.

### 4.2 Repository Structure
```text
@agentinit/cli/
├── src/
│   ├── cli.ts                       # Entry: argument parsing (cac) & command routing
│   ├── commands/
│   │   ├── init.ts
│   │   ├── list.ts
│   │   ├── doctor.ts
│   │   ├── add.ts                   # v0.2
│   │   ├── remove.ts                # v0.2
│   │   └── update.ts                # v0.2
│   ├── detect/
│   │   ├── index.ts                 # Orchestrator → ProjectProfile
│   │   ├── typescript-gate.ts
│   │   ├── packages.ts              # Installed versions, lockfile, package manager, scripts, marker files
│   │   ├── tsconfig.ts              # JSONC + extends (get-tsconfig)
│   │   ├── layout.ts                # srcDir, app/pages, architecture + confidence
│   │   ├── workspace.ts             # Monorepo detection
│   │   └── existing-agents.ts
│   ├── registry/
│   │   ├── schema.ts                # zod schema for frontmatter
│   │   ├── load.ts                  # Bundled registry (+ team fragments in v0.2)
│   │   └── resolve.ts               # Compatibility, appliesTo, requires/conflicts
│   ├── plan/
│   │   ├── build-plan.ts            # Fragments → FileOp[]
│   │   └── placeholders.ts          # {{src}}, {{pm}}, {{scripts.*}}
│   ├── targets/                     # One adapter per output; pure functions
│   │   ├── agents-md.ts
│   │   ├── cursor.ts
│   │   ├── claude.ts
│   │   ├── windsurf.ts
│   │   ├── copilot.ts
│   │   └── architecture-md.ts
│   ├── io/
│   │   ├── manifest.ts              # .agentinit/manifest.json + hashes
│   │   ├── managed-block.ts         # begin/end marker merge
│   │   └── apply.ts                 # Diff, conflicts, atomic write, backup
│   ├── ui/                          # @clack/prompts wizard, summary box, token report
│   └── types.ts
├── registry/                        # COMMUNITY CONTRIBUTION ZONE
│   ├── architectures/   feature-based.md · layered.md · atomic-design.md · flat.md
│   ├── languages/       typescript-strict.md · typescript.md
│   ├── frameworks/      nextjs-app-router.md · nextjs-pages-router.md · react-vite.md · express.md · fastify.md
│   ├── libraries/       tailwind.md · shadcn.md · tanstack-query.md · zustand.md · react-hook-form-zod.md · vitest.md · playwright.md
│   ├── workflows/       new-feature.md · review-arch.md · refactor.md · write-tests.md
│   └── meta/            customize.md (v0.2)
├── tests/
│   ├── fixtures/                    # Sample repos (§8)
│   └── *.test.ts
├── scripts/
│   └── check-registry.ts            # CI: schema, budgets, required sections, glob rules, freshness
├── docs/
│   └── PRD.md
├── .changeset/
├── .github/
│   ├── workflows/                   # ci.yml, release.yml
│   └── CODEOWNERS
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

**Runtime dependencies:** `@clack/prompts`, `picocolors`, `cac`, `zod`, `yaml`, `semver`, `get-tsconfig`, `tinyglobby`, `diff`.
**Tooling:** pnpm, TypeScript 6 (strict), tsdown, Vitest, ESLint + typescript-eslint, changesets, publint. Node `^22.18.0 || ^24.11.0 || >=26.0.0`.
TypeScript stays on `~6.0` until `typescript-eslint` supports TypeScript 7.

The bundled registry is resolved at runtime by locating the package root (the nearest `package.json` above the running module, found via `import.meta.url`) and joining `registry/`. This works from both `src/` (tests) and `dist/` (published), and is verified by a smoke test that installs the packed tarball.

**Tests:** unit tests live in `tests/<module>/*.test.ts` mirroring `src/`; end-to-end tests run the CLI against copies of `tests/fixtures/*`.

### 4.3 Core Types (`src/types.ts`)
```typescript
export type AgentTarget = 'cursor' | 'claude' | 'windsurf' | 'copilot';

export type Language = 'typescript-strict' | 'typescript';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type FragmentCategory = 'architecture' | 'language' | 'framework' | 'library' | 'workflow';

/** How a rule is activated; see the mapping in §5.3 */
export type FragmentScope = 'always' | 'glob' | 'auto' | 'manual';

export interface ProjectProfile {
  root: string;
  mode: 'existing' | 'greenfield';
  /** package.json `name`, or null when absent / greenfield */
  name: string | null;
  packageManager: PackageManager | null;   // null in greenfield mode
  srcDir: '' | 'src';
  language: Language;
  /** Package name → resolved version (e.g. { next: '15.3.1' }) */
  packages: Record<string, string>;
  scripts: Record<string, string>;
  frameworks: string[];                    // fragment ids; may be empty (§3.6); Next.js app + pages can coexist
  libraries: string[];                     // fragment ids
  architecture: { id: string; confidence: number };
  /** Existing folders under srcDir (depth ≤ 2), used for the descriptive ARCHITECTURE.md */
  folders: string[];
  agents: AgentTarget[];
  existingAgentFiles: string[];
  isMonorepo: boolean;
}

export interface FileOp {
  path: string;                            // POSIX, relative to root
  kind: 'file' | 'managed-block';
  blockId?: string;                        // for managed blocks
  content: string;
  target: AgentTarget | 'shared';
}
```

### 4.4 Registry Fragment Standard (`registry/**/*.md`)
Every rule fragment follows the **3-Part Rule Formula**:
1. **Boundary:** where the code lives and how modules interact.
2. **Directives:** imperative `ALWAYS` / `NEVER` / `PREFER` constraints, never vague suggestions.
3. **Contract:** a brief Good vs. Anti-Pattern snippet.

`check-registry` enforces the formula mechanically: every rule fragment contains at least one directive keyword (`ALWAYS`, `NEVER`, `PREFER`, `FORBID`, `DEFAULT`) and at least one fenced code block.

Architecture fragments additionally contain a `## Summary` section (≤ 10 lines, copied into `AGENTS.md`) and a `## Map` section (used for `ARCHITECTURE.md`). Workflow fragments follow the structure in §5.5.

**Frontmatter schema** (validated with zod at build time and in CI):

| Field | Required | Description |
| :--- | :--- | :--- |
| `id` | ✓ | Stable kebab-case id; never renamed once published |
| `name` | ✓ | Display name |
| `category` | ✓ | `architecture` · `language` · `framework` · `library` · `workflow` |
| `version` | ✓ | Fragment content version (semver) |
| `order` | ✓ | Sort order in shared files (10 arch, 20 lang, 30 framework, 40 library) |
| `description` | ✓ | One line; shown in pickers and used for description-based activation |
| `scope` | ✓ (rules) | `always` · `glob` · `auto` · `manual` (§5.3) |
| `globs` | if `glob`/`auto` | YAML list; `{{src}}` placeholder (`src/` or empty); **no brace patterns** like `{ts,tsx}`; **no commas** |
| `detect.packages` | | Package names that trigger auto-selection; **all** listed packages must be present |
| `detect.files` | | Marker files that trigger auto-selection (e.g., `components.json`); **all** listed files must exist |
| `appliesTo` | | Package → semver range, e.g. `{ next: ">=15" }` |
| `requires` | | Fragment ids auto-selected alongside this one (with a notice) |
| `conflictsWith` | | Fragment ids that can't be manually selected together (warn + ask) |
| `compatibleWith` | | Framework ids this library supports (wizard filtering) |
| `argumentHint` | workflows | Hint shown after the slash command (e.g. `<feature-name>`) |
| `sources` | ✓ | Official documentation URLs the guidance was checked against |
| `verifiedAt` | ✓ | Date (`YYYY-MM-DD`) the content was last verified against `sources` |

**Default scope by category:** architecture and language → `always`; framework and library → `glob` or `auto`; workflows have no scope.

**Placeholders** available in fragment bodies and globs: `{{src}}`, `{{pm}}` (package manager), `{{scripts.<name>}}` (full command, e.g. `pnpm test`; `bun run test` for Bun, because `bun test` runs Bun's own test runner). A line that references a missing script (or `{{pm}}` in greenfield mode) is dropped, and a heading left with no content is dropped too. Unknown placeholders are an error.

**Workflows** are always included; there is no per-workflow selection in v0.1.

Example (`registry/frameworks/nextjs-app-router.md`):
````markdown
---
id: nextjs-app-router
name: Next.js App Router
category: framework
version: 1.0.0
order: 30
description: React Server Components by default, strict client boundaries, and App Router data conventions.
scope: glob
globs:
  - "{{src}}app/**/*.ts"
  - "{{src}}app/**/*.tsx"
detect:
  packages: ["next"]
appliesTo:
  next: ">=15"
sources:
  - https://nextjs.org/docs/app
verifiedAt: 2026-10-17
---

## Next.js App Router Guardrails

### 1. Server vs. Client Component Boundaries
- **DEFAULT** to React Server Components. NEVER add `'use client'` to a page or layout file.
- **ISOLATE** interactivity: push `'use client'` down to the smallest leaf component.
- **NEVER** import server-only modules or secrets into files marked `'use client'`.

### 2. Data Fetching & Mutations
- **ALWAYS** fetch data in Server Components with `async/await` and shared data-access helpers.
- **NEVER** create internal route handlers (`app/api/*`) only to fetch data for a Server Component.
- **ALWAYS** validate Server Action inputs with Zod before mutating.

### 3. Contract
```tsx
// ✅ Good: server page, client leaf
export default async function Page() {
  const posts = await getPosts();
  return <PostList posts={posts} />; // PostList renders <LikeButton /> ('use client')
}

// ❌ Anti-pattern: whole page forced to the client
'use client';
export default function Page() { /* useEffect(() => fetch('/api/posts')) */ }
```
````

**Budgets:**
- Each fragment ≤ **120 lines** (~800 tokens).
- The always-on core in `AGENTS.md` should stay ≤ **~1,500 tokens**; the CLI reports the estimate and warns above it.
- Token estimate = `ceil(characters / 4)`; it's a guide, not an exact count.
- Windsurf rule files must stay below **12,000 characters** (enforced by the compiler).

---

## 5. Multi-Agent Compilation Strategy

### 5.1 Layered Output Model
Most agents read `AGENTS.md` **and** their own files. To avoid loading the same rules twice:

1. **Always-on core → `AGENTS.md` only.** Project commands, the architecture summary (with a link to `ARCHITECTURE.md`), language rules, and other `scope: always` fragments, sorted by `order`, with a short table of contents.
2. **Scoped fragments → each tool's native scoped format only.** Never copied into `AGENTS.md`.
3. **Tool entry files reference `AGENTS.md`** instead of duplicating it.
4. **Workflows → each tool's native slash-command format.**

### 5.2 Output Matrix

| Output | Always-on | Scoped rules | Workflows |
| :--- | :--- | :--- | :--- |
| **Shared** | `AGENTS.md` | — | — |
| **Cursor** | reads `AGENTS.md` | `.cursor/rules/agentinit-<id>.mdc` | `.cursor/commands/<id>.md` |
| **Claude Code** | `CLAUDE.md` → `@AGENTS.md` | `.claude/rules/agentinit-<id>.md` | `.claude/skills/<id>/SKILL.md` |
| **Windsurf** | reads `AGENTS.md` | `.windsurf/rules/agentinit-<id>.md` | `.windsurf/workflows/<id>.md` |
| **GitHub Copilot** | `.github/copilot-instructions.md` → `AGENTS.md` | `.github/instructions/agentinit-<id>.instructions.md` | `.github/prompts/<id>.prompt.md` |
| **Architecture** | `ARCHITECTURE.md` (linked from `AGENTS.md`) | — | — |

- **Rule files** use the `agentinit-` prefix and are fully managed.
- **Workflow files** use plain names so commands stay short (`/new-feature`). They are tracked by path and hash in the manifest; an existing file at the same path is a conflict handled by §6.3, never overwritten silently.

### 5.3 Scope Mapping per Agent

| Scope | Cursor | Claude Code | Windsurf | Copilot |
| :--- | :--- | :--- | :--- | :--- |
| `always` | `AGENTS.md` | `AGENTS.md` (via `@AGENTS.md`) | `AGENTS.md` | `AGENTS.md` (via pointer) |
| `glob` | `.mdc` with `globs` | rule with `paths` | `trigger: glob` | `applyTo` and `description` |
| `auto` | `.mdc` with `description`, no `globs` (agent decides) | rule with `paths` (glob fallback) | `trigger: model_decision` | `applyTo` and `description` |
| `manual` | `.mdc` with no `globs` or `description` (`@`-mention) | skill with `disable-model-invocation: true` (`/id`) | `trigger: manual` (`@`-mention) | prompt file `agentinit-<id>.prompt.md` |

`auto` exists because glob-scoped rules load only when the agent reads a matching file, so they can miss the moment a new file of that kind is created. Description-based activation covers that case where an agent supports it.

### 5.4 Per-Target Formats

**Cursor** — `globs` is serialized as a comma-separated string:
```markdown
---
description: React Server Components by default, strict client boundaries, and App Router data conventions.
globs: src/app/**/*.ts,src/app/**/*.tsx
alwaysApply: false
---
```

**Claude Code** — `CLAUDE.md` contains a managed block with `@AGENTS.md` plus Claude-specific notes. Scoped rules:
```markdown
---
paths:
  - "src/app/**/*.ts"
  - "src/app/**/*.tsx"
---
```
Workflows are skills (`.claude/skills/new-feature/SKILL.md`, invoked as `/new-feature`) with `name`, `description`, `argument-hint`, and `disable-model-invocation: true`, so workflows run only when the user invokes them.

**Windsurf** — root `AGENTS.md` is always-on in Windsurf; scoped rules use triggers:
```markdown
---
trigger: glob
globs: src/app/**/*.ts,src/app/**/*.tsx
---
```

**GitHub Copilot** — `.github/copilot-instructions.md` contains a managed block pointing to `AGENTS.md`. Scoped rules carry `description` and one quoted `applyTo` string. VS Code loads a file when `description` matches the task, and when `applyTo` matches a file being created or edited. GitHub.com path-specific instructions read `applyTo`. An `auto` rule whose globs do not render still writes `description` and omits `applyTo`. A `glob` rule with no rendered patterns is omitted. A workflow id `agentinit-<id>` together with a manual fragment `<id>` is a plan error: both would write `.github/prompts/agentinit-<id>.prompt.md`.
```markdown
---
description: React Server Components by default, strict client boundaries, and App Router data conventions.
applyTo: "src/app/**/*.ts,src/app/**/*.tsx"
---
```

**`ARCHITECTURE.md`** — **descriptive**: it documents the layout that exists today (detected folders mapped onto the chosen architecture's vocabulary), what belongs where, allowed dependency directions, and naming conventions. Target conventions are stated as rules for **new** code; it never instructs agents to move or restructure existing files unless the user asks. In greenfield mode it describes the planned layout.

**Minimum agent versions** that load each output are listed in the README and re-verified at every release; older versions silently ignore newer formats.

### 5.5 Workflow Specifications
Every workflow fragment has the sections **Purpose**, **Input**, **Steps**, **Output**, and **Guardrails**, and references project commands through placeholders (e.g. `{{scripts.test}}`).

| Workflow | Input | Steps | Output |
| :--- | :--- | :--- | :--- |
| `/new-feature` | `<feature-name>` + description | Read `AGENTS.md` and `ARCHITECTURE.md` → propose a file plan (paths, responsibilities) and **wait for confirmation** → implement following active rules → add tests if a test library is selected → run typecheck, lint, and tests | Summary of files created, decisions, and check results |
| `/review-arch` | optional `[path]` (default: uncommitted changes) | Read `ARCHITECTURE.md` and active rules → check boundaries, dependency directions, naming, and rule violations | Findings grouped by severity with `file:line` and a suggested fix. **Read-only.** |
| `/refactor` | `<target>` + goal | Confirm tests cover the target (write characterization tests first if not) → refactor in small steps → run checks after each step | Summary of changes; behavior and public API unchanged unless requested |
| `/write-tests` | `<target>` | Detect the test library from active rules → cover the happy path, edge cases, and error paths → never mock the unit under test → run tests | Tests written and their results |

---

## 6. Safe Writes & Lifecycle

### 6.1 Managed Blocks
Shared files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `ARCHITECTURE.md`) contain AgentInit content only inside markers:
```markdown
<!-- agentinit:begin id=core -->
...generated content...
<!-- agentinit:end id=core -->
```
Adopting or updating a block leaves every byte outside the markers unchanged. Backup & replace (§6.3) copies the original file to backups, then writes a fresh file; skipped or unchanged blocks from that file are kept.

### 6.2 Manifest (`.agentinit/manifest.json`, committed)
```json
{
  "cliVersion": "0.1.0",
  "mode": "existing",
  "selections": {
    "language": "typescript-strict",
    "frameworks": ["nextjs-app-router"],
    "libraries": ["tailwind", "zustand"],
    "architecture": "feature-based",
    "agents": ["cursor", "claude", "windsurf", "copilot"]
  },
  "fragments": { "nextjs-app-router": "1.0.0", "zustand": "1.0.0" },
  "files": {
    ".cursor/rules/agentinit-zustand.mdc": { "sha256": "…" },
    ".claude/skills/new-feature/SKILL.md": { "sha256": "…" },
    "AGENTS.md#core": { "sha256": "…" }
  }
}
```
- Hashes are computed on content with line endings normalized to LF, so Git's `autocrlf` doesn't make files look edited.
- Hash matches → safe to regenerate silently.
- Hash differs (user edited) → show the diff and ask; with `--yes`, skip and report.

### 6.3 Conflicts With Existing Files
For each existing file AgentInit wants to write that it doesn't already own:
- **Adopt** — keep the user's content and add the managed block (shared files only; the `--yes` default for them).
- **Backup & replace** — back up (§6.4), then write a fresh file. For a managed block, the file contains that block plus any skipped or unchanged blocks from the original.
- **Skip** — leave the file untouched (the `--yes` default for non-shared files, including same-named workflows).

Nothing is destroyed unless the user chooses it or passes `--force`. Legacy `.cursorrules` and `.windsurfrules` are never modified; the CLI warns that they still load alongside the new rules, once per run.

The conflict prompt names the file by its path (a managed block is "the agentinit section of `CLAUDE.md`", not a block id) and shows only the diff hunks, without `Index:`, `===`, `---`, or `+++` header lines. On a TTY, added lines are green, removed lines red, and hunk headers gray. The product is written "agentinit" in every message.

### 6.4 Write Guarantees
- All files are written to a temp path and renamed (atomic); Ctrl-C leaves no partial output.
- Backups go to `.agentinit/backups/<timestamp>/<original-path>`. AgentInit writes `.agentinit/.gitignore` containing `backups/`, so backups are never committed and the user's `.gitignore` is untouched.
- Globs always use forward slashes; existing line endings (LF/CRLF) are preserved when merging.
- Permission errors produce a readable message, not a stack trace.

### 6.5 `doctor` (v0.1, read-only)
Compares the manifest, the current project, and the files on disk. Never writes. Exits `2` when any issue is found, so it can run in CI:
- No manifest found (suggests `init`).
- A managed file or block is missing, or was edited by hand.
- A detected package has a matching fragment that isn't selected.
- A selected fragment's package was removed, or its version left the `appliesTo` range.
- The always-on core is over budget.
- Legacy rule files (`.cursorrules`, `.windsurfrules`) are still present.

Each issue includes the command that fixes it (usually re-running `init`). `--json` emits a machine-readable report. On a TTY, the report lists every check above with a pass or fail icon, including when there are no issues.

**Flag errors.** An unknown `--agents` value or `--category` name suggests the closest valid value (for example, *Unknown agent "cursr". Did you mean "cursor"?*).

### 6.6 Lifecycle Commands *(v0.2)*
- **`add <id...>` / `remove <id...>`:** update selections in the manifest and regenerate affected files. Unknown ids get fuzzy suggestions.
- **`remove --all`:** deletes every AgentInit-owned file and managed block, the manifest, and `.agentinit/`; user content is left intact. Edited files still prompt.
- **`update`:** non-interactive re-sync (equivalent to `init --yes` with a manifest) that also lists fragment version changes since the last run.

---

## 7. Phased Roadmap

### v0.1 — TypeScript web, every major agent (~5 weeks)

**M1 — Foundation (2 days)**
- [ ] `tsconfig.json` (strict), `tsdown.config.ts`, ESLint, Vitest, changesets, MIT `LICENSE`, `CODEOWNERS`, CI workflow.
- [ ] CLI skeleton with `cac`: `init`, `list`, `doctor`, global flags, exit codes, non-TTY handling.

**M2 — Registry (8 days)**
- [ ] zod schema, loader, resolver (compatibility, `appliesTo`, requires/conflicts), placeholders.
- [ ] `scripts/check-registry.ts` for CI: schema, 120-line budget, required sections, no brace globs, `verifiedAt` older than 6 months warns.
- [ ] Author and verify fragments against official docs: 4 architectures, 2 languages, 5 frameworks, 7 libraries, 4 workflows (§4.2, §5.5).

**M3 — Detection (3 days)**
- [ ] TypeScript gate, packages and versions, marker files, package manager, scripts, tsconfig (JSONC + extends).
- [ ] Layout and architecture inference with confidence; existing agent files; monorepo and git-root handling.
- [ ] Greenfield wizard and existing-project summary confirmation.

**M4 — Targets (4 days)**
- [ ] `AGENTS.md`, Cursor, Claude Code, Windsurf, GitHub Copilot, and `ARCHITECTURE.md` adapters with the scope mapping in §5.3.
- [ ] Token estimate and budget warnings.

**M5 — Safe IO & Doctor (3 days)**
- [ ] Managed blocks, manifest with normalized hashes, conflict prompts, diff preview, atomic writes, backups.
- [ ] Idempotent re-run (§3.4) and `doctor` (§6.5).

**M6 — Quality & Launch (4 days)**
- [ ] Snapshot tests per target over fixtures (§8); CI on Ubuntu, macOS, and Windows.
- [ ] Packed-tarball smoke test (`npm pack` → install → run).
- [ ] Rule-effectiveness check (§8.3) passes.
- [ ] `README.md` (demo GIF, generated tree, token report, minimum agent versions) and `CONTRIBUTING.md`.
- [ ] `.github/workflows/release.yml`: changesets release PRs, publish with provenance using the `NPM_TOKEN` secret.
- [ ] Dogfood: run `agentinit init` on this repository (hand-written content stays outside managed blocks) and run `agentinit doctor` in CI.
- [ ] Publish `@agentinit/cli@0.1.0`.

### v0.2 — Lifecycle
- `add`, `remove`, `remove --all`, `update`.
- Team fragments in `.agentinit/fragments/*.md`, compiled to every target alongside registry fragments.
- `/agentinit-customize` workflow (Pillar 5) writing into a managed `project-domain` block.
- Opt-in inline mode for Copilot surfaces that ignore `AGENTS.md`.

### v0.3 — Breadth
- Full monorepo support (per-package globs or nested `AGENTS.md`), with a `{{pkg}}` placeholder.
- More frameworks (Angular, Vue/Nuxt, NestJS, Expo, and a `node-library` fragment for TypeScript CLIs and libraries) and libraries (Redux Toolkit, Prisma, Drizzle, Tailwind v3).
- Gemini CLI target (`GEMINI.md` or `.gemini/settings.json` → `AGENTS.md`).
- Optional, opt-in folder scaffolding.

### v0.4+ — Ecosystem
- JavaScript projects (JSDoc rules).
- Python (`pyproject.toml`), Go (`go.mod`), Flutter (`pubspec.yaml`).
- Opt-in remote registries (`--registry <git-url>`, pinned to a commit and recorded in the manifest).
- Automated rule-effectiveness evaluation harness.

---

## 8. Quality Strategy

### 8.1 v0.1 Acceptance Criteria
Each criterion is covered by an automated test unless marked *(manual)*.

**Detection & gating**
- A JavaScript-only project exits `1` and writes nothing, with or without `--yes`.
- A monorepo root exits `1` with instructions; running inside a workspace package works.
- Versions are resolved from `node_modules` first; a `workspace:*` or `catalog:` specifier never crashes detection.
- A `tsconfig.json` with comments, trailing commas, and `extends` is parsed correctly.
- A project with both `app/` and `pages/` gets both Next.js fragments.
- A TypeScript project with no supported framework (e.g., a CLI) gets base rules and a notice, and exits `0` with `--yes`.
- An unsupported version (e.g., Tailwind v3) is skipped with a notice.

**Output**
- No rule text appears in more than one generated file (excluding pointers and imports).
- Every generated Cursor, Claude, Windsurf, and Copilot file matches its format in §5.4 and the scope mapping in §5.3.
- Globs resolve correctly for `src/` and root layouts and always use forward slashes.
- `AGENTS.md` lists only scripts that exist, using the detected package manager.

**Safety**
- Content outside managed blocks is byte-for-byte unchanged after `init`.
- Re-running `init` with no project changes writes nothing and prints "Already up to date."
- A hand-edited managed block is never overwritten with `--yes`.
- An existing same-named workflow file is never overwritten without confirmation or `--force`.
- Interrupting `init` (SIGINT) leaves no partial files.
- `--dry-run` writes nothing, including the manifest.

**Doctor**
- Exits `0` on a freshly initialized project and `2` after adding a supported package to `package.json`.
- Never modifies any file.

**Experience**
- *(manual)* Time from `npx @agentinit/cli` to written files on an existing project is under 60 seconds, excluding download time.

### 8.2 Fixture Repositories
`tests/fixtures/`, each minimal but realistic. Full generated trees, covering every target, are snapshotted for `next15-src`, `vite-react`, and `express-ts` under `tests/__snapshots__/e2e/`.

`next15-src` · `next-app-no-src` · `next-app-and-pages` · `vite-react` · `express-ts` · `fastify-ts` · `node-cli-ts` (no framework, base rules) · `js-only` (rejected) · `empty` · `pnpm-monorepo` (rejected at root) · `existing-claude-md` (adopt) · `existing-workflow-file` (conflict) · `edited-managed-block` (not overwritten) · `jsonc-tsconfig-extends` · `tailwind-v3` (skipped with notice) · `shadcn-components-json` · `crlf-line-endings`.

**Registry CI:** every PR touching `registry/` runs `check-registry` and regenerates snapshots so reviewers can see the effect on output.

### 8.3 Rule-Effectiveness Check (release gate)
Before each minor release, run 5 fixed tasks (e.g., "add a feature with a form and server action") in two agents on a fixture project, with and without generated rules. Record convention violations per run in `docs/evals/`. Ship only if the rules reduce violations in at least 4 of 5 tasks. This is manual in v0.1 and automated in v0.4+.

---

## 9. Distribution & Registry Policy

The registry is **bundled in the npm package** rather than fetched at runtime:
- Fragments and compilers are released together, so a CLI never receives fragments it can't parse.
- Output is reproducible for a given CLI version (recorded in the manifest).
- Works offline and in CI.
- Fragments are reviewed in PRs and published with npm provenance, with no runtime supply-chain path.

Rule fixes ship as patch releases via changesets. Team fragments (v0.2) and opt-in remote registries (v0.4+) provide extensibility.

---

## 10. Community Contribution Guidelines

`CONTRIBUTING.md` enforces:
1. **No CLI code required:** adding a library or framework means adding one `.md` file under `registry/` with valid frontmatter.
2. **Token budget:** each fragment stays under **120 lines** (~800 tokens).
3. **Actionable directives only:** imperative verbs (`ALWAYS`, `NEVER`, `PREFER`, `FORBID`); no textbook explanations.
4. **Version-aware and sourced:** set `appliesTo` when guidance depends on a major version; cite official docs in `sources` and set `verifiedAt`.
5. **Portable globs:** no brace patterns and no commas; use one glob per extension.
6. **Safety:** fragments must never instruct agents to run network commands, install packages, read secrets, or disable safeguards. `registry/` changes require CODEOWNERS review.
7. **Stable ids:** published `id`s are never renamed; deprecate and replace instead.
8. **Freshness:** fragments with `verifiedAt` older than 6 months are flagged in CI and re-verified or deprecated.

---

## 11. Success Metrics

There is no telemetry, so every metric uses public signals. Targets are for the first **3 months after v0.1** and will be revisited after launch.

| Metric | Target | Measured by |
| :--- | :--- | :--- |
| Weekly npm downloads | 500 | npm download stats |
| GitHub stars | 300 | GitHub |
| Merged community fragments | 10 | GitHub PRs |
| Rule effectiveness | Fewer violations in ≥ 4 of 5 eval tasks | §8.3 |
| User content overwritten | 0 confirmed reports | GitHub issues labeled `data-loss` |
| Time to first rules | < 60 s | Manual check each release |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| Agent file formats change (e.g., Windsurf → `.devin/rules`) | One isolated adapter per target, snapshot tests, minimum-version table, fast patch releases |
| Rule content goes stale as libraries evolve | `appliesTo`, `sources`, `verifiedAt`, 6-month freshness check, `doctor` version checks |
| Low-quality or harmful community rules | 3-part formula, CI checks, CODEOWNERS review, safety rules, effectiveness gate |
| Generated rules don't change agent behavior | Effectiveness check before each minor release; prune fragments that don't help |
| Overlap with `ruler`, `rulesync`, and the `agentinit` package | Lead with curated content, detection, workflows, and `doctor`; always show the scoped package name |
| Maintainer burden of many fragments | Narrow v0.1 scope; clear contribution guide; deprecate unmaintained fragments |

---

## 13. Known Limitations (v0.1)

- **Copilot surfaces that ignore `AGENTS.md`** (e.g., some JetBrains features) only see the pointer in `copilot-instructions.md`. An opt-in inline mode is planned for v0.2.
- **Glob-scoped rules in Claude Code** may not load when a new file is being created. Claude has no description-based rule activation, so `auto` falls back to globs there.
- **Copilot on GitHub.com** reads `applyTo` on path-specific instructions, so those rules may not load when a new file is being created. VS Code loads the same file when `description` matches the task.
- **Monorepos** are detected but not compiled; users run the CLI inside one package.
- **Legacy files** (`.cursorrules`, `.windsurfrules`) are left untouched and keep loading alongside the new rules.
- **Greenfield mode** can't run with `--yes`.
