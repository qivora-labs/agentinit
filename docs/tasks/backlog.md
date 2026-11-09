# Post-Launch Backlog (Phases 1–3)

Plans from the pre-launch review (2026-11-05) that come **after** `0.1.0`. They are deliberately **not** task files yet:

- They depend on decisions that M8 (T41–T48) makes first: the manifest shape (`excluded`, `workflows`), `doctor` severity, the version-coverage policy, and the owned-path list.
- Most need PRD changes that the owner hasn't approved yet (PRD §7 is the approved roadmap; this file proposes changes to it).
- After launch, user issues should set the order. Task files written now would go stale.

## Promoting an item to a task file
1. Confirm the M8 decisions it depends on are recorded (task **Notes** and PRD).
2. Get owner approval for any PRD change the item needs. Update the PRD in the same PR as the task, or before it.
3. Write `docs/tasks/T<next>-<slug>.md` with the template in `docs/tasks/README.md`. Split anything larger than **L**.
4. Add it to the index, the dependency graph, and the waves in `docs/tasks/README.md`, then delete or strike the item here.

Each item lists: **Problem**, **Proposal**, **Open decisions**, **Depends on**, **Size** (rough), **PRD**.

---

## Phase 1 — v0.1.x patches (first 2–4 weeks after launch)

