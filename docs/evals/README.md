# Rule-Effectiveness Eval

Manual check from PRD §8.3 / §11. Before each minor release, run the five fixed tasks in [tasks.md](./tasks.md) in **two agents**, **with** and **without** generated rules, on an extended copy of `tests/fixtures/next15-src`. Ship only if rules reduce violations in **at least 4 of 5** tasks.

An agent can prepare these materials. **A human reviews the results and signs go/no-go.** Automation is out of scope until v0.4+.

## Agents

Use the same two runners for every release so results stay comparable. Record the model id in the results file and keep it fixed for every run of that release.

v0.1 used Cursor Task stand-ins. Claude Code was not installed on the eval host. The owner accepted those runs and their scores for this release ([results-v0.1.md](./results-v0.1.md)). Later minors keep this pair.

| Agent | v0.1 runner | Model |
| :--- | :--- | :--- |
| Cursor | Cursor Task (`generalPurpose`) | `composer-2.5-fast` |
| Claude | Cursor Task (`generalPurpose`) | `claude-sonnet-5-5-high` |

## Fixture setup

Stock `next15-src` only selects `typescript-strict`, `nextjs-app-router`, and `flat`. The eval tasks also exercise library fragments, so extend the fixture once, then clone that tree for every run.

From the repository root:

```bash
EVAL_ROOT="$(mktemp -d)/agentinit-eval"
cp -R tests/fixtures/next15-src/. "$EVAL_ROOT/"
cd "$EVAL_ROOT"
```

Add packages that match fragment `appliesTo` ranges, plus a `test` script Vitest needs:

```bash
pnpm add zustand@^5 @tanstack/react-query@^5 react-hook-form@^7 zod@^4 @hookform/resolvers@^5
pnpm add -D vitest@^3
```

In `package.json`, set `"test": "vitest run"` under `scripts` (keep existing scripts).

Extend `tsconfig.json` so seed `.tsx` files and the `@/` import resolve (stock fixture only sets `strict`):

```json
{
  "compilerOptions": {
    "strict": true,
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vitest.config.ts"]
}
```

Add a minimal `vitest.config.ts` at the workdir root (task 5 seeds are plain `.ts`; this keeps `pnpm test` runnable without JSX transform surprises):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

Add the seed files from [tasks.md](./tasks.md) (required for tasks 4 and 5). Then generate rules:

```bash
# From the agentinit repo, after pnpm build:
node /path/to/agentinit/dist/cli.js init --yes --cwd "$EVAL_ROOT"
```

Confirm `.agentinit/manifest.json` selections include at least:

- `language`: `typescript-strict`
- `frameworks`: `nextjs-app-router`
- `libraries`: `zustand`, `tanstack-query`, `react-hook-form-zod`, `vitest`
- `architecture`: `flat`

Copy the finished tree to two baselines and keep them immutable:

| Baseline | Contents |
| :--- | :--- |
| `with-rules` | Full tree after `init` (rules, workflows, manifest). |
| `without-rules` | Same `package.json`, source, and seed files; **delete** `.agentinit/`, `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, and every agent file tree (`.cursor/`, `.claude/`, `.windsurf/`, `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`). |

Each run starts from a **fresh copy** of the matching baseline (never reuse a dirty workdir).

## Procedure (one run)

1. Copy the correct baseline into a new empty directory.
2. Open a **fresh** session in the runner from the Agents table. Do not carry prior eval context.
3. Point the agent at that directory as the project root.
4. Paste **only** the task prompt from [tasks.md](./tasks.md). No extra instructions, no “follow the rules”, no hints about violations.
5. Let the agent finish (or stop after a clear first deliverable if it loops). Do not steer mid-run.
6. Score the resulting diff against [checklist.md](./checklist.md) for that task.
7. Record the row in your results file (copy [results-template.md](./results-template.md) → `results-v0.1.md` for the first release).
8. Discard the workdir.

Matrix: **5 tasks × 2 agents × with/without rules = 20 runs**.

## Scoring

- Use only the checklist items listed for that task.
- Each item is **0 or 1** per run: `1` if the violation appears at least once in files the agent created or edited; `0` otherwise.
- **Violation count** for the run = sum of those items.
- Notes: short quotes or paths that justify a `1` (enough for a second reader to agree).

### Per-task pass / fail

For each task id:

- `total_with` = sum of violation counts for Cursor+with and Claude+with
- `total_without` = sum for Cursor+without and Claude+without

The task **passes** if `total_with < total_without`. Ties and increases fail that task.

### Release gate

**Go** if ≥ 4 of 5 tasks pass. Otherwise **no-go**: revise the failing fragments, re-run the affected tasks (all four cells), and record a new results file or an addendum. When a checklist item cannot occur on the current seed, revise that seed and its task prompt together — the same prompt on both baselines — and name the instrument change in the addendum. A tie on a task the seed cannot provoke is an instrument gap. It is not, by itself, a fragment failure.

## Recording results

1. Copy `results-template.md` to `results-v0.1.md` (or `results-vX.Y.md` for later minors).
2. Fill every run row and the per-task summary table.
3. Set the go/no-go decision and sign the owner line.

Owner review of materials and of the filled results file is part of the gate (see T33).
