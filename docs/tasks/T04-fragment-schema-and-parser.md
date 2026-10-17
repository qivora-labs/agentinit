# T04 · Fragment Schema & Parser

| Milestone | Depends on | Unblocks | PRD | Size |
| :--- | :--- | :--- | :--- | :--- |
| M2 — Registry | T03 | T05, T06, T07, T08 | §4.4 | M |

## Goal
Parse a registry Markdown file into a validated, typed fragment, with error messages that name the file and the field.

## Context
- Read PRD §4.4 fully: frontmatter table, default scopes, placeholders, example fragment.
- `detect.packages` and `detect.files` mean **all** listed entries must be present.

## Scope
- `src/registry/schema.ts` (zod):
  - Common fields: `id` (kebab-case), `name`, `category`, `version` (valid semver), `order` (integer), `description` (single line), `sources` (≥ 1 URL), `verifiedAt` (`YYYY-MM-DD`, valid date).
  - Rule categories (`architecture`, `language`, `framework`, `library`): `scope` required; `globs` required when `scope` is `glob` or `auto`, forbidden for `always`; optional `detect.packages`, `detect.files`, `appliesTo` (package → valid semver range), `requires`, `conflictsWith`, `compatibleWith`.
  - `workflow`: no `scope`/`globs`; optional `argumentHint`.
  - Glob rules: no `{` or `}`, no backslashes, no leading `/` or `./`, non-empty.
  - Unknown frontmatter keys are an error (catches typos like `appliesto`).
- Export inferred types `FragmentMeta`, `RuleFragmentMeta`, `WorkflowFragmentMeta`, and `Fragment = { meta, body, sourcePath }`.
- `src/registry/parse.ts`:
  - `parseFragment(text, sourcePath): Fragment` — splits `---` frontmatter, parses with `yaml`, validates, returns trimmed body.
  - `getSections(body): Map<string, string>` — `## Heading` → content (used for architecture `Summary`/`Map` and workflow sections).
  - Errors are `AgentInitError` with messages like `registry/libraries/zustand.md: globs[1]: brace patterns are not allowed`.

## Out of scope
- Reading files from disk or walking the registry (T05).
- Body content checks like line count or directive keywords (T08).
- Placeholder rendering (T07).

## Implementation notes
- Use zod's discriminated union on `category` (rules vs. workflow) so types narrow cleanly.
- Treat a missing or unterminated frontmatter block as an error, not an empty object.
- Format zod issues into one readable line per issue (`path: message`).

## Acceptance criteria
- [ ] The PRD §4.4 example fragment parses successfully.
- [ ] Each of these is rejected with the file and field in the message: brace glob, `scope: glob` without `globs`, `scope: always` with `globs`, invalid semver range in `appliesTo`, bad `verifiedAt`, missing `sources`, unknown key, workflow with `scope`.
- [ ] `getSections` returns `Summary` and `Map` for an architecture-style body and ignores `###` subheadings as section boundaries.
- [ ] Types narrow: after checking `meta.category === 'workflow'`, `meta.scope` is a type error.

## Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Commit
`feat(registry): add fragment frontmatter schema and parser`

## Notes
_Record decisions and discovered gaps here._
