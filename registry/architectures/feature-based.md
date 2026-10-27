---
id: feature-based
name: Feature-Based
category: architecture
version: 1.0.0
order: 10
description: Feature folders with a public index, and shared code that does not depend on a feature.
scope: always
sources:
  - https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
verifiedAt: 2026-10-28
---

## Summary
- Put new code for one product area in `{{src}}features/<feature>/`.
- Export that feature's public API from `{{src}}features/<feature>/index.ts`.
- Import another feature only from its `index.ts`.
- Put code used by more than one feature in `{{src}}shared/`, or in the shared folder the project already uses.
- Keep shared code free of imports from `{{src}}features/`.

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}features/<feature>/` | One product feature. Add only the folders that feature uses. |
| `{{src}}features/<feature>/components/` | UI used only by this feature. |
| `{{src}}features/<feature>/hooks/` | Hooks used only by this feature. |
| `{{src}}features/<feature>/api/` | Requests and handlers for this feature. |
| `{{src}}features/<feature>/model/` | State and domain types for this feature. |
| `{{src}}features/<feature>/index.ts` | The only module other features may import. |
| `{{src}}shared/` | Code used by more than one feature. A framework folder that already holds that code (for example `{{src}}components/`) has the same role. |

## Boundary
New work for one product area lives under `{{src}}features/<feature>/`. Code used by more than one feature lives in `{{src}}shared/`, or in the framework folder that already holds shared code. Files inside a feature import their siblings by path. Another feature may import only `index.ts`.

## Directives
- **ALWAYS** add a new feature at `{{src}}features/<feature>/` and export its public API from `index.ts`.
- **ALWAYS** import another feature from `{{src}}features/<feature>/index.ts` only.
- **ALWAYS** import a file in the same feature by that file's path.
- **NEVER** import another feature's `components/`, `hooks/`, `api/`, or `model/`.
- **NEVER** import from `{{src}}features/` in `{{src}}shared/` or in the folder that already holds shared code.
- **PREFER** omitting a feature subfolder the feature does not use.

## Contract
```ts
// ✅ Good: {{src}}features/billing/charge.ts imports the invoices public API
import { getInvoice } from '../invoices';

// ❌ Anti-pattern: {{src}}features/billing/charge.ts reaches into an invoices internal module
import { getInvoice } from '../invoices/api/get-invoice';

// ❌ Anti-pattern: {{src}}shared/format.ts depends on a feature
import type { Invoice } from '../features/invoices';
```
