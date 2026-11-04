---
id: nextjs-app-router
name: Next.js App Router
category: framework
version: 1.0.0
order: 30
description: React Server Components by default.
hint: Sample picker hint.
scope: glob
globs:
  - "{{src}}app/**/*.ts"
  - "{{src}}app/**/*.tsx"
detect:
  packages: ["next"]
appliesTo:
  next: ">=15"
sources:
  - https://nextjs.org/docs/app
verifiedAt: 2026-10-17
---

## Summary
Server Components by default, with client leaves for interaction.

ALWAYS keep client components at the leaves.

```tsx
const example = true;
```
