# Post-Launch Backlog

Plans after the current active task set, grouped by the release they are planned for. Items that are not yet task files stay here:

- The release order below is approved and matches PRD §7. The details inside each item are proposals until its task file is written, and most need a PRD change that the item names.
- User issues should set the order inside a release. Task files written too early go stale.

Item ids (`P1.4a`, `P2.5`, `J1`) are stable, because task files refer to them. They do not encode the release: the `P2` items ship in v0.3 and the `P3` items in v0.4 and later.

Active 0.2 tasks are in [`README.md`](README.md). Completed 0.1.x tasks are in [`completed.md`](completed.md).

## Release order

Decided by the owner on 2026-11-12. It replaces the earlier order (v0.2 lifecycle, v0.3 breadth, v0.4+ JavaScript and other ecosystems). Additions to 0.2 were approved on 2026-11-13.

| Release | Theme | Items |
| :--- | :--- | :--- |
| 0.1.2 | Fixes for projects that are already supported | T55–T58 (were P1.4a, P1.4b, P1.8, P1.6) |
| 0.2 | JavaScript projects and older stacks | T59–T76 (were J1–J6, P1.1, plus language-change, module-system, and version-aware `unselected`) |
| 0.3 | Lifecycle and customization | P2.1–P2.6 |
| 0.4 | Breadth and proof | P3.1–P3.4 |
| 0.5+ | Frameworks beyond JavaScript and TypeScript | P3.5 |
| Unscheduled | Low impact, or blocked on a third party | P1.5, P1.7 |

Decisions behind this order:

- **JavaScript moves from v0.4+ to v0.2.** The tool should be useful for real JavaScript and TypeScript projects before it gains lifecycle commands or frameworks in other languages.
- **One set of fragments for both languages.** JavaScript support reuses the existing fragments: globs follow the project's language (J2) and each fragment carries a JavaScript example beside the TypeScript one (J3). There are no `express-js`-style fragment ids.
- **Older majors ship with JavaScript** (P1.1). Jest and Tailwind v3 stay in coverage expansion (P3.2).
- **Beyond JavaScript and TypeScript, support is per framework, not per language.** Frameworks in Python, PHP, Java, Go, and Dart come in v0.5 or later, ordered by demand (P3.5).

## Promoting an item to a task file

1. Confirm the decisions it depends on are recorded (task **Notes** and PRD).
2. Get owner approval for any PRD change the item needs. Update the PRD in the same PR as the task, or before it.
3. Write `docs/tasks/T<next>-<slug>.md` with the template in `docs/tasks/README.md`. Split anything larger than **L**.
4. Add it to the index, the dependency graph, and the waves in `docs/tasks/README.md`, then delete or strike the item here.

Each item lists: **Problem**, **Proposal**, **Open decisions**, **Depends on**, **Size** (rough), **PRD**.

---

## v0.1.2 — Fixes for supported projects

Patch release. These fix wrong or unhelpful behavior for TypeScript projects that v0.1 already accepts.

All four items are task files now (milestone M10 in [`completed.md`](completed.md)):

- ~~P1.4a Wrong package versions inside a workspace package~~ — [T55](T55-workspace-package-detection.md). The task also covers the wrong package manager in generated commands, found while writing it.
- ~~P1.4b `yarn.lock` and `bun.lock` versions~~ — [T56](T56-yarn-and-bun-lockfiles.md).
- ~~P1.8 Version guard before manifest value checks~~ — [T57](T57-newer-manifest-guard.md).
- ~~P1.6 Feedback loop without telemetry~~ — [T58](T58-issue-templates.md).

---

## v0.2 — JavaScript projects and older stacks

Minor release. Task files are milestones M11–M13 in [`README.md`](README.md). Work lands on `release/0.2` (see Owner operations).

Owner decisions on 2026-11-13: two JavaScript language ids (`javascript` and a JSDoc sibling, proposed `javascript-jsdoc`); plus three additions beyond J1–J6 / P1.1 (language-change check, module-system line, version-aware `unselected`).

