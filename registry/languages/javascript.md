---
id: javascript
name: JavaScript
category: language
version: 1.1.0
order: 20
description: Follow the project's module system, keep TypeScript syntax out of .js files, and check external input at runtime.
hint: No TS syntax in .js; check input at runtime
scope: always
sources:
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules/Modules_across_platforms
  - https://nodejs.org/docs/latest/api/modules.html
verifiedAt: 2026-11-22
---

## Boundary
These rules apply to every `.js` and `.jsx` file. Prefer one module system across the project; do not mix `import` and `require` in the same package. Values that enter from outside the program (`JSON.parse`, request bodies, messages) are checked before their properties are read.

## Directives
- **ALWAYS** treat this project's module system as {{moduleSystem}}. Use `import`/`export` for ES modules or `.mjs` files; use `require`/`module.exports` for CommonJS or `.cjs` files.
- **NEVER** write TypeScript-only syntax in `.js` or `.jsx` files (type annotations, `interface`, `type` aliases, enums, non-null assertions, or `import type`).
- **ALWAYS** check a value from outside the program with a runtime test before property access, a call, or treating it as a specific shape.
- **NEVER** trust the shape of `JSON.parse` results, request bodies, or message payloads without that check.

## Contract
```js
// ✅ Good: runtime check before property access; match this project's module system
// ES modules / .mjs:
export function amount(input) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}

// CommonJS / .cjs:
function amountCjs(input) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}
module.exports = { amount: amountCjs };

// ❌ Anti-pattern: TypeScript syntax in a .js file; unchecked external input
export function total(input: any): number {
  return input.total;
}
```
