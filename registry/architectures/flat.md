---
id: flat
name: Flat / Minimal
category: architecture
version: 1.0.0
order: 10
description: Group a small project by file type, and start a feature folder for the next domain.
scope: always
sources:
  - https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
verifiedAt: 2026-10-28
---

## Summary
- Put new components in `{{src}}components/` and new hooks in `{{src}}hooks/`.
- Put new helpers in `{{src}}utils/` and shared types in `{{src}}types/`.
- Keep each new file to one component, one hook, or one helper.
- When a type folder would take on a second domain, add `{{src}}features/<feature>/` for the new domain.

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}components/` | UI modules. Each new file holds one component. |
| `{{src}}hooks/` | Hooks. Each new file holds one hook. |
| `{{src}}utils/` | Helpers with no UI. Each new file holds one helper. |
| `{{src}}types/` | Types shared across those folders. |
| `{{src}}features/<feature>/` | The next domain, once a type folder would mix two domains. New files for that domain go here. |

## Boundary
Use this layout while the project is small enough that each folder holds one kind of file. A second, unrelated domain is the point to add `{{src}}features/<feature>/` for new files of that domain. Files already in the type folders stay in place.

## Directives
- **DEFAULT** to one folder per file type: `components/`, `hooks/`, `utils/`, and `types/` under `{{src}}`.
- **ALWAYS** give a new file a single component, hook, or helper.
- **PREFER** `{{src}}features/<feature>/` for new code once a type folder would mix a second domain.
- **NEVER** put a second domain into `components/`, `hooks/`, `utils/`, or `types/` to avoid a feature folder.

## Contract
```ts
// ✅ Good: one domain, grouped by file type
// {{src}}components/button.ts
// {{src}}hooks/use-theme.ts

// ❌ Anti-pattern: components/ mixing invoices and comments
// {{src}}components/invoice-table.ts
// {{src}}components/comment-thread.ts
```
