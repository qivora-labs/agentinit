---
id: modular
name: Modular / By Concern
category: architecture
version: 1.1.0
order: 10
description: One top-level folder per concern, shared contracts at the source root, and no import cycles.
hint: One folder per concern; deps in ARCHITECTURE.md
scope: always
sources:
  - https://docs.nestjs.com/modules
  - https://docs.nestjs.com/first-steps
  - https://docs.nestjs.com/fundamentals/circular-dependency
  - https://expressjs.com/en/guide/routing.html
  - https://expressjs.com/en/starter/faq.html
verifiedAt: 2026-11-06
---

## Summary
- Put each concern in its own top-level folder under `{{src}}`.
- Put types and contracts shared by more than one concern at the `{{src}}` root.
- Import another concern only through the surface that concern exposes.
- Declare which concerns may import which in `ARCHITECTURE.md`.
- Keep the graph of concern folders free of import cycles.

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}<concern>/` | Owns one concern (pipeline stage, route module, or capability). Name the folder after that concern. What belongs here and which concerns may import it are declared in ARCHITECTURE.md. |

## Boundary
New work for one concern lives under that concern's top-level folder. Types and contracts used by more than one concern live at the `{{src}}` root. Other concerns import only that folder's public surface (its entry module or exported API), not its internals. Which concerns may import which is declared in `ARCHITECTURE.md`. Concern folders do not form import cycles.

## Directives
- **ALWAYS** add a new concern as `{{src}}<concern>/`, named for that concern.
- **ALWAYS** put types and contracts shared by more than one concern at the `{{src}}` root.
- **ALWAYS** follow the dependency directions declared for concerns in `ARCHITECTURE.md`.
- **NEVER** introduce an import cycle between concern folders.
- **NEVER** reach into another concern's internals when that concern exposes a public entry file.
- **PREFER** importing only what `ARCHITECTURE.md` allows for the importing concern.

## Contract
```ts
// ✅ Good: {{src}}handlers/create-user.ts uses a shared type and another concern's public API
import type { UserId } from '../types';
import { createUser } from '../services/users';

export function createUserHandler(id: UserId): Promise<void> {
  return createUser(id);
}

// ❌ Anti-pattern: {{src}}services/users.ts imports a handler (cycle with handlers → services)
import { createUserHandler } from '../handlers/create-user';
```