- ~~J1 Language detection replaces the TypeScript gate~~ — [T60](T60-language-detection.md).
- ~~J2 Language-aware globs~~ — [T61](T61-language-aware-globs.md).
- ~~J3 JavaScript examples in every rule fragment~~ — [T62](T62-per-language-examples.md) (mechanism), [T63](T63-js-examples-architectures.md)–[T66](T66-js-examples-libraries-forms-testing.md) (content).
- ~~J4 `javascript` language fragment~~ — [T59](T59-javascript-language-fragments.md) (two ids, including JSDoc).
- ~~J5 Wizard, summary, docs, and fixtures~~ — [T67](T67-wizard-summary-js.md), [T70](T70-js-fixtures-docs.md).
- ~~J6 Effectiveness eval on a JavaScript fixture~~ — [T75](T75-js-effectiveness-eval.md).
- ~~P1.1 Older majors for libraries and React + Vite~~ — [T72](T72-react18-vite5.md), [T73](T73-zustand-4.md), [T74](T74-vitest-2.md); [T71](T71-doctor-version-aware-unselected.md) first so new coverage does not fail unpinned CI.
- Language change check (new, 2026-11-13) — [T68](T68-language-change-check.md).
- Module system in JavaScript rules (new, 2026-11-13; slice of P2.4) — [T69](T69-module-system-js-rules.md).
- 0.2 release gate — [T76](T76-release-gate-0-2.md).

Zod 3, Jest, and Tailwind v3 stay out of 0.2.0 (Jest and Tailwind v3 remain in P3.2). New fragments are additive, so they can ship in a 0.2.x release.

---

## v0.3 — Lifecycle and customization

These change the product's shape. They build on PRD §6.6 and the v0.3 roadmap, with additions marked **(new)**.

### P2.1 `add`, `remove <id>`, `update`
- **Problem:** updates happen only through re-running `init`, and `remove --all` (T46) is all-or-nothing.
- **Proposal:** as in PRD §6.6. `update` also lists fragment version changes since the last run (manifest `fragments` vs. registry). `add` and `remove` edit `selections` and `excluded` (T43) with fuzzy id suggestions (`src/suggest.ts`).
- **Open decisions:** whether `add` of a fragment outside its `appliesTo` range is allowed with a warning.
- **Depends on:** T43, T46. **Size:** L (split per command). **PRD:** §6.6.

### P2.2 Team fragments and overrides
- **Problem:** the only way to customize generated rules is to edit managed content, and `doctor` then fails (T43 keeps `edited` as an error).
- **Proposal:** `.agentinit/fragments/*.md` follow the registry schema and compile to every target (PRD §7 v0.3). **(new)** A team fragment with the same `id` as a bundled one replaces it, so teams can fork a rule without editing generated files. `check-registry` logic validates team fragments at `init` and `doctor` time.
- **Open decisions:** override vs. extend semantics; whether team fragments may use `scope: always` (budget impact); the owned-path rules for their outputs (T41).
- **Depends on:** T41, T43. **Size:** L. **PRD:** §4.4, §7, §9.

### P2.3 `/agentinit-customize` workflow
- **Problem:** project-specific business rules can't come from a static registry.
- **Proposal:** as in PRD Pillar 5: the user's own agent interviews them and writes into a managed `project-domain` block that `doctor` treats as user-owned (it never reports it as edited).
- **Depends on:** P2.2. **Size:** M. **PRD:** §2 Pillar 5, §7.

### P2.4 Project conventions from static analysis **(new)**
- **Problem:** apart from folder names and scripts, generated content is generic. This is the biggest gap compared with agent-native `/init` commands.
- **Proposal:** detect facts without an LLM and render them as an always-on "Project conventions" section (within the budget):
  - path aliases from tsconfig or jsconfig `paths` (already parsed for tsconfig),
  - where tests live (colocated vs. `tests/`),
  - lint and format tools (ESLint, Biome, Prettier configs),
  - module system (detection started in T60; **stating it in JavaScript language rules shipped as [T69](T69-module-system-js-rules.md)** — remove that bullet from the remaining work),
  - import style (relative vs. alias, sampled from a bounded number of files).
