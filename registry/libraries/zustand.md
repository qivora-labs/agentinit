---
id: zustand
name: Zustand
category: library
version: 1.0.0
order: 40
description: Small client stores, stable selectors, and useShallow.
hint: Small stores, stable selectors, useShallow
scope: auto
globs:
  - "{{src}}**/stores/**/*.ts"
  - "{{src}}**/stores/**/*.tsx"
  - "{{src}}**/*.store.ts"
  - "{{src}}**/*.store.tsx"
detect:
  packages: ["zustand"]
appliesTo:
  zustand: ">=5"
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
  - react-vite
sources:
  - https://github.com/pmndrs/zustand
  - https://zustand.docs.pmnd.rs/reference/hooks/use-shallow
  - https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5
verifiedAt: 2026-10-28
---

## Boundary
A Zustand store holds one client concern and the actions that change it. `create` compares a selector result with `Object.is`. A new object or array is a new result on every run, and in v5 that can update forever. `useShallow` from `zustand/react/shallow` keeps the previous result when a shallow compare matches.

## Directives
- **ALWAYS** keep a store to one concern, and define its actions in the same `create` call. **NEVER** cache an API response in the store.
- **ALWAYS** select one field when the component needs one value: `(state) => state.count`.
- **ALWAYS** wrap a selector that returns a new object or array in `useShallow`. **NEVER** pass a custom equality function as the second argument of a hook from `create`. That argument belongs to `createWithEqualityFn`.
- **NEVER** return a new function from a selector. Keep a fallback function in module scope.

## Contract
```tsx
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

type CartState = {
  count: number;
  add: () => void;
};

export const useCartStore = create<CartState>()((set) => ({
  count: 0,
  add: () => set((state) => ({ count: state.count + 1 })),
}));

export function CartCount() {
  const count = useCartStore((state) => state.count);
  return <span>{count}</span>;
}

export function CartButton() {
  const { count, add } = useCartStore(
    useShallow((state) => ({ count: state.count, add: state.add })),
  );
  return <button onClick={add}>{count}</button>;
}

// ❌ Anti-pattern: a new array every render, which can loop in v5
export function Bad() {
  const [count, add] = useCartStore((state) => [state.count, state.add]);
  return <button onClick={add}>{count}</button>;
}
```
