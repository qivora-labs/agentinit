---
id: tailwind
name: Tailwind CSS
category: library
version: 1.0.0
order: 40
description: CSS-first tokens, complete class strings, and cn for conflicting utilities.
scope: glob
globs:
  - "{{src}}**/*.tsx"
  - "{{src}}**/*.css"
detect:
  packages: ["tailwindcss"]
appliesTo:
  tailwindcss: ">=4"
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
  - react-vite
sources:
  - https://tailwindcss.com/docs/functions-and-directives
  - https://tailwindcss.com/docs/theme
  - https://tailwindcss.com/docs/upgrade-guide
  - https://tailwindcss.com/docs/detecting-classes-in-source-files
  - https://github.com/shadcn-ui/cn
verifiedAt: 2026-10-28
---

## Boundary
These rules apply to Tailwind classes in components and to the CSS file that loads Tailwind. v4 reads configuration from that CSS. The scanner treats source as plain text and emits a utility only when the full class name appears. When the project already has `cn`, that helper joins conditional classes and lets a later utility replace an earlier one in the same group.

## Directives
- **ALWAYS** load Tailwind with `@import "tailwindcss"`. **NEVER** use `@tailwind base`, `@tailwind components`, or `@tailwind utilities`.
- **ALWAYS** define a new design token in `@theme`, such as `--color-mint-500`. **NEVER** add a `tailwind.config.js` for new tokens. `@config` only points at a JS config the project already has.
- **ALWAYS** write the full class string (`text-red-600`). **NEVER** build a class by joining a prefix to a value (`text-${color}-600`).
- When the project already has `cn`, **ALWAYS** pass conditional or overlapping utilities through it, base classes first and the override last. Import `cn` from the module the project already uses. **NEVER** import `cn` from a module the project does not have.

## Contract
```tsx
// Import cn from the module this project already uses.
import { cn } from "@/lib/utils";

export function Banner({ error, className }: { error: boolean; className?: string }) {
  return <p className={cn("px-3 text-green-600", error && "text-red-600", className)}>Saved</p>;
}

// ❌ Anti-pattern: the full class never appears, so Tailwind emits nothing
export function Bad({ error }: { error: boolean }) {
  const color = error ? "red" : "green";
  return <p className={`text-${color}-600`}>Saved</p>;
}
```