Small fixes and coverage gaps that don't change the product's shape. Ship them as patch releases. The first batch is M9 (T49–T54) in [`README.md`](README.md#task-index).

### P1.1 Older majors for libraries and React + Vite
- **Problem:** `react-vite` requires `react >=19` and `vite >=6`, `zustand >=5`, `vitest >=3`. Common React 18 / Vite 5, Zustand 4, and Vitest 2 projects get no rules.
- **Proposal:** apply the T42 version policy: add range-specific fragments, or widen ranges where the guidance holds. Add one fixture per range.
- **Open decisions:** none beyond the T42 policy.
- **Depends on:** T42. **Size:** L (content-heavy; split per fragment). **PRD:** §4.2, §8.2.

### ~~P1.2 Low-severity safety hardening~~
Promoted to [T53](T53-safety-hardening.md).

### ~~P1.3 Duplicate H1 when adopting an existing file~~
Promoted to [T54](T54-adopt-duplicate-h1.md).

### P1.4 Detection robustness
- **Problem:** lockfiles are read only at the project directory. `yarn.lock` and `bun.lock` aren't parsed. Versions are read only from top-level `node_modules/<pkg>`. Inside a workspace package with no local lockfile, versions fall back to semver ranges.
- **Proposal:** walk up to the git or workspace root for lockfiles. Add `yarn.lock` (classic + berry) and text `bun.lock` parsing. Read pnpm lock `importers` for the package's path.
- **Open decisions:** whether `yaml` covers yarn berry, or whether a small parser is needed (no new runtime dependencies without approval).
- **Depends on:** —. **Size:** M. **PRD:** §3.3 step 2.

### P1.5 Terminal polish
- **Problem:** the 10-line wordmark prints on every `init` re-run. The TTY `doctor` output has a blank line without the frame rail after the header.
- **Proposal:** full wordmark on the first run (no manifest), compact header on re-runs. Fix the rail gap.
- **Open decisions:** this reverses the M7 decision "init always shows the full wordmark" (`docs/tasks/README.md`), so it needs owner sign-off.
- **Depends on:** —. **Size:** S. **PRD:** §3.1.

### P1.6 Feedback loop without telemetry
- **Problem:** with no telemetry (PRD §1.2), the only signal is GitHub issues.
- **Proposal:** add issue templates (bug, wrong rule, new fragment request) and a "Report a wrong rule" link in each generated rule file's managed block or in the README. Label issues `data-loss`, `wrong-rule`, and `coverage` to match PRD §11.
- **Depends on:** —. **Size:** S. **PRD:** §11.

### P1.7 Windsurf workflows move to skills **(new)**
- **Problem:** T48 found that Windsurf (now Devin Desktop) 3.6.22 says workflows are being deprecated in favor of skills. The Windsurf target writes `.windsurf/workflows/<id>.md`.
- **Proposal:** once the deprecation lands in official docs, write Windsurf workflows as skills, the same way T51 handles Cursor. Keep the old paths owned so re-runs clean them up.
- **Open decisions:** the skills folder and format, and whether Windsurf also loads `.claude/skills/` (which would cause the same duplicates T51 fixes for Cursor).
- **Depends on:** T51 (same pattern). **Size:** M. **PRD:** §5.2, §5.4.

### Owner operations after 0.1.0 (not tasks)
Repository and account settings an agent can't change. Tick them off here.
- [ ] Remove the stray `0.0.0-stage` version: `npm unpublish @agentinit/cli@0.0.0-stage` within 72 hours of publishing it, otherwise `npm deprecate`.
- [ ] Branch protection on `main`: require the CI checks and pull requests (no required approvals while solo).
- [ ] npm Trusted Publishing for `release.yml`, then delete the `NPM_TOKEN` secret.
- [ ] Record whether the rule-effectiveness eval was re-run after T45 for tasks T1, T3, and T4 (`docs/evals/results-v0.1.md`).
- [ ] Create the `data-loss`, `wrong-rule`, and `coverage` labels (P1.6 adds the templates).

---

## Phase 2 — v0.2 (lifecycle and customization)

These change the product's shape. They build on PRD §6.6 and the v0.2 roadmap, with additions marked **(new)**.

### P2.1 `add`, `remove <id>`, `update`
- **Problem:** v0.1 updates only through re-running `init`, and `remove --all` (T46) is all-or-nothing.
- **Proposal:** as in PRD §6.6. `update` also lists fragment version changes since the last run (manifest `fragments` vs. registry). `add` and `remove` edit `selections` and `excluded` (T43) with fuzzy id suggestions (`src/suggest.ts`).
- **Open decisions:** whether `add` of a fragment outside its `appliesTo` range is allowed with a warning.
- **Depends on:** T43, T46. **Size:** L (split per command). **PRD:** §6.6.

### P2.2 Team fragments and overrides
- **Problem:** the only way to customize generated rules is to edit managed content, and `doctor` then fails (T43 keeps `edited` as an error).
- **Proposal:** `.agentinit/fragments/*.md` follow the registry schema and compile to every target (PRD §7 v0.2). **(new)** A team fragment with the same `id` as a bundled one replaces it, so teams can fork a rule without editing generated files. `check-registry` logic validates team fragments at `init` and `doctor` time.
- **Open decisions:** override vs. extend semantics; whether team fragments may use `scope: always` (budget impact); the owned-path rules for their outputs (T41).
- **Depends on:** T41, T43. **Size:** L. **PRD:** §4.4, §7, §9.

### P2.3 `/agentinit-customize` workflow
- **Problem:** project-specific business rules can't come from a static registry.
- **Proposal:** as in PRD Pillar 5: the user's own agent interviews them and writes into a managed `project-domain` block that `doctor` treats as user-owned (it never reports it as edited).
- **Depends on:** P2.2. **Size:** M. **PRD:** §2 Pillar 5, §7.

### P2.4 Project conventions from static analysis **(new)**
- **Problem:** apart from folder names and scripts, generated content is generic. This is the biggest gap compared with agent-native `/init` commands.
- **Proposal:** detect facts without an LLM and render them as an always-on "Project conventions" section (within the budget):
  - tsconfig `paths` aliases (already parsed),
  - where tests live (colocated vs. `tests/`),
  - lint and format tools (ESLint, Biome, Prettier configs),
  - module system,
  - import style (relative vs. alias, sampled from a bounded number of files).
- **Open decisions:** sampling limits (time budget under 60 s, PRD §8.1); how facts appear in `ProjectProfile`; whether facts are frozen in the manifest so `doctor` can report convention drift.
- **Depends on:** —. **Size:** L. **PRD:** new section under §3.3 and §5.1.

### P2.5 `doctor` for CI
- **Problem:** `doctor` output is human text or JSON only, and it can't tell that fragment updates are available.
- **Proposal:**
  - GitHub annotations (`::error file=…`) and/or SARIF output.
  - A thin GitHub Action wrapper.
  - A warning-level "newer fragment versions available" check (manifest `fragments` vs. bundled registry).
  - `--strict` to promote warnings to errors (builds on T43 severity).
- **Depends on:** T43. **Size:** M. **PRD:** §6.5.

### P2.6 Copilot inline mode
- **Problem:** Copilot surfaces that ignore `AGENTS.md` see only a pointer (PRD §13).
- **Proposal:** as in PRD §7 v0.2: opt-in inlining of the always-on core into `.github/copilot-instructions.md`, exempt from the no-duplication check.
- **Depends on:** —. **Size:** M. **PRD:** §5.1, §7, §13.

---

## Phase 3 — v0.3+ (breadth and proof)

### P3.1 Monorepo support
- **Problem:** monorepo roots exit `1` (PRD §3.3). Most TypeScript teams with several packages use pnpm, npm, or Turborepo workspaces.
- **Proposal:** as in PRD §7 v0.3: per-package globs or nested `AGENTS.md` files, plus a `{{pkg}}` placeholder. One manifest at the root with per-package selections.
- **Open decisions:** nested `AGENTS.md` vs. root-only output with package-prefixed globs (how each agent loads nested files differs and needs verifying per agent).
- **Depends on:** P1.4. **Size:** L (split: detection, plan, targets, doctor). **PRD:** §3.3, §7.

### P3.2 Coverage expansion, by popularity
- **Problem:** five frameworks and seven libraries cover a narrow slice of TypeScript projects.
- **Proposal:** rank by npm download share and issue demand, then add fragments in this order (adjust once real data exists):
  - Testing: Jest.
  - Tooling: ESLint / Biome / Prettier conventions.
  - Data and APIs: Prisma, Drizzle, tRPC.
  - Frameworks: React Router v7 (framework mode), NestJS, Hono, Astro, Vue / Nuxt, SvelteKit, Expo.
  - Others: Storybook, MSW, Tailwind v3, and a `node-library` fragment for CLIs and libraries.
- **Open decisions:** the maintainer budget per fragment (PRD §12); whether community fragments need the effectiveness gate.
- **Depends on:** T42 policy. **Size:** one task per fragment (M each). **PRD:** §4.2, §7.

### P3.3 More targets
- **Problem:** only four agents get native files.
- **Proposal:** Gemini CLI (PRD §7 v0.3), then by demand: Zed, Cline / Roo, Kiro, JetBrains Junie. For agents that already read root `AGENTS.md`, document support instead of adding an adapter.
- **Open decisions:** the per-agent format and minimum versions, verified against official docs at task time (`docs/compatibility.md`, T48).
- **Depends on:** T41 (owned paths per target). **Size:** S–M per target. **PRD:** §4.3, §5.2–5.4.

### P3.4 Automated rule-effectiveness harness
- **Problem:** the v0.1 eval ran one run per cell with stand-in models, and its checklist mostly measured a rule the tool itself adds (`docs/evals/results-v0.1.md`). It supports a go/no-go decision, not a public claim.
- **Proposal:**
  - Run each cell 3–5 times on real agent CLIs.
  - Use checklists written before the rules change, with items not tied to a single directive.
  - Report the median and spread.
  - Publish the method and raw results.
  PRD §7 already plans automation for v0.4+; consider pulling it into v0.3.
- **Depends on:** —. **Size:** L. **PRD:** §8.3, §7.

### P3.5 Later ecosystem (PRD §7 v0.4+)
JavaScript projects (JSDoc rules), Python, Go, Flutter, and opt-in remote registries pinned to a commit. No change proposed. Keep them as in the PRD until Phase 3 data says otherwise.
