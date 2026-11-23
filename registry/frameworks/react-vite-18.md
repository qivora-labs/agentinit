---
id: react-vite-18
name: React + Vite 18
category: framework
version: 1.0.0
order: 30
description: React 18 hooks at the top level, public Vite env vars, and lazy-loaded components.
hint: react 18.x · hooks, Vite env, lazy load
scope: auto
globs:
  - "{{src}}**/*.tsx"
detect:
  packages: ["react", "vite"]
appliesTo:
  react: ">=18 <19"
  vite: ">=5"
sources:
  - https://18.react.dev/reference/rules/rules-of-hooks
  - https://18.react.dev/reference/react/useContext
  - https://18.react.dev/reference/react/lazy
  - https://v5.vite.dev/guide/env-and-mode
  - https://v5.vite.dev/config/shared-options
verifiedAt: 2026-11-23
---
## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}components/` | React components. |
| `{{src}}hooks/` | React hooks. |

## Boundary
These rules apply to React 18 components bundled by Vite. Every Hook runs at the top level of a component or custom Hook—never inside a condition, loop, or after an early return. A name that starts with `VITE_` is inlined into the client bundle as a string. `lazy` loads a component's default export the first time that component renders.

## Directives
- **ALWAYS** call a React Hook at the top level of a component or another Hook, before any early return. **NEVER** call a Hook inside a condition, loop, nested function, event handler, or `try`/`catch`.
- **ALWAYS** read context with `useContext` at the top level. **NEVER** call `useContext` after a conditional return.
- **ALWAYS** read a public build value from `import.meta.env.VITE_*`. The value is a string. **NEVER** put a secret in a `VITE_` variable, and **NEVER** set Vite `envPrefix` to an empty string.
- **ALWAYS** call `lazy` at module scope on a default export, and render that component under `<Suspense>`. **NEVER** call `lazy` inside a component.

## Contract
```tsx
// ✅ Good: hooks at top level, public env string, lazy at module scope
const ThemeContext = createContext<string | null>(null);
const Preview = lazy(() => import('./Preview'));

export function Title({ show }: { show: boolean }) {
  const name = useContext(ThemeContext);
  if (!show) return null;
  return (
    <Suspense fallback="Loading">
      <Preview title={name ?? import.meta.env.VITE_APP_TITLE} />
    </Suspense>
  );
}

// ❌ Anti-pattern: hook after early return, lazy during render, secret behind public prefix
export function Bad({ show }: { show: boolean }) {
  if (!show) return null;
  const name = useContext(ThemeContext);
  const Chart = lazy(() => import('./Chart'));
  return <Chart token={import.meta.env.VITE_SECRET} />;
}
```

```jsx
// ✅ Good: hooks at top level, public env string, lazy at module scope
const ThemeContext = createContext(null);
const Preview = lazy(() => import('./Preview'));

export function Title({ show }) {
  const name = useContext(ThemeContext);
  if (!show) return null;
  return (
    <Suspense fallback="Loading">
      <Preview title={name ?? import.meta.env.VITE_APP_TITLE} />
    </Suspense>
  );
}

// ❌ Anti-pattern: hook after early return, lazy during render, secret behind public prefix
export function Bad({ show }) {
  if (!show) return null;
  const name = useContext(ThemeContext);
  const Chart = lazy(() => import('./Chart'));
  return <Chart token={import.meta.env.VITE_SECRET} />;
}
```
