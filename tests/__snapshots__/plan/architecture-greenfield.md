# ARCHITECTURE.md

Describes the planned layout and the conventions for new code.

## Planned layout

| Path | Responsibility |
| :--- | :--- |
| `src/domain/` | Business rules. |
| `src/application/` | Use cases. |
| `src/infrastructure/` | I/O adapters. |
| `src/presentation/` | UI and delivery. |

## Conventions for new code

- **ALWAYS** depend inward.
- **NEVER** import infrastructure from domain.
