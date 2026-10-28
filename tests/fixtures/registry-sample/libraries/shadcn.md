---
id: shadcn
name: shadcn/ui
category: library
version: 1.0.0
order: 40
description: Accessible components from a local registry.
scope: glob
globs:
  - "{{src}}components/ui/**/*.ts"
  - "{{src}}components/ui/**/*.tsx"
detect:
  packages: ["tailwindcss", "class-variance-authority"]
  files: ["components.json", "src/components/ui/button.tsx"]
requires:
  - tailwind
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
sources:
  - https://ui.shadcn.com/docs
verifiedAt: 2026-10-17
---

## Boundary
Generated components live under components/ui.

ALWAYS keep generated components under components/ui.

```tsx
const example = true;
```
