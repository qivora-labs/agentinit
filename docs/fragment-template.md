---
id: example-lib
name: Example Lib
category: library
version: 1.0.0
order: 40
description: One line shown in pickers and used for description-based activation.
scope: glob
globs:
  - "{{src}}**/*.ts"
  - "{{src}}**/*.tsx"
detect:
  packages: ["example-lib"]
appliesTo:
  example-lib: ">=1"
compatibleWith:
  - nextjs-app-router
  - react-vite
sources:
  - https://example.com/docs
verifiedAt: 2026-11-03
---

## Boundary
Say where this guidance applies and how modules that use the library interact. Be specific to this library, not generic advice.

## Directives
- **ALWAYS** do the required pattern agents must follow.
- **NEVER** do the failure mode agents commonly invent.
- **PREFER** the recommended alternative when both options are valid.
- **DEFAULT** to the usual choice when the agent would otherwise guess.
- **ALWAYS** export the public API from `index.{{ext}}`.
- **ALWAYS** use a TypeScript-only API such as `z.infer`. <!-- agentinit:typescript-only -->

## Contract
```ts
// ✅ Good: short, verifiable TypeScript example
export function ok(): void {}

// ❌ Anti-pattern: the mistake this fragment exists to prevent
export function bad(): any {}
```

```js
// ✅ Good: short, verifiable JavaScript example
export function ok() {}

// ❌ Anti-pattern: the mistake this fragment exists to prevent
export function bad() {}
```

<!--
Copy to registry/<category>/<id>.md (file name = id).

Categories: architectures | languages | frameworks | libraries | workflows
Default scope: architecture/language → always; framework/library → glob or auto.
Workflows: omit scope/globs; use ## Purpose, ## Input, ## Steps, ## Output, ## Guardrails.
Architecture: also add ## Summary (≤ 10 lines) and ## Map.
Rules: each rendered language variant ≤ 120 lines; workflows ≤ 60.
Globs: one pattern per extension; no braces; no commas; use {{src}}.
Dual examples: put ```ts / ```tsx and ```js / ```jsx fences in the same ## Contract.
  Until a JS example exists, put <!-- agentinit:typescript-only --> on its own line
  (usually first body line). TypeScript-only directives end with the same marker.
Prose file names: {{ext}} → ts|js, {{jsxExt}} → tsx|jsx.
Bump fragment version (minor) when adding a JavaScript example.
Then run: pnpm registry:check
-->
