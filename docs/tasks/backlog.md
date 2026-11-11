# Post-Launch Backlog

Plans that come after `0.1.1`, grouped by the release they are planned for. They are deliberately **not** task files yet:

- The release order below is approved and matches PRD §7. The details inside each item are proposals until its task file is written, and most need a PRD change that the item names.
- User issues should set the order inside a release. Task files written now would go stale.

Item ids (`P1.4a`, `P2.5`, `J1`) are stable, because task files refer to them. They do not encode the release: the `P2` items ship in v0.3 and the `P3` items in v0.4 and later.

## Release order

Decided by the owner on 2026-11-12. It replaces the earlier order (v0.2 lifecycle, v0.3 breadth, v0.4+ JavaScript and other ecosystems).

| Release | Theme | Items |
| :--- | :--- | :--- |
| 0.1.2 | Fixes for projects that are already supported | P1.4a, P1.4b, P1.8, P1.6 |
| 0.2 | JavaScript projects and older stacks | J1–J6, P1.1 |
| 0.3 | Lifecycle and customization | P2.1–P2.6 |
| 0.4 | Breadth and proof | P3.1–P3.4 |
| 0.5+ | Other ecosystems | P3.5 |
| Unscheduled | Low impact, or blocked on a third party | P1.5, P1.7 |

Decisions behind this order:

- **JavaScript moves from v0.4+ to v0.2.** The tool should be useful for real JavaScript and TypeScript projects before it gains lifecycle commands or other languages.
- **One set of fragments for both languages.** JavaScript support reuses the existing fragments: globs follow the project's language (J2) and each fragment carries a JavaScript example beside the TypeScript one (J3). There are no `express-js`-style fragment ids.
- **Older majors ship with JavaScript** (P1.1). Jest and Tailwind v3 stay in coverage expansion (P3.2).
- **Other languages come after breadth.** Python, Go, Java, PHP, and Flutter are v0.5 or later, ordered by demand (P3.5).

## Promoting an item to a task file

1. Confirm the decisions it depends on are recorded (task **Notes** and PRD).
2. Get owner approval for any PRD change the item needs. Update the PRD in the same PR as the task, or before it.
3. Write `docs/tasks/T<next>-<slug>.md` with the template in `docs/tasks/README.md`. Split anything larger than **L**.
4. Add it to the index, the dependency graph, and the waves in `docs/tasks/README.md`, then delete or strike the item here.

Each item lists: **Problem**, **Proposal**, **Open decisions**, **Depends on**, **Size** (rough), **PRD**.

---

## v0.1.2 — Fixes for supported projects

Patch release. These fix wrong or unhelpful behavior for TypeScript projects that v0.1 already accepts.

### P1.4a Wrong package versions inside a workspace package
- **Problem:** inside a pnpm workspace package, the CLI picks rules for the wrong version. Reproduced with 0.1.1 on 2026-11-12: a package with `next: ^16.0.0`, with 16.4.0 installed and in the root lockfile, gets `nextjs-app-router-15`. Running inside a package is the path PRD §3.3 gives monorepo users. Three causes in `src/detect/packages.ts`:
  - `installedVersion` rejects pnpm's `node_modules/<pkg>` symlink, because its target is outside the package directory.
  - Lockfiles are read only in the project directory, and a workspace lockfile is at the root.
  - The pnpm reader looks only at `importers['.']`.

  The version then falls back to the lowest version in the `package.json` range. npm and Yarn workspaces hoist packages to the root `node_modules`, which is not searched either (read from the code, not reproduced).
- **Proposal:** find the workspace or git root above the project. Read the lockfile there, using the pnpm `importers` entry for the package's relative path. Look up `node_modules/<pkg>` from the project directory up to that root, and accept a symlink whose target stays inside that root.
- **Open decisions:** which root bounds the lookup and the symlink targets (workspace root or git root). This relaxes the T14 rule that a symlink is read only when its target stays inside the project, so it needs owner sign-off.
- **Depends on:** —. **Size:** M. **PRD:** §3.3 step 2.

