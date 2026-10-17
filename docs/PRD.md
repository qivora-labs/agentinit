# `@agentinit/cli` — Product Requirements & Architecture

> **One-Line Pitch:** An open-source, zero-config CLI (`npx @agentinit/cli`) that detects your TypeScript project's stack and generates scoped, version-aware AI coding agent rules, slash-command workflows, and an `ARCHITECTURE.md` for Cursor, Claude Code, Windsurf, and GitHub Copilot from a single curated registry.
---

## 1. Executive Summary & Core Philosophy

### 1.1 The Problem
Modern software engineering relies heavily on AI coding agents (Cursor, Claude Code, Windsurf, GitHub Copilot, Codex). However:
1. **Context Drift:** Agents lack architectural memory on new or existing projects, leading to inconsistent patterns, leaky abstractions, and deprecated syntax for the project's actual library versions.
2. **Rule Fatigue:** Developers repeatedly rewrite or copy-paste `AGENTS.md`, `CLAUDE.md`, and Cursor rules across projects, and keep each tool's format in sync by hand.
3. **Prompt Blindness:** Many developers don't know how to write structured, token-efficient rules or workflow prompts that agents reliably follow.
4. **Context Bloat:** A single 1,500-line rule file, or the same rules duplicated across several tool-specific files, overwhelms the agent's context window and gets critical constraints ignored.

### 1.2 The Solution
A fast, interactive CLI that acts as **ESLint + Prettier + npm for AI coding agents**:
- **100% CLI & open source:** no web dashboard, sign-ups, API keys, token costs, or telemetry.
- **Smart detection:** reads `package.json`, installed versions, lockfiles, and `tsconfig.json` in existing repositories, or guides empty repositories through a short wizard.
- **Composable registry:** stitches curated Markdown fragments into conflict-free, tool-native configuration.
- **Write once, no duplication:** always-on rules are written once to `AGENTS.md`; scoped rules go to each tool's native scoped format.
- **Safe and repeatable:** never overwrites user-written content; tracks what it generated so it can update, remove, and detect drift.

### 1.3 Positioning
- An unrelated unscoped `agentinit` npm package exists in the same space. Docs and the README always show the scoped command (`npx @agentinit/cli`).
- Other tools already compile one rule source to many agents (e.g., `ruler`, `rulesync`). Our differentiation is the **curated, version-aware registry + auto-detection + workflows + `ARCHITECTURE.md`**, not multi-agent compilation alone.

### 1.4 Non-Goals
- Generating application code or installing project dependencies.
- Creating folders or running framework generators (`create-next-app`, `create vite`).
- Calling any LLM or remote API at runtime.
- Supporting JavaScript-only, Python, Go, or mobile projects in v0.1 (see roadmap).

---

## 2. Core Product Pillars

| Pillar | Name | Description | Output Artifact(s) |
| :--- | :--- | :--- | :--- |
| **1** | **Scoped Micro-Rules Engine** | Compiles modular rules scoped by file globs so agents only load relevant context (e.g., Zustand rules only load when touching store files). Always-on content is written once. | `AGENTS.md`, `.cursor/rules/*.mdc`, `.claude/rules/*.md`, `.windsurf/rules/*.md`, `.github/instructions/*.instructions.md` |
| **2** | **Pre-Built Workflows** | Generates structured slash commands so developers can trigger senior-level workflows without writing prompts. | `.cursor/commands/*.md`, `.claude/skills/*/SKILL.md`, `.windsurf/workflows/*.md`, `.github/prompts/*.prompt.md` |
| **3** | **Architecture Map** | Documents where every kind of file belongs and how modules may depend on each other, for both detected and greenfield projects. No folders are created. | `ARCHITECTURE.md` |
| **4** | **Composable Fragment Registry** | Atomic, version-aware Markdown fragments with validated YAML frontmatter, bundled in the npm package and contributed via PRs. | Internal `registry/**/*.md` |
| **5** | **Zero-API Customizer** *(v0.2)* | A slash command that uses the developer's own IDE agent to interview them about business logic and write domain rules into a managed section. | `/agentinit-customize` in every target |
| **6** | **Safe Lifecycle & Drift Detection** | Managed blocks, a manifest with content hashes, and `update` / `remove` / `doctor` commands that keep rules in sync with the project. | `.agentinit/manifest.json` |

