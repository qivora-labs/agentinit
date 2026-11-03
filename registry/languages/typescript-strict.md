---
id: typescript-strict
name: TypeScript Strict
category: language
version: 1.0.0
order: 20
description: No any, explicit exported return types, and exhaustive unions on every TypeScript file.
scope: always
sources:
  - https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any
  - https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#return-type-annotations
  - https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#non-null-assertion-operator-postfix-
  - https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
  - https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator
  - https://www.typescriptlang.org/tsconfig/strict.html
verifiedAt: 2026-11-03
---

## Boundary
These rules apply to every `.ts` and `.tsx` file. The project typechecks with `strict` enabled. `unknown` is the top type for a value that is not yet checked. `any` turns checking off for that value.

## Directives
- **NEVER** use the `any` type. **ALWAYS** hold an unchecked value as `unknown` and narrow it before property access, a call, or assignment to a specific type.
- **ALWAYS** write an explicit return type on every exported function, including small helpers (`parse*`, `safeParse` wrappers, schema mappers, and React components). **PREFER** inference for a function that is not exported.
- **NEVER** use the postfix `!` non-null assertion. Narrow `null` and `undefined` with a check.
- **ALWAYS** check a config object literal with `satisfies` when the variable should keep its specific property types.
- **PREFER** a discriminated union (a shared literal field such as `status`) over a boolean plus optional fields.
- **ALWAYS** finish a `switch` on that discriminant with a `default` that assigns the value to `never`.
- **ALWAYS** use `import type` for a binding used only as a type. **NEVER** use `import type` for a value you call, construct, or extend.
- **NEVER** set `strict` or `strictNullChecks` to `false`.

## Contract
```ts
// ✅ Good: unknown is narrowed, exports name their return types, config keeps its own types
import type { InvoiceId } from './ids';

type Invoice =
  | { status: 'open'; id: InvoiceId; total: number }
  | { status: 'paid'; id: InvoiceId; total: number; paidOn: string };

type ParseAmountResult =
  | { success: true; data: number }
  | { success: false; error: string };

type RGB = [red: number, green: number, blue: number];
type ThemeName = 'danger' | 'ok';

export const theme = {
  danger: [255, 0, 0],
  ok: '#00ff00',
} satisfies Record<ThemeName, string | RGB>;

export function parseAmount(input: unknown): ParseAmountResult {
  if (typeof input !== 'number') return { success: false, error: 'Expected a number' };
  return { success: true, data: input };
}

export function label(invoice: Invoice): string {
  switch (invoice.status) {
    case 'open':
      return 'Open';
    case 'paid':
      return invoice.paidOn;
    default: {
      const unexpected: never = invoice;
      throw new Error(`Unhandled invoice: ${String(unexpected)}`);
    }
  }
}

// ❌ Anti-pattern: any, a boolean flag, a non-null assertion, and a missing export return type
type Loose = { paid: boolean; paidOn?: string };
export function paidOn(invoice: Loose, input: any) {
  return invoice.paidOn!.slice(0, input.total);
}
```
