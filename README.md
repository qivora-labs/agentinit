# `@agentinit/cli`

**ESLint + Prettier for AI coding agent rules.** Detect your TypeScript stack, stitch curated fragments into tool-native configs, and keep them honest with `doctor`.

```bash
npx @agentinit/cli
```

> The unscoped npm package `agentinit` is **unrelated**. Always use the scoped command above.

No accounts, API keys, LLM calls, or telemetry.

![Demo](docs/demo.gif)

<!-- Re-record from repo root: vhs docs/demo.tape -->

## Quick start

**Existing project** (detects packages, agents, layout):

```bash
cd your-app
npx @agentinit/cli init
# or non-interactive:
npx @agentinit/cli init --yes
```

**New / empty folder** (short wizard; cannot use `--yes`):

```bash
mkdir my-app && cd my-app
npx @agentinit/cli init
```

Requires Node.js `^22.18.0 || ^24.11.0 || >=26.0.0`.

## Example output

From `npx @agentinit/cli init --yes` on the `next15-src` fixture (Next.js App Router + TypeScript strict):

```text
├── .claude
│   ├── rules
│   │   └── agentinit-nextjs-app-router.md (created)
│   └── skills
│       ├── new-feature
│       │   └── SKILL.md (created)
│       ├── refactor
│       │   └── SKILL.md (created)
│       ├── review-arch
│       │   └── SKILL.md (created)
│       └── write-tests
│           └── SKILL.md (created)
├── .cursor
│   ├── commands
│   │   ├── new-feature.md (created)
│   │   ├── refactor.md (created)
│   │   ├── review-arch.md (created)
│   │   └── write-tests.md (created)
│   └── rules
│       └── agentinit-nextjs-app-router.mdc (created)
├── .github
│   ├── copilot-instructions.md (created)
│   ├── instructions
│   │   └── agentinit-nextjs-app-router.instructions.md (created)
│   └── prompts
│       ├── new-feature.prompt.md (created)
│       ├── refactor.prompt.md (created)
│       ├── review-arch.prompt.md (created)
│       └── write-tests.prompt.md (created)
├── .windsurf
│   ├── rules
│   │   └── agentinit-nextjs-app-router.md (created)
│   └── workflows
│       ├── new-feature.md (created)
│       ├── refactor.md (created)
│       ├── review-arch.md (created)
│       └── write-tests.md (created)
├── AGENTS.md (created)
├── ARCHITECTURE.md (created)
└── CLAUDE.md (created)
Always-on tokens: 758
```

Always-on content lives once in `AGENTS.md` (budget: 1,500 tokens). Scoped rules and workflows go only to each agent's native files. A committed `.agentinit/manifest.json` records what was written.

## Supported stack

Generated from `npx @agentinit/cli list --json` (v0.1):

| Category | Fragments |
| :--- | :--- |
| **Frameworks** | Next.js App Router, Next.js Pages Router, React + Vite, Express, Fastify |
| **Libraries** | Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, Vitest, Playwright |
| **Languages** | TypeScript, TypeScript Strict |
| **Architectures** | Flat / Minimal, Feature-Based, Layered / Clean, Atomic Design |
| **Workflows** | `/new-feature`, `/refactor`, `/review-arch`, `/write-tests` (always included) |

v0.1 targets TypeScript web projects. JavaScript-only repos are not supported yet.

## Supported agents

Older versions may silently ignore newer formats. Re-verify these floors each release.

| Agent | Minimum | What we write |
| :--- | :--- | :--- |
| **Cursor** | 0.45 | `.cursor/rules/*.mdc`, `.cursor/commands/*.md`; reads `AGENTS.md` |
| **Claude Code** | 2.1.84 | `CLAUDE.md` → `@AGENTS.md`, `.claude/rules/*.md`, `.claude/skills/*/SKILL.md` |
| **Windsurf** | 1.12.25 | `.windsurf/rules/*.md`, `.windsurf/workflows/*.md`; root `AGENTS.md` always-on |
| **GitHub Copilot** (VS Code) | 1.100 | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md`; `AGENTS.md` also loaded in VS Code ≥ 1.104 |

Sources for these floors are recorded in [`docs/tasks/T31-docs-readme-contributing.md`](docs/tasks/T31-docs-readme-contributing.md) **Notes**.

## Commands

```bash
npx @agentinit/cli                 # same as init (interactive)
npx @agentinit/cli init
npx @agentinit/cli init --yes      # non-interactive defaults; never overwrites user content
npx @agentinit/cli init --dry-run  # planned tree + diffs; write nothing
npx @agentinit/cli init --agents cursor,claude
npx @agentinit/cli doctor          # read-only drift check; exit 2 on issues
npx @agentinit/cli list
npx @agentinit/cli list --category library
npx @agentinit/cli list --json
```

### Flags

| Flag | Behavior |
| :--- | :--- |
| `--yes`, `-y` | Never prompt; use non-interactive defaults. Required when stdin is not a TTY. |
| `--dry-run` | Print the planned file tree and diffs; write nothing. |
| `--agents <list>` | Comma-separated subset of `cursor,claude,windsurf,copilot`. `AGENTS.md` is always written. |
| `--cwd <path>` | Run against another directory. |
| `--force` | Replace unmanaged and edited files after backing them up. |
| `--json` | Machine-readable output for `init`, `list`, `doctor`, and `--dry-run`. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show version. |

**Exit codes:** `0` success · `1` error · `2` `doctor` found issues · `130` cancelled.

Lifecycle commands (`add` / `remove` / `update`) are planned for v0.2.

### `doctor` in CI

```yaml
# .github/workflows/agentinit-doctor.yml
name: AgentInit doctor
on:
  pull_request:
  push:
    branches: [main]
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx --yes @agentinit/cli doctor
```

## How it stays safe

- **Managed blocks** — shared files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `ARCHITECTURE.md`) only change content between `<!-- agentinit:begin -->` / `<!-- agentinit:end -->` markers. Your edits outside the markers stay.
- **Manifest** — `.agentinit/manifest.json` (committed) stores content hashes. Matching hashes regenerate silently; edited files prompt (or are skipped with `--yes`).
- **Backups** — when a file is replaced, a copy goes under `.agentinit/backups/` (gitignored by AgentInit).
- **Idempotent** — re-running `init` with the same selections is a no-op when nothing drifted.
- **No telemetry.** Metrics in the PRD use public signals only (npm downloads, GitHub stars, issues).

## FAQ

**What about my legacy `.cursorrules` / `.windsurfrules`?**  
Left untouched. They keep loading alongside the new files; `doctor` warns they are still present.

**Monorepos?**  
Detected, but v0.1 does not compile a whole workspace. Run the CLI inside one package.

**JavaScript-only projects?**  
Not supported in v0.1. Use a TypeScript project (strict recommended).

**Copilot surfaces that ignore `AGENTS.md`?**  
Some JetBrains Copilot features only see the pointer in `.github/copilot-instructions.md`. An opt-in inline mode is planned for v0.2.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a library or framework is usually one Markdown file under `registry/`.

## License

[MIT](LICENSE)
