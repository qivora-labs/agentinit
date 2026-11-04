---
id: nextjs-pages-router
name: Next.js Pages Router
category: framework
version: 1.0.0
order: 30
description: Page-based Next.js routing.
hint: Sample picker hint.
scope: glob
globs:
  - "{{src}}pages/**/*.ts"
  - "{{src}}pages/**/*.tsx"
detect:
  packages: ["next"]
appliesTo:
  next: ">=15"
sources:
  - https://nextjs.org/docs/pages
verifiedAt: 2026-10-17
---

## Summary
Pages Router conventions for Next.js.

ALWAYS keep page data loading in the page module.

```tsx
const example = true;
```