### P1.4b `yarn.lock` and `bun.lock` versions
- **Problem:** `yarn.lock` and `bun.lock` aren't parsed. Without `node_modules` (for example `doctor` in CI before an install), a Yarn or Bun project falls back to the lowest version in the range, which can select a different version-split fragment than `init` did locally.
- **Proposal:** parse `yarn.lock` (classic and berry) and the text `bun.lock`. The binary `bun.lockb` stays unparsed.
- **Open decisions:** whether `yaml` covers Yarn berry, or whether a small parser is needed (no new runtime dependencies without approval).
- **Depends on:** P1.4a (shares the root lookup). **Size:** M. **PRD:** §3.3 step 2.

### P1.8 Version guard before manifest value checks **(new)**
- **Problem:** T50 made unknown manifest *keys* tolerant, but an unknown *value* in a known field is still fatal, and it is checked before the CLI-version guard. Reproduced with 0.1.1 on 2026-11-12: a manifest with `cliVersion: "0.2.0"` and `selections.language: "javascript"` makes `init` and `doctor` say *"Fix .agentinit/manifest.json, or delete it"* instead of *"Run `npx @agentinit/cli@0.2.0` or newer"*. v0.2 writes that value (J1).
- **Proposal:** read `cliVersion` first. When the manifest comes from a newer major or minor and fails validation, report the upgrade message instead of `manifest-invalid`. Accept any kebab-case id for `selections.language` and check it against the registry, so a later language is a lookup miss with a clear message.
- **Open decisions:** the `doctor` severity and exit code when it cannot read a newer manifest (today `doctor` never blocks on version alone, PRD §6.6).
- **Depends on:** —. **Size:** S. **PRD:** §3.4, §6.2, §6.5.
- **Why now:** 0.1.0 and 0.1.1 readers keep the old message. Shipping the fix before 0.2 keeps that window short (same reasoning as PRD §6.2).

### P1.6 Feedback loop without telemetry
- **Problem:** with no telemetry (PRD §1.2), the only signal is GitHub issues. v0.2 widens the audience, so the channel should exist first.
- **Proposal:** add issue templates (bug, wrong rule, new fragment request) and a "Report a wrong rule" link in each generated rule file's managed block or in the README. Label issues `data-loss`, `wrong-rule`, and `coverage` to match PRD §11.
- **Depends on:** —. **Size:** S. **PRD:** §11.

---

## v0.2 — JavaScript projects and older stacks

Minor release. Removing the TypeScript gate alone would generate files that look right and do nothing, so JavaScript support is six items:

| Area | In 0.1.1 | In a JavaScript project |
| :--- | :--- | :--- |
| Scoped globs | All 14 framework and library fragments match only `.ts` and `.tsx` (Tailwind adds `.css`) | No scoped rule ever loads |
| Examples | All 21 rule fragments show typed TypeScript | An agent can copy type syntax into `.js` files |
| `src/` detection | `src` counts only when it holds a `.ts` or `.tsx` file | Every `{{src}}` glob loses its prefix |
| Language | A closed union of two TypeScript ids in the types, the manifest, the wizard, and the summary | No language fragment to select |

The same glob gap already affects TypeScript projects that still contain `.js` or `.jsx` files: those files get no scoped rules today.

A JavaScript-only project changes from exit `1` to exit `0`. That is an exit-code change, so it needs this minor release and a changeset note (`CONTRIBUTING.md`, Compatibility).

### J1 Language detection replaces the TypeScript gate
- **Problem:** `assertTypeScriptProject` exits `1` for a project with no `tsconfig.json` and no `typescript` dependency. `Language` is a closed union in `src/types.ts`, the manifest schema, `asLanguage`, and the UI. `detectSrcDir` counts only `.ts` and `.tsx`, so a JavaScript project with `src/` is read as a root layout.
- **Proposal:**
  - Language is TypeScript when `tsconfig.json` or a `typescript` dependency exists (as today), otherwise `javascript`.
  - `detectSrcDir` also counts `.js`, `.jsx`, `.mjs`, and `.cjs`.
  - Read `jsconfig.json` (`paths`, `checkJs`), tsconfig `allowJs`, and the module system from `package.json` `type`. The profile carries these facts for J2–J4.
  - The manifest accepts `javascript` in `selections.language` (P1.8).
