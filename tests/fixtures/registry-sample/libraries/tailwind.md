---
id: tailwind
name: Tailwind CSS
category: library
version: 1.0.0
order: 40
description: Utility-first styling.
scope: glob
globs:
  - "{{src}}**/*.css"
detect:
  packages: ["tailwindcss"]
appliesTo:
  tailwindcss: ">=4"
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
sources:
  - https://tailwindcss.com/docs
verifiedAt: 2026-10-17
---

## Boundary
Utility classes stay in component markup.
