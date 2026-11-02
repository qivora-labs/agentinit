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

## Contract
```ts
// ✅ Good: short, verifiable example
export function ok(): void {}

// ❌ Anti-pattern: the mistake this fragment exists to prevent
export function bad(): any {}
```

<!--
Copy to registry/<category>/<id>.md (file name = id).

Categories: architectures | languages | frameworks | libraries | workflows
Default scope: architecture/language → always; framework/library → glob or auto.
Workflows: omit scope/globs; use ## Purpose, ## Input, ## Steps, ## Output, ## Guardrails.
Architecture: also add ## Summary (≤ 10 lines) and ## Map.
Rules: keep the body ≤ 120 lines; workflows ≤ 60.
Globs: one pattern per extension; no braces; no commas; use {{src}}.
Then run: pnpm registry:check
-->
