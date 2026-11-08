# `@agentinit/cli`

**ESLint + Prettier for AI coding agent rules.** Detect your TypeScript stack, stitch curated fragments into tool-native configs for Cursor, Claude Code, Windsurf, and GitHub Copilot, and keep them honest with `doctor`.

```bash
npx @agentinit/cli
```

> The unscoped npm package `agentinit` is **unrelated**. Always use the scoped command above.

No accounts, API keys, LLM calls, or telemetry.

![Demo](docs/demo.gif)

<!-- Re-record from repo root: vhs docs/demo.tape -->

## Quick start

**Existing project** — reads `package.json`, installed versions, `tsconfig.json`, and folder layout:

```bash
cd your-app
npx @agentinit/cli init
# or non-interactive:
npx @agentinit/cli init --yes
```

**New / empty folder** — short wizard (cannot use `--yes`):

```bash
mkdir my-app && cd my-app
npx @agentinit/cli init
```

Requires Node.js `^22.18.0 || ^24.11.0 || >=26.0.0`.

### What you get

| Artifact | Role |
| :--- | :--- |
| `AGENTS.md` | Always-on rules once (budget ~1,500 tokens), shared by every agent |
| `ARCHITECTURE.md` | Current layout, ownership, and dependency direction |
| Per-agent rules | Scoped fragments in each tool's native format |
| Workflows | `/new-feature`, `/refactor`, `/review-arch`, `/write-tests` (skip with `--no-workflows`) |
| `.agentinit/manifest.json` | Committed record of selections and content hashes |

Re-run `init` after dependencies or layout change. When nothing drifted, it prints **Already up to date** and writes nothing. Use `doctor` in CI to catch drift.

## Example output

On a terminal, `npx @agentinit/cli init --yes` on the `next15-src` fixture (Next.js 16.3 App Router, strict TypeScript, only `src/app`) ends with a short per-agent report:

```text
Wrote 24 files for 4 agents
Cursor          5 files  .cursor/
Claude Code     6 files  .claude/
Windsurf        5 files  .windsurf/
GitHub Copilot  6 files  .github/
Shared          AGENTS.md  ARCHITECTURE.md
Context cost  ~854 tokens loaded in every chat (budget 1,500)
Architecture confidence is 0.625, below 0.7. Using Flat / Minimal.
Next steps
1.  Review the changes  git diff
2.  Try a workflow      /new-feature
3.  Check for drift     npx @agentinit/cli doctor
Done.
```

The architecture line appears because a lone `src/app` folder isn't evidence for any architecture. Without `--yes`, `init` asks you to pick one instead.

