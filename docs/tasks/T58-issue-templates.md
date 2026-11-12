# T58 · Issue Templates & a Wrong-Rule Report Path

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M10 — 0.1.2 patch | — | — | §11 | S |

## Goal
A user who hits a wrong rule, a missing framework, a bug, or lost content can report it in the right shape in about a minute, and the reports can be counted by label.

## Context
Promoted from `backlog.md` P1.6.
- There is no telemetry, so GitHub issues are the only signal. PRD §11 counts confirmed `data-loss` reports and merged community fragments.
- `.github/` has `CODEOWNERS`, `FUNDING.yml`, `pull_request_template.md`, and the workflows. It has no issue templates.
- v0.2 opens the tool to JavaScript projects, so the channel should exist before the audience grows.
- The labels `data-loss`, `wrong-rule`, and `coverage` don't exist yet. Creating them is an owner operation (`backlog.md`), and a template can only apply a label that exists.

## Decisions (owner, before starting)
Record the answers under **Notes**.
1. **Where the "Report a wrong rule" link lives.** Recommended: the README and `CONTRIBUTING.md` only, **not** in generated files. Generated rule files are loaded into the agent's context, so a link there costs tokens in every chat. It would also change every generated file, and every existing project would see `rules-update` warnings. Alternatives: one line in the `AGENTS.md` managed block, or one line in the `init` next steps on a terminal.
2. **Data-loss reports.** Recommended: a fourth template, "My content was overwritten or lost", that applies `data-loss`. The backlog listed three templates, but safe writes are the product's main promise and PRD §11 counts this label. Alternative: keep three templates and let the maintainer add the label during triage.
3. **Blank issues.** Recommended: keep them enabled, and add a contact link that sends security reports to the private advisory form in `SECURITY.md`.

## Scope
1. **Issue forms** under `.github/ISSUE_TEMPLATE/` (YAML forms, not Markdown templates):
   - `bug.yml` → label `bug`. Fields: agentinit version, the command and flags, Node version, operating system, package manager, what happened, what was expected, and the output (`--json` where possible).
   - `wrong-rule.yml` → label `wrong-rule`. Fields: the fragment id (from `agentinit list`, or the `agentinit-<id>` file name), the detected package version, the agent, the directive that is wrong, and the official documentation URL that shows the correct behavior.
   - `fragment-request.yml` → label `coverage`. Fields: the framework or library, its package name, the versions in use, the official documentation URL, and whether the reporter wants to contribute the fragment.
   - `data-loss.yml` → label `data-loss` (decision 2). Fields: agentinit version, the command and flags, which file changed, whether a copy exists under `.agentinit/backups/`, and the steps to reproduce.
2. **`config.yml`:** blank issues and the security contact link, per decision 3.
3. **README:** a short "Report a problem" section that links to the issue chooser and names the four kinds. `CONTRIBUTING.md` points to it.
4. **Test:** parse every form with the existing `yaml` package and check that it has `name`, `description`, a non-empty `body`, unique field ids, and only labels from the list above.
5. Tick the label item under "Owner operations" in `backlog.md` once the owner confirms the labels exist.

## Out of scope
- Telemetry of any kind.
- GitHub Discussions, labeling bots, and issue automation.
- Any change to generated files (unless decision 1 picks an alternative).
- A changeset: the CLI's behavior does not change.

## Implementation notes
- GitHub only uses issue forms from the default branch, so they can't be previewed on the task branch. After the merge, the owner opens the issue chooser once and checks each form.
- Keep every form short. Mark as required only what is needed to reproduce the problem.
- The request form is what the "no supported framework" message will link to later (backlog P3.5).

## Acceptance criteria
- [x] Decisions recorded under **Notes**.
- [x] The forms exist, parse as YAML, and pass the new test.
- [x] The forms apply only `bug`, `wrong-rule`, `coverage`, and `data-loss`.
- [x] `config.yml` exists and follows decision 3.
- [x] The README links to `https://github.com/qivora-labs/agentinit/issues/new/choose`.
- [x] Under decision 1 "README only": no generated output changes, and the end-to-end snapshots are untouched.
- [x] The labels exist on GitHub, or the open owner operation is noted under **Notes**.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commit
`chore: add issue templates and a wrong-rule report path`

## Notes
Owner decisions, 2026-11-12.
- **Decision 1:** the report link lives in the README and `CONTRIBUTING.md` only. Generated files are not changed.
- **Decision 2:** a fourth template, "My content was overwritten or lost", applies `data-loss`.
- **Decision 3:** blank issues stay enabled, with a contact link that sends security reports to the private advisory form.

Implementation, 2026-11-13.
- Forms: `bug.yml`, `wrong-rule.yml`, `fragment-request.yml`, `data-loss.yml`, plus `config.yml`.
- `bug` already exists on GitHub. `data-loss`, `wrong-rule`, and `coverage` do not; the owner operation in `backlog.md` stays open until they are created (templates can only apply labels that exist).
