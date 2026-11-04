---
id: shadcn
name: shadcn/ui
category: library
version: 1.0.0
order: 40
description: Project-owned UI primitives, extended with variants instead of rewrites.
hint: Owned UI primitives; extend with variants
scope: auto
globs:
  - "{{src}}components/ui/**/*.ts"
  - "{{src}}components/ui/**/*.tsx"
detect:
  files: ["components.json"]
requires:
  - tailwind
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
  - react-vite
sources:
  - https://ui.shadcn.com/docs/components-json
  - https://ui.shadcn.com/docs/installation/manual
  - https://ui.shadcn.com/docs/components/button
  - https://ui.shadcn.com/docs/changelog/2023-06-new-cli
verifiedAt: 2026-10-28
---

## Boundary
shadcn/ui copies component source into this project. `components.json` field `aliases.ui` is the import alias for that folder. The usual value is `@/components/ui`. Import a primitive from that alias. A missing primitive is added by a person.

## Directives
- **ALWAYS** import a primitive from the project's UI alias, such as `@/components/ui/button`. **NEVER** import a component from a `shadcn/ui` package path.
- **ALWAYS** add a look that more than one screen uses as a new entry on that primitive's variant map (`buttonVariants`, `variant`, `size`). **NEVER** rewrite the primitive's markup or base classes for one screen.
- **ALWAYS** pass a one-off style with `className`. The primitive merges it with `cn`.
- **NEVER** run a command that downloads a component. Name the missing primitive and leave it for the developer.

## Contract
```tsx
import { Button, buttonVariants } from "@/components/ui/button";

export function Save() {
  return <Button variant="outline" className="w-full">Save</Button>;
}

export function SaveLink() {
  return <a className={buttonVariants({ variant: "outline" })} href="/saved">Saved</a>;
}

// ❌ Anti-pattern: a one-off copy of the primitive
export function SaveButton() {
  return <button className="border bg-background">Save</button>;
}
```