- **Open decisions:** how the profile names the new facts; whether they are saved in the manifest; whether a project with `checkJs` gets its own language id (see J4).
- **Depends on:** P1.8. **Size:** M. **PRD:** §1.6, §3.3 step 1, §3.5, §4.3, §6.2, §8.1.

### J2 Language-aware globs
- **Problem:** fragment globs list only TypeScript extensions. A JavaScript project gets no scoped rules, and a TypeScript project with `allowJs` gets none on its JavaScript files.
- **Proposal:** fragments keep declaring each glob once. The plan expands the extension for the profile: a JavaScript project gets the JavaScript extensions, and a TypeScript project with `allowJs` gets both. The expansion is pure, because the profile carries the facts.
- **Open decisions:**
  - An implicit mapping from `.ts` and `.tsx`, or an explicit placeholder in the glob. Implicit leaves published fragments and community contributions unchanged; explicit is easier to read in the fragment.
  - The mapping itself: whether `.tsx` also maps to `.js` (older React projects keep JSX in `.js` files), and whether `.mjs`, `.cjs`, `.mts`, and `.cts` are included.
  - What widens a TypeScript project's globs. Recommended: `allowJs`, not the files on disk, so adding a file never makes `doctor` report `outdated`.
  - Glob count. `vitest` lists 23 globs today and expansion multiplies them, so check each target's limits.
- **Depends on:** J1. **Size:** M. **PRD:** §4.4, §5.4, §8.1.

### J3 JavaScript examples in every rule fragment
- **Problem:** every Contract example is TypeScript (`err: unknown`, `create<CartState>()`, `satisfies`). A few directives are TypeScript-only too, such as `z.infer` in `react-hook-form-zod`. Architecture fragments are always-on, so their examples would be copied into a JavaScript project's `AGENTS.md`.
- **Proposal:** each rule fragment carries a JavaScript example beside the TypeScript one, and the plan renders the one that matches the profile. `check-registry` requires both, or an explicit TypeScript-only marker. Directive lines that only make sense in TypeScript are marked and dropped from JavaScript output. JavaScript examples are written and reviewed by hand, not produced by stripping types.
- **Open decisions:**
  - The syntax for the two variants (two fences told apart by their info string, or separate sections).
  - Whether the 120-line budget counts the source file or each rendered variant.
  - What a JavaScript project gets from a TypeScript-only fragment.
  - Version policy. Recommended: output for TypeScript projects stays byte-identical, so existing users see no `rules-update` warnings.
- **Depends on:** J1. **Size:** L (split: the mechanism and its check, then content per category as in T09–T12). **PRD:** §4.4, §10.
- The Content Tasks checklist in `docs/tasks/README.md` applies to the content tasks.

### J4 `javascript` language fragment
- **Problem:** a language fragment is required for every selection, and none exists for JavaScript.
- **Proposal:** `registry/languages/javascript.md`, always-on. It covers following the project's module system (ES modules or CommonJS), keeping TypeScript syntax out of `.js` files, and checking external input at runtime.
- **Open decisions:** JSDoc. PRD §7 planned "JavaScript projects (JSDoc rules)". Recommended: JSDoc type directives apply only when `checkJs` is on, because requiring JSDoc in a codebase that has none makes new code inconsistent with the old. The owner hasn't decided this yet.
- **Depends on:** J1, J3. **Size:** M. **PRD:** §4.2, §7.