---

## 3. User Experience & CLI Workflows

### 3.1 Command Interface
```bash
# Default interactive mode (detects existing vs. empty repo)
npx @agentinit/cli
npx @agentinit/cli init

# Non-interactive mode (detected defaults, never prompts, never overwrites user content)
npx @agentinit/cli init --yes

# Preview the files that would be written, with diffs, without touching disk
npx @agentinit/cli init --dry-run

# Target specific agents
npx @agentinit/cli init --agents cursor,claude

# Browse available fragments
npx @agentinit/cli list
npx @agentinit/cli list --category library

# Lifecycle (v0.2)
npx @agentinit/cli add zustand tanstack-query
npx @agentinit/cli remove zustand
npx @agentinit/cli update
npx @agentinit/cli doctor
```

**Global flags**

| Flag | Behavior |
| :--- | :--- |
| `--yes`, `-y` | Accept detected defaults; skip prompts. Required when stdin is not a TTY. |
| `--dry-run` | Print the planned file tree and diffs; write nothing. |
| `--agents <list>` | Comma-separated subset of `cursor,claude,windsurf,copilot`. `AGENTS.md` is always written. |
| `--cwd <path>` | Run against another directory. |
| `--force` | Replace unmanaged files after backing them up to `*.bak`. |
| `--json` | Machine-readable output (for `list`, `doctor`, and `--dry-run`). |

**Exit codes:** `0` success · `1` error (including unsupported project) · `2` `doctor` found issues · `130` cancelled by the user.

### 3.2 Flow A: Empty / Greenfield Project
Triggered when the directory contains no `package.json` and nothing other than ignorable files (`.git`, `README.md`, `LICENSE`, `.gitignore`, `.editorconfig`).

1. **Application Domain:** `Frontend Web App` · `Full-Stack Web App` · `Backend / API Service`
2. **Framework (filtered by domain):**
   - *Frontend:* React (Vite), Next.js (App Router)
   - *Full-Stack:* Next.js (App Router), Next.js (Pages Router)
   - *Backend:* Node.js + Express, Node.js + Fastify
3. **TypeScript Strictness:** `Strict (no any, explicit return types)` — *recommended* · `Standard`
4. **Libraries (multi-select, filtered by framework compatibility):**
   - *State & Data:* Zustand, TanStack Query
   - *Styling & UI:* Tailwind CSS v4, shadcn/ui
   - *Forms & Validation:* React Hook Form + Zod
   - *Testing:* Vitest, Playwright
5. **Architecture:** `Feature-Based` (`src/features/<domain>`) — *recommended* · `Layered / Clean` · `Atomic Design` · `Flat / Minimal`
6. **Target Agents (multi-select, all pre-selected):** Cursor · Claude Code · Windsurf · GitHub Copilot
7. **Review & Write:** shows the file list and always-on token estimate, then writes rules + `ARCHITECTURE.md`.
8. **Next step hint:** prints the matching generator command (e.g., `pnpm create next-app@latest .`) and recommends running `npx @agentinit/cli init` again after scaffolding so detection can refine globs and versions. Selections are kept in the manifest, so the re-run asks no repeated questions.

> Some framework generators refuse to run in a non-empty directory. The hint tells users to scaffold first when possible, or to scaffold into a subfolder and move files.

### 3.3 Flow B: Existing Project (Auto-Detection)
Triggered when `package.json` exists in the target directory.

