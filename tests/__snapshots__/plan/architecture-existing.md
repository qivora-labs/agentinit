# ARCHITECTURE.md

Describes the folders that exist today and the conventions for new code. Existing files stay where they are.

## Layout

| Folder | Responsibility |
| :--- | :--- |
| `src/application` | Use cases. |
| `src/domain` | Business rules. |
| `src/presentation` | UI and delivery. |

## Other existing folders

These folders are already in the project:

- `src/lib`

## Conventions for new code

- **ALWAYS** depend inward.
- **NEVER** import infrastructure from domain.