### J5 Wizard, summary, docs, and fixtures
- **Problem:** the UI and docs assume TypeScript: the greenfield step "TypeScript Strictness", the option "Other TypeScript project", the summary's Language row, the "Run inside a TypeScript project" error, the README pitch and FAQ, and PRD §1–§3.
- **Proposal:**
  - The greenfield step becomes a language choice (TypeScript strict, TypeScript, JavaScript).
  - Update the summary card, error text, README, PRD, and `CONTRIBUTING.md`.
  - The `js-only` fixture changes from rejected to accepted. Add JavaScript fixtures for Next.js, React + Vite, and Express (CommonJS), plus one mixed TypeScript and JavaScript project. Snapshot one full JavaScript tree.
- **Depends on:** J1–J4. **Size:** M. **PRD:** §1.2–§1.6, §3.2, §3.3, §3.5, §8.1, §8.2.

### J6 Effectiveness eval on a JavaScript fixture
- **Problem:** PRD §8.3 gates each minor release on the eval. The v0.1 eval ran only on the TypeScript fixture `next15-src`, and several checklist items are about return types.
- **Proposal:** add a JavaScript fixture and checklist items that can occur in JavaScript (module system, no type syntax, the library patterns). Run those cells before 0.2 ships.
- **Open decisions:** whether all five tasks run on the JavaScript fixture or a subset.
- **Depends on:** J2–J4. **Size:** M. **PRD:** §8.3.

### P1.1 Older majors for libraries and React + Vite
- **Problem:** `react-vite` requires `react >=19` and `vite >=6`, `zustand >=5`, `vitest >=3`. Common React 18 / Vite 5, Zustand 4, and Vitest 2 projects get no rules.
- **Proposal:** apply the T42 version policy: add range-specific fragments, or widen ranges where the guidance holds. Add one fixture per range. New fragments are written with both examples (J3).
- **Open decisions:** none beyond the T42 policy.
- **Depends on:** T42, J3. **Size:** L (content-heavy; split per fragment). **PRD:** §4.2, §8.2.

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
  - module system (detected by J1),
  - import style (relative vs. alias, sampled from a bounded number of files).
- **Open decisions:** sampling limits (time budget under 60 s, PRD §8.1); how facts appear in `ProjectProfile`; whether facts are frozen in the manifest so `doctor` can report convention drift.
- **Depends on:** J1. **Size:** L. **PRD:** new section under §3.3 and §5.1.

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
- **Depends on:** P1.4a. **Size:** L (split: detection, plan, targets, doctor). **PRD:** §3.3, §7.

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
- React Native is listed here and not in P3.5: it is a `package.json` project, so it is a framework fragment, not a new ecosystem.

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

## v0.5+ — Other ecosystems

### P3.5 Languages beyond JavaScript and TypeScript
- **Problem:** detection and the profile are built on `package.json` (`packages`, `packageManager`, `scripts`). Python, Go, Java, PHP, and Flutter each need their own detector, version resolution, and reviewed rule content. Java and PHP were added to the list by the owner on 2026-11-12.
- **Proposal:** add one ecosystem at a time, ordered by demand (issues labelled `coverage`). Before the first one, run a design task for how detection and the profile generalize beyond `package.json`. Opt-in remote registries pinned to a commit stay here, as in PRD §7.
- **Open decisions:** the order; who reviews rule content for each language (PRD §12).
- **Depends on:** P3.2 data. **Size:** L per ecosystem. **PRD:** §7.

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

## Owner operations (not tasks)

Repository and account settings an agent can't change. Tick them off here.
- [x] Remove the stray `0.0.0-stage` version: `npm unpublish @agentinit/cli@0.0.0-stage` within 72 hours of publishing it, otherwise `npm deprecate`.
- [x] Branch protection on `main`: require the CI checks and pull requests (no required approvals while solo).
- [x] After the first OIDC publish of `0.1.1`, delete the leftover `NPM_TOKEN` repository secret (`release.yml` already uses Trusted Publishing).
- [x] Record whether the rule-effectiveness eval was re-run after T45 for tasks T1, T3, and T4 (`docs/evals/results-v0.1.md`).
- [ ] Create the `data-loss`, `wrong-rule`, and `coverage` labels (P1.6 adds the templates).
