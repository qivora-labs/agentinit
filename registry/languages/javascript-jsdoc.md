---
id: javascript-jsdoc
name: JavaScript with JSDoc
category: language
version: 1.0.0
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
verifiedAt: 2026-11-14
---

## Boundary
These rules apply to every `.js` and `.jsx` file. The project typechecks JavaScript with `checkJs` (or `// @ts-check`). Match the project's module system (ES modules or CommonJS). Values that enter from outside the program are checked at runtime; exported APIs also carry JSDoc types so editors and `checkJs` can catch inventing the wrong shape.

## Directives
- **ALWAYS** follow the project's module system (ES modules or CommonJS). Use `import`/`export` when `"type": "module"` or the file is `.mjs`; use `require`/`module.exports` when the package is CommonJS or the file is `.cjs`.
- **NEVER** write TypeScript-only syntax in `.js` or `.jsx` files (type annotations, `interface`, `type` aliases, enums, non-null assertions, or `import type`). Put types in JSDoc instead.
- **ALWAYS** annotate every exported function with `@param` (typed) for each parameter and `@returns` (typed) for the result, using forms TypeScript supports under `checkJs`.
- **ALWAYS** check a value from outside the program with a runtime test before property access, a call, or treating it as a specific shape. **PREFER** `@type` / `@typedef` on locals that hold that narrowed value when the shape is reused.
- **NEVER** trust the shape of `JSON.parse` results, request bodies, or message payloads without that check.
- **NEVER** leave an exported function without `@param` / `@returns` when agents would otherwise invent parameter or return types.

## Contract
```js
// ✅ Good: JSDoc types for checkJs; runtime check before property access
/**
 * @param {unknown} input
 * @returns {number}
 */
export function amount(input) {
  if (typeof input !== 'number') throw new Error('Expected a number');
  return input;
}

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