- **Open decisions:** sampling limits (time budget under 60 s, PRD §8.1); how facts appear in `ProjectProfile`; whether facts are frozen in the manifest so `doctor` can report convention drift.
- **Depends on:** T60 (was J1). **Size:** L. **PRD:** new section under §3.3 and §5.1.

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
- **Proposal:** as in PRD §7 v0.3: opt-in inlining of the always-on core into `.github/copilot-instructions.md`, exempt from the no-duplication check.
- **Depends on:** —. **Size:** M. **PRD:** §5.1, §7, §13.

---

## v0.4 — Breadth and proof

### P3.1 Monorepo support
- **Problem:** monorepo roots exit `1` (PRD §3.3). Most teams with several packages use pnpm, npm, or Turborepo workspaces.
- **Proposal:** as in PRD §7 v0.4: per-package globs or nested `AGENTS.md` files, plus a `{{pkg}}` placeholder. One manifest at the root with per-package selections.
- **Open decisions:** nested `AGENTS.md` vs. root-only output with package-prefixed globs (how each agent loads nested files differs and needs verifying per agent).
- **Depends on:** T55. **Size:** L (split: detection, plan, targets, doctor). **PRD:** §3.3, §7.

### P3.2 Coverage expansion, by popularity
- **Problem:** five frameworks and seven libraries cover a narrow slice of JavaScript and TypeScript projects.
- **Proposal:** rank by npm download share and issue demand, then add fragments in this order (adjust once real data exists):
  - Testing: Jest.
  - Tooling: ESLint / Biome / Prettier conventions.
  - Data and APIs: Prisma, Drizzle, tRPC.
  - Frameworks: React Router v7 (framework mode), NestJS, Hono, Astro, Vue / Nuxt, SvelteKit, Expo / React Native.
  - Others: Storybook, MSW, Tailwind v3, and a `node-library` fragment for CLIs and libraries.
- **Open decisions:** the maintainer budget per fragment (PRD §12); whether community fragments need the effectiveness gate.
- **Depends on:** T42 policy, J3. **Size:** one task per fragment (M each). **PRD:** §4.2, §7.
- React Native is listed here and not in P3.5: it is a `package.json` project, so it needs no new detection.

### P3.3 More targets
- **Problem:** only four agents get native files.
- **Proposal:** Gemini CLI (PRD §7 v0.4), then by demand: Zed, Cline / Roo, Kiro, JetBrains Junie. For agents that already read root `AGENTS.md`, document support instead of adding an adapter.
- **Open decisions:** the per-agent format and minimum versions, verified against official docs at task time (`docs/compatibility.md`, T48).
- **Depends on:** T41 (owned paths per target). **Size:** S–M per target. **PRD:** §4.3, §5.2–5.4.

### P3.4 Automated rule-effectiveness harness
- **Problem:** the v0.1 eval ran one run per cell with stand-in models, and its checklist mostly measured a rule the tool itself adds (`docs/evals/results-v0.1.md`). It supports a go/no-go decision, not a public claim.
- **Proposal:**
  - Run each cell 3–5 times on real agent CLIs.
  - Use checklists written before the rules change, with items not tied to a single directive.
  - Report the median and spread.
  - Publish the method and raw results.
  PRD §7 plans automation for v0.5+; consider pulling it into v0.4.
- **Depends on:** —. **Size:** L. **PRD:** §8.3, §7.

---

## v0.5+ — Frameworks beyond JavaScript and TypeScript

