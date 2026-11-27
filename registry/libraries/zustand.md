---
id: zustand
name: Zustand
category: library
version: 1.4.0
order: 40
description: Small client stores, stable selectors, and useShallow.
hint: Small stores, stable selectors, useShallow
scope: auto
globs:
  - "{{src}}**/stores/**/*.ts"
  - "{{src}}**/stores/**/*.tsx"
  - "{{src}}**/features/**/stores/**/*.ts"
  - "{{src}}**/features/**/stores/**/*.tsx"
  - "{{src}}**/*.store.ts"
  - "{{src}}**/*.store.tsx"
detect:
  packages: ["zustand"]
appliesTo:
  zustand: ">=4.4.3"
compatibleWith:
  - nextjs-app-router
  - nextjs-app-router-15
  - nextjs-pages-router
  - react-vite
  - react-vite-18
sources:
  - https://github.com/pmndrs/zustand
  - https://zustand.docs.pmnd.rs/reference/hooks/use-shallow
  - https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5
verifiedAt: 2026-11-27
---
## Boundary
A Zustand store holds one client concern and the actions that change it. `create` compares a selector result with `Object.is`. A new object or array is a new result on every run (extra re-renders; in v5 that can update forever). Prefer `useShallow` from `zustand/react/shallow` (Zustand 4.4.3+) so a shallow match keeps the previous result. Globs such as `stores/**` and `*.store.{{ext}}` only decide where these rules load — they are not a request to create a top-level `stores/` folder.

## Directives
- **ALWAYS** keep a store to one concern, and define its actions in the same `create` call. **NEVER** cache an API response in the store.
- **ALWAYS** place a **new** store file under this project's architecture map (for flat: `{{src}}features/<feature>/` or next to its UI under `{{src}}components/`). **NEVER** add a top-level `{{src}}stores/` directory for new Zustand files.
- **ALWAYS** select one field when the component needs one value: `(state) => state.count`.
- **ALWAYS** wrap a selector that returns a new object or array in `useShallow`. **NEVER** pass a custom equality function as the second argument of a hook from `create`. That argument belongs to `createWithEqualityFn`.
- **NEVER** return a new function from a selector. Keep a fallback function in module scope.

## Contract
```tsx
// {{src}}features/cart/cart.store.{{ext}}
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

// ❌ Anti-pattern: top-level {{src}}stores/ for a new file; new array every render
export function Bad() {
  const [count, add] = useCartStore((state) => [state.count, state.add]);
  return <button onClick={add}>{count}</button>;
}
```

```jsx
// {{src}}features/cart/cart.store.{{ext}}
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export const useCartStore = create((set) => ({
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

// ❌ Anti-pattern: top-level {{src}}stores/ for a new file; new array every render
export function Bad() {
  const [count, add] = useCartStore((state) => [state.count, state.add]);
  return <button onClick={add}>{count}</button>;
}
```
