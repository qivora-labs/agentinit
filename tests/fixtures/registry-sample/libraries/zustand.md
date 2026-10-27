---
id: zustand
name: Zustand
category: library
version: 1.0.0
order: 40
description: Small client-side state.
scope: glob
globs:
  - "{{src}}**/*.ts"
  - "{{src}}**/*.tsx"
detect:
  packages: ["zustand"]
requires:
  - typescript-strict
conflictsWith:
  - layered
compatibleWith:
  - nextjs-app-router
sources:
  - https://zustand.docs.pm/learn/getting-started/introduction
verifiedAt: 2026-10-17
---

## Boundary
Client stores stay out of Server Components.

NEVER import a client store into a Server Component.

```ts
const example = true;
```