1. **TypeScript Gate:** the project must have `tsconfig.json` or a `typescript` dependency. Otherwise the CLI prints *"JavaScript projects aren't supported yet"* and exits with code `1`.
2. **Repository Scan:**
   - **Packages:** resolves real versions from `node_modules/<pkg>/package.json`, then the lockfile, then the semver range in `package.json` (handles `^`, `~`, `workspace:*`, `catalog:`, `npm:` aliases).
   - **Package manager:** `packageManager` field, then lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `package-lock.json`).
   - **Scripts:** only scripts that actually exist (`build`, `dev`, `lint`, `test`, `typecheck`) are documented, using the detected package manager.
   - **TypeScript:** parses `tsconfig.json` as JSONC, resolves `extends`, reads `strict` and `paths` aliases.
   - **Layout:** `src/` vs. root, Next.js `app/` and/or `pages/`, and architecture inference with a confidence score.
   - **Existing agent files:** `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.cursorrules`, `.windsurfrules`, `.windsurf/rules/`, `.github/copilot-instructions.md`.
   - **Monorepo:** detects workspaces (pnpm, npm, yarn, Turborepo, Nx). v0.1 warns and asks the user to run the CLI inside a single package.
   - **Subdirectory:** if run below the git root, warns and offers to use the git root.
3. **Summary Confirmation:** a formatted box showing the detected stack, versions, package manager, layout, and architecture (with confidence).
   - *"Use this configuration, or customize?"*
   - Low-confidence architecture (< 0.7) always prompts instead of guessing.
4. **Agent Selection:** multi-select (skipped with `--agents` or `--yes`).
5. **Conflict Resolution** (per existing unmanaged file, see §6.3).
6. **Write & Report:** writes files, prints the generated tree, the always-on token estimate, and next steps.

---

## 4. Technical Architecture

### 4.1 Pipeline
**detect → resolve → plan → apply**

- `detect` builds a `ProjectProfile` from disk (or from wizard answers).
- `resolve` selects registry fragments for that profile (compatibility, semver ranges, requires/conflicts).
- `plan` turns fragments into a list of `FileOp`s per target. **Pure and snapshot-tested.**
- `apply` is the only step that touches disk: diff, conflict prompts, atomic writes, backups, manifest update. `--dry-run` stops before `apply`.

### 4.2 Repository Structure
```text
@agentinit/cli/
├── src/
│   ├── cli.ts                       # Entry: argument parsing (cac) & command routing
│   ├── commands/
│   │   ├── init.ts
│   │   ├── list.ts
│   │   ├── add.ts                   # v0.2
│   │   ├── remove.ts                # v0.2
│   │   ├── update.ts                # v0.2
│   │   └── doctor.ts                # v0.2
│   ├── detect/
│   │   ├── index.ts                 # Orchestrator → ProjectProfile
│   │   ├── typescript-gate.ts
│   │   ├── packages.ts              # Installed versions, lockfile, package manager, scripts
│   │   ├── tsconfig.ts              # JSONC + extends (get-tsconfig)
│   │   ├── layout.ts                # srcDir, app/pages, architecture + confidence
│   │   ├── workspace.ts             # Monorepo detection
│   │   └── existing-agents.ts
│   ├── registry/
│   │   ├── schema.ts                # zod schema for frontmatter
│   │   ├── load.ts                  # Bundled registry (+ team fragments in v0.2)
│   │   └── resolve.ts               # Compatibility, semver, requires/conflicts
│   ├── plan/
│   │   ├── build-plan.ts            # Fragments → FileOp[]
│   │   └── placeholders.ts          # {{src}} and other glob placeholders
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
│   ├── fixtures/                    # Sample repos (see §8)
│   └── *.test.ts
├── scripts/
│   └── check-registry.ts            # CI: schema, line budget, required sections, valid globs
├── docs/                            # PRD.md
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

**Runtime dependencies:** `@clack/prompts`, `picocolors`, `cac`, `zod`, `yaml`, `semver`, `get-tsconfig`, `tinyglobby`, `diff`.
**Tooling:** pnpm, TypeScript 6 (strict), tsdown, Vitest, ESLint + typescript-eslint, changesets, publint. Node `>=22.12`.
TypeScript stays on `~6.0` until `typescript-eslint` supports TypeScript 7.

The bundled registry is resolved at runtime with `fileURLToPath(new URL('../registry', import.meta.url))`, and verified by a smoke test that installs the packed tarball.

### 4.3 Core Types (`src/types.ts`)
```typescript
export type AgentTarget = 'cursor' | 'claude' | 'windsurf' | 'copilot';

