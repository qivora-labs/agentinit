---
id: typescript
name: TypeScript
category: language
version: 1.0.0
order: 20
description: Avoid any, infer internal types, and narrow unknown at the boundary of every TypeScript file.
hint: Avoid any; narrow unknown at boundaries
scope: always
sources:
  - https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any
  - https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#return-type-annotations
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
verifiedAt: 2026-10-28
---

## Boundary
These rules apply to every `.ts` and `.tsx` file. Local variables and functions that are not exported take their types from inference. Values that enter from outside the program (`JSON.parse`, request bodies, messages) are checked before their properties are read.

## Directives
- **PREFER** `unknown` over `any` for a value whose type is not yet known.
- **ALWAYS** narrow `unknown` from outside the program with a type guard before property access, a call, or assignment to a specific type.
- **NEVER** annotate a value as `any` to silence a type error.
- **PREFER** inference for the types of locals and of functions that are not exported.
- **ALWAYS** use `import type` for a binding used only as a type. **NEVER** use `import type` for a value you call, construct, or extend.

## Contract
```ts
// ✅ Good: external input is unknown, and a type-only import is erased
import type { Invoice } from './invoice';

export function amount(input: unknown) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}

function same(invoice: Invoice) {
  return invoice;
}

// ❌ Anti-pattern: any used to silence a type error
export function total(input: any) {
  return input.total;
}
```