### P3.5 Frameworks in Python, PHP, Java, Go, and Dart
- **Problem:** developers in these languages mostly work inside a framework, and the framework's conventions are what an agent gets wrong. Detection and the profile are built on `package.json` (`packages`, `packageManager`, `scripts`), so no framework outside npm can be detected.
- **Proposal:** the unit of support is the framework, not the language (owner, 2026-11-12). Each one is a framework fragment, the same as Next.js or Express today, for example Django or FastAPI, Laravel, Spring Boot, Gin, and Flutter. Add one framework at a time, ordered by demand (issues labelled `coverage`). General language support is not a goal: a project in one of these languages without a supported framework is not targeted. Before the first framework, run a design task for how detection and the profile generalize beyond `package.json` (`pyproject.toml`, `composer.json`, `pom.xml` or `build.gradle`, `go.mod`, `pubspec.yaml`). Opt-in remote registries pinned to a commit stay here, as in PRD §7.
- **Decided (owner, 2026-11-12):**
  - **The language fragment is optional.** The language stays a detected fact in the profile and the manifest (`python`, `php`), because globs and examples need it. A fragment under `registry/languages/` is included when one exists and is not required, so no always-on language rules are written for these projects by default. A language-level rule that a framework depends on goes in that framework's fragment.
  - **No supported framework exits `1`.** The message names the project file that was found and the frameworks supported for that language, and links to the `coverage` issue template (T58). Base rules as in PRD §3.6 are not generated: without a language or framework fragment they would be only an architecture guess tuned to JavaScript folder names plus the workflows. Moving to exit `0` later is a minor-release change.
- **Open decisions:**
  - Which frameworks come first. The names above are examples, not commitments.
  - Who reviews rule content for each framework (PRD §12).
- **Depends on:** P3.2 data. **Size:** L for the detection design, then L for the first framework in each language and M for each further one. **PRD:** §7.

---

## Unscheduled

### P1.5 Terminal polish
- **Problem:** the 10-line wordmark prints on every `init` re-run. The TTY `doctor` output has a blank line without the frame rail after the header.
- **Proposal:** full wordmark on the first run (no manifest), compact header on re-runs. Fix the rail gap.
- **Open decisions:** this reverses the M7 decision "init always shows the full wordmark" (`docs/tasks/README.md`), so it needs owner sign-off.
- **Depends on:** —. **Size:** S. **PRD:** §3.1.

### P1.7 Windsurf workflows move to skills
- **Problem:** T48 found that Windsurf (now Devin Desktop) 3.6.22 says workflows are being deprecated in favor of skills. The Windsurf target writes `.windsurf/workflows/<id>.md`.
- **Proposal:** once the deprecation lands in official docs, write Windsurf workflows as skills, the same way T51 handles Cursor. Keep the old paths owned so re-runs clean them up.
- **Open decisions:** the skills folder and format, and whether Windsurf also loads `.claude/skills/` (which would cause the same duplicates T51 fixes for Cursor).
- **Depends on:** T51 (same pattern). **Size:** M. **PRD:** §5.2, §5.4.

---

## Promoted to task files

- ~~P1.2 Low-severity safety hardening~~ — [T53](T53-safety-hardening.md).
- ~~P1.3 Duplicate H1 when adopting an existing file~~ — [T54](T54-adopt-duplicate-h1.md).
- ~~J1–J6, P1.1, and 2026-11-13 0.2 additions~~ — [T59](T59-javascript-language-fragments.md)–[T76](T76-release-gate-0-2.md) (see the v0.2 section above).

## Owner operations (not tasks)

Repository and account settings an agent can't change. Tick them off here.
- [x] Remove the stray `0.0.0-stage` version: `npm unpublish @agentinit/cli@0.0.0-stage` within 72 hours of publishing it, otherwise `npm deprecate`.
- [x] Branch protection on `main`: require the CI checks and pull requests (no required approvals while solo).
- [x] After the first OIDC publish of `0.1.1`, delete the leftover `NPM_TOKEN` repository secret (`release.yml` already uses Trusted Publishing).
- [x] Record whether the rule-effectiveness eval was re-run after T45 for tasks T1, T3, and T4 (`docs/evals/results-v0.1.md`).
- [x] Create the `data-loss`, `wrong-rule`, and `coverage` labels (T58 adds the templates).
- [ ] After the 0.2 planning PR merges to `main`, create `release/0.2` from `main` and protect it the same way as `main` (required CI checks; PRs required). 0.2 task PRs target that branch.
