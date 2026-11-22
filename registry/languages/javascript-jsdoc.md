---
id: javascript-jsdoc
name: JavaScript with JSDoc
category: language
version: 1.1.0
order: 20
description: JavaScript rules plus JSDoc type tags that hold when checkJs is on.
hint: JSDoc @param/@returns on exports; no TS syntax
scope: always
sources:
  - https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
  - https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html
  - https://www.typescriptlang.org/tsconfig/checkJs.html
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
  - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules/Modules_across_platforms
  - https://nodejs.org/docs/latest/api/modules.html
verifiedAt: 2026-11-22
---

## Boundary
These rules apply to every `.js` and `.jsx` file. The project typechecks JavaScript with `checkJs` (or `// @ts-check`). Prefer one module system across the project; do not mix `import` and `require` in the same package. Values that enter from outside the program are checked at runtime; exported APIs also carry JSDoc types so editors and `checkJs` can catch inventing the wrong shape.

## Directives
- **ALWAYS** treat this project's module system as {{moduleSystem}}. Use `import`/`export` for ES modules or `.mjs` files; use `require`/`module.exports` for CommonJS or `.cjs` files.
- **NEVER** write TypeScript-only syntax in `.js` or `.jsx` files (type annotations, `interface`, `type` aliases, enums, non-null assertions, or `import type`). Put types in JSDoc instead.
- **ALWAYS** annotate every exported function with `@param` (typed) for each parameter and `@returns` (typed) for the result, using forms TypeScript supports under `checkJs`.
- **ALWAYS** check a value from outside the program with a runtime test before property access, a call, or treating it as a specific shape. **PREFER** `@type` / `@typedef` on locals that hold that narrowed value when the shape is reused.
- **NEVER** trust the shape of `JSON.parse` results, request bodies, or message payloads without that check.

## Contract
```js
// ✅ Good: JSDoc types for checkJs; runtime check; match this project's module system
/**
 * @param {unknown} input
 * @returns {number}
 */
export function amount(input) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}

/**
 * @param {unknown} input
 * @returns {number}
 */
function amountCjs(input) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}
module.exports = { amount: amountCjs };

/**
 * @typedef {Object} Invoice
 * @property {number} total
 */

/**
 * @param {Invoice} invoice
 * @returns {number}
 */
export function invoiceTotal(invoice) {
  return invoice.total;
}

// ❌ Anti-pattern: no JSDoc on exports; TypeScript syntax; unchecked input
export function total(input: any): number {
  return input.total;
}
```