Piped or CI output (and `--dry-run`) keeps the full file tree. New files are listed; existing files get a diff:

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
Always-on tokens: 854
Architecture confidence is 0.625, below 0.7. Using Flat / Minimal.
```

Always-on content lives once in `AGENTS.md`. Scoped rules and workflows go only to each agent's native files. 16 of the 24 files are the four workflows in each agent's format. `init --no-workflows` writes the other 8: one rule file per agent, `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`.

## Supported stack

From `npx @agentinit/cli list` (TypeScript web projects in v0.1). A fragment is suggested only when the installed version is in its range:

| Category | Fragment | Applies to |
| :--- | :--- | :--- |
| **Frameworks** | Next.js App Router 16 (`nextjs-app-router`) | `next >=16.3.0` |
| | Next.js App Router 15 (`nextjs-app-router-15`) | `next >=15.0.0 <16.3.0` |
| | Next.js Pages Router (`nextjs-pages-router`) | `next >=13` |
| | React + Vite (`react-vite`) | `react >=19`, `vite >=6` |
| | Express 5 (`express`) | `express >=5` |
| | Express 4 (`express-4`) | `express >=4 <5` |
| | Fastify (`fastify`) | `fastify >=5` |
| **Libraries** | Tailwind CSS (`tailwind`) | `tailwindcss >=4` |
| | shadcn/ui (`shadcn`) | any version |
| | TanStack Query (`tanstack-query`) | `@tanstack/react-query >=5` |
| | Zustand (`zustand`) | `zustand >=5` |
| | React Hook Form + Zod (`react-hook-form-zod`) | `react-hook-form >=7`, `zod >=4` |
| | Vitest (`vitest`) | `vitest >=3` |
| | Playwright (`playwright`) | `@playwright/test >=1.40` |
| **Languages** | TypeScript, TypeScript Strict | — |
| **Architectures** | Flat / Minimal, Feature-Based, Layered / Clean, Atomic Design, Modular / By Concern | — |
| **Workflows** | `/new-feature`, `/refactor`, `/review-arch`, `/write-tests` | included unless `--no-workflows` |

No matching framework? agentinit still writes base rules (language, architecture, compatible libraries, workflows, and `ARCHITECTURE.md`). A version outside every range (for example Next.js 14) gets the same base rules and a notice. JavaScript-only repos are not supported yet.

Browse fragments: `npx @agentinit/cli list`, `list --category library`, or `list --json`.

## Supported agents

Older versions may silently ignore newer formats. **Minimum** is the oldest version that loads everything agentinit writes for that agent.

| Agent | Minimum | What we write |
| :--- | :--- | :--- |
| **Cursor** | 1.6 | `.cursor/rules/*.mdc`, `.cursor/commands/*.md`; reads `AGENTS.md` |
| **Claude Code** | 2.1.84 | `CLAUDE.md` → `@AGENTS.md`, `.claude/rules/*.md`, `.claude/skills/*/SKILL.md` |
| **Windsurf** | 1.12.25 | `.windsurf/rules/*.md`, `.windsurf/workflows/*.md`; root `AGENTS.md` always-on |
| **GitHub Copilot** (VS Code) | 1.104 | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `.github/prompts/*.prompt.md`; reads `AGENTS.md` |

[`docs/compatibility.md`](docs/compatibility.md) has the minimum for each kind of file (rules, workflows, `AGENTS.md`), the changelog entry behind each one, and known caveats. For example, no Cursor changelog says when it started reading `AGENTS.md`.

OpenAI Codex, Amp, and opencode also read a root `AGENTS.md`. agentinit doesn't write files for them, but they pick up the same always-on rules.

## Commands

```bash
npx @agentinit/cli                 # same as init (interactive)
npx @agentinit/cli init
npx @agentinit/cli init --yes      # non-interactive defaults; never overwrites user content
npx @agentinit/cli init --dry-run  # planned tree + diffs for existing files; write nothing
npx @agentinit/cli init --agents cursor,claude
npx @agentinit/cli init --no-workflows  # skip slash-command workflow files
npx @agentinit/cli doctor          # read-only drift check; exit 2 on issues
npx @agentinit/cli list
npx @agentinit/cli list --category library
npx @agentinit/cli list --json
npx @agentinit/cli remove --all    # delete every owned file and managed block
```

### Flags

| Flag | Behavior |
| :--- | :--- |
| `--yes`, `-y` | Never prompt; use non-interactive defaults. Required when stdin is not a TTY. |
| `--dry-run` | Print the planned file tree and diffs for files that already exist; write nothing. New files are listed, not diffed. |
| `--agents <list>` | Comma-separated subset of `cursor,claude,windsurf,copilot`. `AGENTS.md` is always written. |
| `--cwd <path>` | Run against another directory. |
| `--force` | Replace unmanaged and edited files after backing them up. |
| `--json` | Machine-readable output for `init`, `list`, `doctor`, `remove`, and `--dry-run`. |
| `--no-workflows` | On `init`, omit slash-command workflow files. Re-runs keep the setting; turn it back on in *Customize*. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show version. |

**Exit codes:** `0` success · `1` error · `2` `doctor` found issues · `130` cancelled.

`remove --all` undoes an init. It deletes every generated file and managed block plus the manifest. Hand-edited files are kept and reported (interactive mode asks; `--force` backs them up and deletes them), and `.agentinit/backups/` is kept if it holds anything. Per-id `add` / `remove` / `update` are planned for v0.2.

### Leaving out a fragment

Detected a library you don't want rules for? Run `init`, choose *Customize*, and deselect it. agentinit records the id under `selections.excluded` in `.agentinit/manifest.json`. Re-runs won't add it back and `doctor` won't report it. Select it again in *Customize* to undo. `--yes` never changes the excluded list.

### `doctor` in CI

`doctor` checks the manifest, managed files, detected packages, package versions, token budget, and legacy rule files. It never writes.

Each issue is an **error** or a **warning**. Only errors exit `2`:

| Severity | Exit | Issues |
| :--- | :---: | :--- |
| Error | `2` | No manifest; a generated file or block that is missing, edited, outdated, unmanaged, or stale; a detected fragment that isn't selected or excluded; a selected fragment whose package was removed or whose version left the fragment's range |
| Warning | `0` | Legacy `.cursorrules` / `.windsurfrules` still present; always-on content over the 1,500-token budget |

```text
Legacy files
  .cursorrules still loads alongside the new rules.
    Fix: Remove .cursorrules if you no longer need it.
```

`doctor --json` adds `severity` to each issue, and `ok` is `true` when there are no errors.

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

- **Managed blocks** — shared files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `ARCHITECTURE.md`) only change content between `<!-- agentinit:begin id=… -->` / `<!-- agentinit:end id=… -->` markers. Edits outside the markers stay.
- **Manifest** — `.agentinit/manifest.json` (committed) stores content hashes. Matching hashes regenerate silently; edited files prompt (or are skipped with `--yes`).
- **Backups** — when a file is replaced, a copy goes under `.agentinit/backups/` (gitignored by agentinit).
- **Idempotent** — re-running `init` with the same selections is a no-op when nothing drifted.
- **No telemetry.** Metrics in the PRD use public signals only (npm downloads, GitHub stars, issues).

## How this relates to `/init` in your agent

Agents such as Claude Code and opencode have an `/init` command that asks the model to read your repository and write project notes (`CLAUDE.md` or `AGENTS.md`). Those notes cover what only your code can tell: build steps, quirks, and domain terms. agentinit adds what a model shouldn't improvise: reviewed, version-specific framework rules, written the same way for every agent, plus a `doctor` check that fails CI when they drift. The two work together. Keep your own notes outside the `<!-- agentinit:begin … -->` markers in `AGENTS.md` or `CLAUDE.md`, and agentinit leaves them alone.

## FAQ

**What about my legacy `.cursorrules` / `.windsurfrules`?**  
Left untouched. They keep loading alongside the new files; `doctor` warns they are still present.

**Monorepos?**  
Detected, but v0.1 does not compile a whole workspace. Run the CLI inside one package.

**TypeScript library / CLI / unknown framework?**  
Supported with base rules. agentinit skips framework-specific library fragments and still writes language, architecture, workflows, and `ARCHITECTURE.md`.

**JavaScript-only projects?**  
Not supported in v0.1. Use a TypeScript project (strict recommended).

**Copilot surfaces that ignore `AGENTS.md`?**  
Some JetBrains Copilot features only see the pointer in `.github/copilot-instructions.md`. An opt-in inline mode is planned for v0.2.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a library or framework is usually one Markdown file under `registry/`.

Security reports: [SECURITY.md](SECURITY.md).

## Support

If agentinit helps your workflow, you can sponsor development via [GitHub Sponsors](https://github.com/sponsors/qivora-labs). The CLI stays free, offline, and telemetry-free either way.

## License

[MIT](LICENSE)
