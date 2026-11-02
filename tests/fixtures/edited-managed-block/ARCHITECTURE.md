<!-- agentinit:begin id=architecture -->
# ARCHITECTURE.md

Describes the folders that exist today and the conventions for new code. Existing files stay where they are.

## Layout

None of the detected folders match a row in the architecture map.

## Other existing folders

These folders are already in the project:

- `src/app`

## Conventions for new code

- **DEFAULT** to one folder per file type: `components/`, `hooks/`, `utils/`, and `types/` under `src/`.
- **ALWAYS** give a new file a single component, hook, or helper.
- **PREFER** `src/features/<feature>/` for new code once a type folder would mix a second domain.
- **NEVER** put a second domain into `components/`, `hooks/`, `utils/`, or `types/` to avoid a feature folder.
<!-- agentinit:end id=architecture -->