export type AppDomain = 'frontend' | 'fullstack' | 'backend';

export type Language = 'typescript-strict' | 'typescript';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type FragmentCategory = 'architecture' | 'language' | 'framework' | 'library' | 'workflow';

export type FragmentScope = 'always' | 'glob' | 'manual';

export interface ProjectProfile {
  root: string;
  mode: 'existing' | 'greenfield';
  domain: AppDomain;
  packageManager: PackageManager;
  srcDir: '' | 'src';
  language: Language;
  /** Package name → resolved version (e.g. { next: '15.3.1' }) */
  packages: Record<string, string>;
  scripts: Record<string, string>;
  framework: string;                // registry fragment id
  libraries: string[];              // registry fragment ids
  architecture: { id: string; confidence: number };
  existingAgentFiles: string[];
  isMonorepo: boolean;
}

export interface FileOp {
  path: string;                     // POSIX, relative to root
  kind: 'file' | 'managed-block';
  blockId?: string;                 // for managed blocks
  content: string;
  target: AgentTarget | 'shared';
}
```

### 4.4 Registry Fragment Standard (`registry/**/*.md`)
Every fragment follows the **3-Part Rule Formula**:
1. **Boundary:** where the code lives and how modules interact.
2. **Directives:** imperative `ALWAYS` / `NEVER` / `PREFER` constraints, never vague suggestions.
3. **Contract:** a brief Good vs. Anti-Pattern snippet.

**Frontmatter schema** (validated with zod at build time and in CI):

| Field | Required | Description |
| :--- | :--- | :--- |
| `id` | ✓ | Stable kebab-case id; never renamed once published |
| `name` | ✓ | Display name |
| `category` | ✓ | `architecture` · `language` · `framework` · `library` · `workflow` |
| `version` | ✓ | Fragment content version (semver), used by `update` |
| `order` | ✓ | Sort order in shared files (10 arch, 20 lang, 30 framework, 40 library) |
| `description` | ✓ | One line; shown in pickers and used for model-decided activation |
| `scope` | ✓ | `always` (goes into `AGENTS.md`) · `glob` (scoped files) · `manual` |
| `globs` | if `scope: glob` | YAML list; supports `{{src}}` placeholder (`src/` or empty) |
| `detect.packages` | | Package names that trigger auto-selection |
| `appliesTo` | | Package → semver range, e.g. `{ next: ">=15" }` |
| `requires` | | Fragment ids that must also be selected |
| `conflictsWith` | | Fragment ids that cannot be selected together (warn + ask) |
| `compatibleWith` | | Framework ids this library supports (wizard filtering) |
| `argumentHint` | workflows | Hint shown after the slash command (e.g. `<feature-name>`) |

Example (`registry/frameworks/nextjs-app-router.md`):
```markdown
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
```

**Budgets:**
- Each fragment ≤ **120 lines** (~800 tokens).
- The always-on core in `AGENTS.md` should stay ≤ **~1,500 tokens**; the CLI reports the estimate and warns above it.
- Windsurf rule files must stay below **12,000 characters** (enforced by the compiler).

---

## 5. Multi-Agent Compilation Strategy

### 5.1 Layered Output Model
Most agents read `AGENTS.md` **and** their own files. To avoid loading the same rules twice:

1. **Always-on core → `AGENTS.md` only.** Architecture summary, language rules, project commands, and fragments with `scope: always`, sorted by `order`, with a short table of contents.
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

Owned files use the `agentinit-` prefix (rules) or registry ids (workflows) so they are never confused with user files.

### 5.3 Per-Target Formats

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
Workflows are skills (`.claude/skills/new-feature/SKILL.md`, invoked as `/new-feature`) with `name`, `description`, and `argument-hint` frontmatter.

**Windsurf** — root `AGENTS.md` is always-on in Windsurf; scoped rules use glob triggers:
```markdown
---
trigger: glob
globs: src/app/**/*.ts,src/app/**/*.tsx
---
```
`manual` fragments use `trigger: manual`.

**GitHub Copilot** — `.github/copilot-instructions.md` contains a managed block pointing to `AGENTS.md`. Scoped rules:
```markdown
---
applyTo: "src/app/**/*.ts,src/app/**/*.tsx"
---
```

**`ARCHITECTURE.md`** — generated from the architecture fragment, framework, and detected (or planned) layout: a directory map, what belongs where, allowed dependency directions between layers, and naming conventions.

---

## 6. Safe Writes & Lifecycle

### 6.1 Managed Blocks
Shared files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `ARCHITECTURE.md`) contain AgentInit content only inside markers:
```markdown
<!-- agentinit:begin id=core -->
...generated content...
<!-- agentinit:end id=core -->
```
Content outside the markers is never modified. Owned files (`agentinit-*`) are fully managed.

### 6.2 Manifest (`.agentinit/manifest.json`, committed)
```json
{
  "cliVersion": "0.1.0",
  "mode": "existing",
  "selections": {
    "language": "typescript-strict",
    "framework": "nextjs-app-router",
    "libraries": ["tailwind", "zustand"],
    "architecture": "feature-based",
    "agents": ["cursor", "claude", "windsurf", "copilot"]
  },
  "fragments": { "nextjs-app-router": "1.0.0", "zustand": "1.0.0" },
  "files": {
    ".cursor/rules/agentinit-zustand.mdc": { "sha256": "…" },
    "AGENTS.md#core": { "sha256": "…" }
  }
}
```
- Hash matches → safe to regenerate silently.
- Hash differs (user edited) → show the diff and ask; with `--yes`, skip and report.

### 6.3 Conflicts With Existing Unmanaged Files
For each existing file without AgentInit markers:
- **Adopt** — keep the user's content and add the managed block (default for `AGENTS.md`, `CLAUDE.md`, `copilot-instructions.md`).
- **Backup & replace** — write `<file>.bak`, then generate fresh.
- **Skip** — leave the file untouched.

With `--yes`, the default is **Adopt** for shared files and **Skip** for everything else; nothing is destroyed unless `--force` is passed. Legacy `.cursorrules` and `.windsurfrules` are never modified; the CLI warns that they still load alongside the new rules.

### 6.4 Write Guarantees
- All files are written to a temp path and renamed (atomic); Ctrl-C leaves no partial output.
- Globs always use forward slashes; existing line endings (LF/CRLF) are preserved when merging.
- Permission errors produce a readable message, not a stack trace.

### 6.5 Lifecycle Commands *(v0.2)*
- **`add <id...>` / `remove <id...>`:** update selections in the manifest and regenerate affected files. Unknown ids get fuzzy suggestions.
- **`update`:** re-detects the project, applies newer fragment versions, and handles framework upgrades (e.g., Next 15 → 16).
- **`doctor`:** reports, and exits with code `2` on:
  - a detected package with an available fragment that isn't selected;
  - a selected fragment whose package was removed or whose `appliesTo` range no longer matches;
  - managed content edited by hand;
  - an always-on core over budget;
  - legacy rule files still present.

---

## 7. Phased Roadmap

### v0.1 — TypeScript web, every major agent (~3 weeks)

**M1 — Foundation (2 days)**
- [ ] `tsconfig.json` (strict), `tsdown.config.ts`, ESLint, Vitest, changesets, MIT `LICENSE`.
- [ ] CLI skeleton with `cac`: `init`, `list`, global flags, exit codes, non-TTY handling.

**M2 — Registry (5 days)**
- [ ] zod schema, loader, resolver (compatibility, semver, requires/conflicts), `{{src}}` placeholders.
- [ ] `scripts/check-registry.ts` for CI (schema, 120-line budget, required sections, valid globs).
- [ ] Author fragments: 4 architectures, 2 languages, 5 frameworks, 7 libraries, 4 workflows (see §4.2).

**M3 — Detection (3 days)**
- [ ] TypeScript gate, packages and versions, package manager, scripts, tsconfig (JSONC + extends).
- [ ] Layout and architecture inference with confidence; existing agent files; monorepo warning.
- [ ] Wizard for greenfield mode and summary confirmation for existing projects.

**M4 — Targets (4 days)**
- [ ] `AGENTS.md`, Cursor, Claude Code, Windsurf, GitHub Copilot, and `ARCHITECTURE.md` adapters.
- [ ] Token estimate and budget warnings.

**M5 — Safe IO (2 days)**
- [ ] Managed blocks, manifest with hashes, conflict prompts, diff preview, atomic writes, backups.

**M6 — Quality & Launch (3 days)**
- [ ] Snapshot tests per target over fixtures (§8); CI on Ubuntu, macOS, and Windows.
- [ ] Packed-tarball smoke test (`npm pack` → install → run).
- [ ] `README.md` (demo GIF, generated tree, token report) and `CONTRIBUTING.md`.
- [ ] `.github/workflows/release.yml`: changesets release PRs, publish with provenance using the `NPM_TOKEN` secret.
- [ ] Publish `@agentinit/cli@0.1.0`.

### v0.2 — Lifecycle
- `add`, `remove`, `update`, `doctor`.
- Team fragments in `.agentinit/fragments/*.md`, compiled to every target alongside registry fragments.
- `/agentinit-customize` workflow (Pillar 5) writing into a managed `project-domain` block.

### v0.3 — Breadth
- Full monorepo support (per-package globs or nested `AGENTS.md`).
- More frameworks (Angular, Vue/Nuxt, NestJS, Expo) and libraries (Redux Toolkit, Prisma, Drizzle).
- Gemini CLI target (`GEMINI.md` or `.gemini/settings.json` → `AGENTS.md`).
- Optional, opt-in folder scaffolding.

### v0.4+ — Ecosystem
- JavaScript projects (JSDoc rules).
- Python (`pyproject.toml`), Go (`go.mod`), Flutter (`pubspec.yaml`).
- Opt-in remote registries (`--registry <git-url>`, pinned to a commit and recorded in the manifest).
- Rule-effectiveness evaluation harness.

---

## 8. Quality Strategy

**Fixture repositories** (`tests/fixtures/`), each with snapshot output for every target:
`next15-src` · `next-app-no-src` · `next-app-and-pages` · `vite-react` · `express-ts` · `fastify-ts` · `js-only` (must be rejected) · `empty` · `pnpm-monorepo` (must warn) · `existing-claude-md` (adopt) · `edited-managed-block` (must not overwrite) · `jsonc-tsconfig-extends`.

**Registry CI:** every PR touching `registry/` runs `check-registry` and regenerates snapshots so reviewers can see the effect on output.

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
4. **Version-aware:** set `appliesTo` when guidance depends on a major version.
5. **Safety:** fragments must never instruct agents to run network commands, install packages, read secrets, or disable safeguards. `registry/` changes require CODEOWNERS review.
6. **Stable ids:** published `id`s are never renamed; deprecate and replace instead.

---

## 11. Success Metrics

- **Time to first rules:** under 60 seconds from `npx @agentinit/cli` to written files on an existing project.
- **Context efficiency:** default always-on core ≤ 1,500 tokens; zero duplicated rule content across generated files.
- **Safety:** zero reported cases of user content being overwritten.
- **Adoption:** weekly npm downloads and GitHub stars after launch.
- **Community:** number of merged community fragments per month.

---

## 12. Known Limitations (v0.1)

- **Copilot surfaces that ignore `AGENTS.md`** (e.g., some JetBrains features) only see the pointer in `copilot-instructions.md`. Revisit in v0.2 with an opt-in inline mode.
- **Monorepos** are detected but not compiled; users run the CLI inside one package.
- **Legacy files** (`.cursorrules`, `.windsurfrules`) are left untouched and keep loading alongside the new rules.
