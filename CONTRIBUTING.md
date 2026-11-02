# Contributing

Thanks for helping. Most contributions are **registry fragments** — one Markdown file, no CLI code required.

## Dev setup

```bash
git clone https://github.com/qivora-labs/agentinit.git
cd agentinit
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

| Command | Purpose |
| :--- | :--- |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (once) |
| `pnpm build` | Build `dist/cli.js` |
| `pnpm check:package` | publint |
| `pnpm registry:check` | Validate every fragment in `registry/` |
| `node dist/cli.js --help` | Exercise the built CLI |

Node: `^22.18.0 || ^24.11.0 || >=26.0.0`. Package manager: pnpm (see `packageManager` in `package.json`).

Hand-written agent docs for this repo: [`AGENTS.md`](AGENTS.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md). Product requirements: [`docs/PRD.md`](docs/PRD.md).

## Add a fragment in 5 minutes

1. **Copy the template** — [`docs/fragment-template.md`](docs/fragment-template.md) → `registry/<category>/<id>.md`  
   Categories: `architectures`, `languages`, `frameworks`, `libraries`, `workflows`. File name must equal `id`.
2. **Fill frontmatter** — stable `id`, `name`, `category`, `version`, `order`, `description`, `scope` (rules), `globs` if `glob`/`auto`, `detect` / `appliesTo` when useful, `sources`, and today's `verifiedAt` (`YYYY-MM-DD`).
3. **Write the body** using the 3-part formula (rules) or the workflow sections below.
4. **Check** — `pnpm registry:check`
5. **Open a PR** — one fragment (or a small related set) per PR. `registry/` changes need CODEOWNERS review.

### Rules for fragments (PRD §10)

1. **No CLI code required** — a library or framework is one `.md` under `registry/` with valid frontmatter.
2. **Token budget** — each fragment stays under **120 lines** (~800 tokens). Workflows ≤ 60 lines.
3. **Actionable directives only** — imperative verbs (`ALWAYS`, `NEVER`, `PREFER`, `FORBID`, `DEFAULT`); no textbook explanations.
4. **Version-aware and sourced** — set `appliesTo` when guidance depends on a major version; cite official docs in `sources`; set `verifiedAt`.
5. **Portable globs** — no brace patterns (`{ts,tsx}`) and no commas; one glob per extension; use `{{src}}` for the source root.
6. **Safety** — never instruct agents to run network commands, install packages, read secrets, or disable safeguards.
7. **Stable ids** — published `id`s are never renamed; deprecate and replace instead.
8. **Freshness** — fragments with `verifiedAt` older than 6 months are flagged in CI; re-verify or deprecate.

### 3-part formula (rule fragments)

1. **Boundary** — where the code lives and how modules interact.
2. **Directives** — imperative constraints (`ALWAYS` / `NEVER` / `PREFER` / `FORBID` / `DEFAULT`).
3. **Contract** — a short Good vs. Anti-Pattern fenced code block.

Architecture fragments also need `## Summary` (≤ 10 lines, copied into `AGENTS.md`) and `## Map` (for `ARCHITECTURE.md`). Workflows use `## Purpose`, `## Input`, `## Steps`, `## Output`, `## Guardrails`.

Placeholders in bodies and globs: `{{src}}`, `{{pm}}`, `{{scripts.<name>}}`. Never hard-code `npm`.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <subject>
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Subject: imperative mood, lowercase, no trailing period
- **Never** add `Co-authored-by:` trailers or AI/tool attribution lines

Examples: `feat(registry): add jotai fragment`, `docs: clarify doctor exit codes`.

## Task workflow

Product work is split into tasks under [`docs/tasks/`](docs/tasks/README.md). One task → one branch (`task/T05-registry-loader`) → one PR. Agents (and humans) follow [`docs/workflows/implement-task.md`](docs/workflows/implement-task.md).

Before finishing CLI work: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Security

See [SECURITY.md](SECURITY.md) for private vulnerability reports.
