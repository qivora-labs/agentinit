---
id: react-vite
name: React + Vite
category: framework
version: 1.0.0
order: 30
description: React 19 actions and use, public Vite env vars, and lazy-loaded components.
scope: auto
globs:
  - "{{src}}**/*.tsx"
detect:
  packages: ["react", "vite"]
appliesTo:
  react: ">=19"
  vite: ">=6"
sources:
  - https://react.dev/reference/react/use
  - https://react.dev/reference/react/useActionState
  - https://react.dev/reference/react/lazy
  - https://react.dev/blog/2024/12/05/react-19
  - https://vite.dev/guide/env-and-mode
  - https://vite.dev/config/shared-options
verifiedAt: 2026-10-28
---

## Boundary
These rules apply to React components bundled by Vite. Hooks other than `use` stay at the top level of a component. `use` may run inside a condition or a loop. A name that starts with `VITE_` is inlined into the client bundle as a string. `lazy` loads a component's default export the first time that component renders.

## Directives
- **ALWAYS** call a React Hook at the top level of a component or another Hook. **PREFER** `use(SomeContext)` when the read is inside a condition or a loop.
- **NEVER** pass `use` a Promise created during render. Reuse one cached Promise and read it under `<Suspense>`. **NEVER** call `use` inside `try/catch`.
- **ALWAYS** run a mutation that is an Action from `<form action>` or from `startTransition`. **PREFER** `useActionState` when the UI needs the Action result and the pending flag.
- **ALWAYS** read a public build value from `import.meta.env.VITE_*`. The value is a string. **NEVER** put a secret in a `VITE_` variable, and **NEVER** set Vite `envPrefix` to an empty string.
- **ALWAYS** call `lazy` at module scope on a default export, and render that component under `<Suspense>`. **NEVER** call `lazy` inside a component.

## Contract
```tsx
// ✅ Good: conditional use, public env string, lazy at module scope
const ThemeContext = createContext<string | null>(null);
const Preview = lazy(() => import('./Preview'));

export function Title({ show }: { show: boolean }) {
  if (!show) return null;
  const name = use(ThemeContext);
  return (
    <Suspense fallback="Loading">
      <Preview title={name ?? import.meta.env.VITE_APP_TITLE} />
    </Suspense>
  );
}

// ❌ Anti-pattern: lazy during render, and a secret behind the public prefix
export function Bad() {
  const Chart = lazy(() => import('./Chart'));
  return <Chart token={import.meta.env.VITE_SECRET} />;
}
```
