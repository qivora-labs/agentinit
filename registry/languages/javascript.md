---
id: javascript
name: JavaScript
category: language
version: 1.0.0
order: 20
description: Follow the project's module system, keep TypeScript syntax out of .js files, and check external input at runtime.
hint: No TS syntax in .js; check input at runtime
scope: always
sources:
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules/Modules_across_platforms
  - https://nodejs.org/docs/latest/api/modules.html
verifiedAt: 2026-11-14
---

## Boundary
These rules apply to every `.js` and `.jsx` file. Match the project's module system (ES modules or CommonJS) from the nearest `package.json` `"type"` field and existing import style. Values that enter from outside the program (`JSON.parse`, request bodies, messages) are checked before their properties are read.

## Directives
- **ALWAYS** follow the project's module system (ES modules or CommonJS). Use `import`/`export` when `"type": "module"` or the file is `.mjs`; use `require`/`module.exports` when the package is CommonJS or the file is `.cjs`.
- **NEVER** write TypeScript-only syntax in `.js` or `.jsx` files (type annotations, `interface`, `type` aliases, enums, non-null assertions, or `import type`).
- **ALWAYS** check a value from outside the program with a runtime test before property access, a call, or treating it as a specific shape.
- **NEVER** trust the shape of `JSON.parse` results, request bodies, or message payloads without that check.

## Contract
```js
// ✅ Good: runtime check before property access; ESM matches package "type": "module"
export function amount(input) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}

// ❌ Anti-pattern: TypeScript syntax in a .js file; unchecked external input
export function total(input: any): number {
  return input.total;
}
```
