# Eval Tasks

Paste each prompt **verbatim** into a fresh agent session. Do not add setup commentary in the session; seed files and packages come from [README.md](./README.md).

Use the **TypeScript** section for the `next15-src` cell and the **JavaScript** appendix for the `next15-src-js` cell. Prompts assume the project root is the eval workdir (`src/app/…`, flat layout).

---

# TypeScript cell

## Seed files (add during fixture setup)

Create these before `init` and before splitting `with-rules` / `without-rules`.

### `src/lib/users-api.ts` (task 4 — secret seam)

Deliberate server-only value so a correct refactor moves the fetch off the client (and stops importing this module into `'use client'` files):

```ts
/** Fixture-only. Treat as a server secret — never import from a Client Component. */
export const USERS_API_KEY = 'fixture-secret-do-not-ship';

export function usersApiPath(userId: string): string {
  return `/api/users/${userId}?key=${USERS_API_KEY}`;
}
```

### `src/components/user-panel.tsx` (task 4)

Deliberately mixes server data fetching with client UI state and imports the secret helper:

```tsx
'use client';

import { useEffect, useState } from 'react';

import { usersApiPath } from '@/lib/users-api';

type User = { id: string; name: string };

export function UserPanel({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetch(usersApiPath(userId))
      .then((res) => res.json())
      .then((data: User) => setUser(data));
  }, [userId]);

  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide' : 'Show'}
      </button>
      {open && user ? <p>{user.name}</p> : null}
    </div>
  );
}
```

### `src/app/users/[id]/page.tsx` (task 4)

Deliberately marks the route as a Client Component and reads `params` without `await`:

```tsx
'use client';

import { UserPanel } from '@/components/user-panel';

export default function UserPage({ params }: { params: { id: string } }) {
  return <UserPanel userId={params.id} />;
}
```

### `src/app/newsletter/page.tsx` (task 1 — incomplete seed)

Started as a Client Component with field rules on `register` and no shared Zod schema. Agents should finish validation and Server Action wiring per project conventions:

```tsx
'use client';

import { useForm } from 'react-hook-form';

import { subscribeNewsletter } from './actions';

type FormValues = { email: string };

export default function NewsletterPage() {
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { email: '' },
  });

  return (
    <main>
      <h1>Newsletter</h1>
      <form
        onSubmit={handleSubmit(async (values) => {
          await subscribeNewsletter(values.email);
        })}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          {...register('email', { required: true, pattern: /.+@.+/ })}
        />
        <button type="submit">Subscribe</button>
      </form>
    </main>
  );
}
```

### `src/app/newsletter/actions.ts` (task 1 — incomplete seed)

Trusts the client string with no schema parse:

```ts
'use server';

export async function subscribeNewsletter(email: string): Promise<void> {
  void email;
}
```

### `src/utils/rates.ts` (task 5 dependency)

Deliberate seam so agents without test rules are tempted to mock the unit or assert call order:

```ts
/** Returns a currency multiplier for the active market. Fixed for the fixture. */
export function loadRate(): number {
  return 1;
}
```

### `src/utils/cart-total.ts` (task 5)

```ts
import { loadRate } from './rates';

export type CartLine = { unitPrice: number; quantity: number; discountPercent?: number };

export function cartTotal(lines: CartLine[]): number {
  const rate = loadRate();
  return lines.reduce((sum, line) => {
    const discount = line.discountPercent ?? 0;
    return sum + line.unitPrice * line.quantity * (1 - discount / 100) * rate;
  }, 0);
}
```

---

## Task 1 — Form + Server Action

**Id:** `T1-form-server-action`

```text
Finish the newsletter signup under the App Router. Seeds already exist at src/app/newsletter/page.tsx and src/app/newsletter/actions.ts.

Requirements:
- Keep a page at /newsletter with an email field and a submit button.
- Submitting the form must call a Server Action that accepts the email.
- Persist is out of scope: the action may no-op after handling the input, but it must be a real Server Action wired to the form.
- Fix validation and Server Action handling to match whatever conventions this repository already documents for forms, validation, and Server Actions.
```

**Fragments in play:** `nextjs-app-router`, `react-hook-form-zod`, `typescript-strict`, `flat`

---

## Task 2 — Client UI store

**Id:** `T2-ui-store`

```text
Add a client-side store for a sidebar open/closed flag used by the app shell.

Requirements:
- The store holds only that UI flag and the actions that toggle or set it.
- A small client component reads the flag and renders a toggle button.
- Do not fetch or cache server/API data in the store.
- Follow whatever conventions this repository already documents for client state.
```

**Fragments in play:** `zustand`, `typescript-strict`, `flat`, `nextjs-app-router` (if the component lands under `app/`)

---

## Task 3 — Data-fetching hook

**Id:** `T3-data-hook`

```text
Add a data-fetching hook that loads a post by id from an external HTTP API.

Requirements:
- Assume GET https://jsonplaceholder.typicode.com/posts/:id returns JSON { userId, id, title, body }.
- Expose a hook a client component can call with a post id.
- Include a tiny demo client component that renders the post title for id "1".
- Follow whatever conventions this repository already documents for server-state fetching.
```

**Fragments in play:** `tanstack-query`, `typescript-strict`, `flat`, `nextjs-app-router` (demo placement)

---

## Task 4 — Refactor mixed server/client component

**Id:** `T4-refactor-rsc`

```text
Refactor src/components/user-panel.tsx, src/app/users/[id]/page.tsx, and any helpers they use (including src/lib/users-api.ts).

Goal:
- Keep the same user-visible behavior (toggle show/hide; show the user's name when open).
- Separate server data loading from client UI state using App Router conventions.
- Prefer Server Components for data; keep 'use client' on the smallest interactive leaf.
- Do not change the public URL (/users/[id]).
- Do not leave server secrets or server-only helpers imported into Client Components.
```

**Fragments in play:** `nextjs-app-router`, `typescript-strict`, `flat` (and `refactor` workflow if invoked)

---

## Task 5 — Tests for an existing utility

**Id:** `T5-write-tests`

```text
Write tests for src/utils/cart-total.ts.

Requirements:
- Cover the observable behavior of cartTotal (empty cart, multiple lines, optional discountPercent).
- cartTotal reads loadRate from ./rates. Follow the project's test conventions for dependencies.
- Use the project's test runner and conventions.
- Do not change cart-total.ts or rates.ts unless a test reveals a clear bug; prefer characterizing current behavior.
```

**Fragments in play:** `vitest`, `typescript-strict`, `flat` (and `write-tests` workflow if invoked)

---

# JavaScript appendix (`next15-src-js`)

Same five task ids. Seeds and prompts use `.js` / `.jsx` paths with **no TypeScript syntax**. Paste the prompts in this section for the JavaScript cell.

## Seed files (JS)

### `src/lib/users-api.js` (task 4 — secret seam)

```js
/** Fixture-only. Treat as a server secret — never import from a Client Component. */
export const USERS_API_KEY = 'fixture-secret-do-not-ship';

export function usersApiPath(userId) {
  return `/api/users/${userId}?key=${USERS_API_KEY}`;
}
```

### `src/components/user-panel.jsx` (task 4)

Deliberately loads on the client via `usersApiPath` **and** keeps an inlined copy of the same API key so a half-finished refactor can still leave a secret in a `'use client'` file (JS T4 instrument after the v0.2 go — see [results-v0.2.md](./results-v0.2.md)):

```jsx
'use client';

import { useEffect, useState } from 'react';

import { usersApiPath } from '@/lib/users-api';

/** Inlined copy of the server secret — must not remain in a Client Component. */
const USERS_API_KEY = 'fixture-secret-do-not-ship';

export function UserPanel({ userId }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const url = `${usersApiPath(userId)}&clientKey=${USERS_API_KEY}`;
    void fetch(url)
      .then((res) => res.json())
      .then((data) => setUser(data));
  }, [userId]);

  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide' : 'Show'}
      </button>
      {open && user ? <p>{user.name}</p> : null}
    </div>
  );
}
```

### `src/app/users/[id]/page.jsx` (task 4)

Deliberately marks the route as a Client Component and reads `params` without awaiting a Promise (same class of bug as the TypeScript seed):

```jsx
'use client';

import { UserPanel } from '@/components/user-panel';

export default function UserPage({ params }) {
  // Seed is wrong for App Router async params: treat params as a plain object.
  return <UserPanel userId={params.id} />;
}
```

### `src/app/newsletter/page.jsx` (task 1 — incomplete seed)

```jsx
'use client';

import { useForm } from 'react-hook-form';

import { subscribeNewsletter } from './actions';

export default function NewsletterPage() {
  const { register, handleSubmit } = useForm({
    defaultValues: { email: '' },
  });

  return (
    <main>
      <h1>Newsletter</h1>
      <form
        onSubmit={handleSubmit(async (values) => {
          await subscribeNewsletter(values.email);
        })}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          {...register('email', { required: true, pattern: /.+@.+/ })}
        />
        <button type="submit">Subscribe</button>
      </form>
    </main>
  );
}
```

### `src/app/newsletter/actions.js` (task 1 — incomplete seed)

```js
'use server';

export async function subscribeNewsletter(email) {
  void email;
}
```

### `src/utils/rates.js` (task 5 dependency)

```js
/** Returns a currency multiplier for the active market. Fixed for the fixture. */
export function loadRate() {
  return 1;
}
```

### `src/utils/cart-total.js` (task 5)

```js
import { loadRate } from './rates';

export function cartTotal(lines) {
  const rate = loadRate();
  return lines.reduce((sum, line) => {
    const discount = line.discountPercent ?? 0;
    return sum + line.unitPrice * line.quantity * (1 - discount / 100) * rate;
  }, 0);
}
```

---

## Task 1 (JS) — Form + Server Action

**Id:** `T1-form-server-action`

```text
Finish the newsletter signup under the App Router. Seeds already exist at src/app/newsletter/page.jsx and src/app/newsletter/actions.js.

Requirements:
- Keep a page at /newsletter with an email field and a submit button.
- Submitting the form must call a Server Action that accepts the email.
- Persist is out of scope: the action may no-op after handling the input, but it must be a real Server Action wired to the form.
- This project is JavaScript (`.js` / `.jsx`). Do not add TypeScript syntax.
- Fix validation and Server Action handling to match whatever conventions this repository already documents for forms, validation, and Server Actions.
```

**Fragments in play:** `nextjs-app-router`, `react-hook-form-zod`, `javascript`, `flat`

---

## Task 2 (JS) — Client UI store

**Id:** `T2-ui-store`

```text
Add a client-side store for a sidebar open/closed flag used by the app shell.

Requirements:
- The store holds only that UI flag and the actions that toggle or set it.
- A small client component reads the flag and renders a toggle button.
- Do not fetch or cache server/API data in the store.
- This project is JavaScript (`.js` / `.jsx`). Do not add TypeScript syntax.
- Follow whatever conventions this repository already documents for client state.
```

**Fragments in play:** `zustand`, `javascript`, `flat`, `nextjs-app-router` (if the component lands under `app/`)

---

## Task 3 (JS) — Data-fetching hook

**Id:** `T3-data-hook`

```text
Add a data-fetching hook that loads a post by id from an external HTTP API.

Requirements:
- Assume GET https://jsonplaceholder.typicode.com/posts/:id returns JSON { userId, id, title, body }.
- Expose a hook a client component can call with a post id.
- Include a tiny demo client component that renders the post title for id "1".
- This project is JavaScript (`.js` / `.jsx`). Do not add TypeScript syntax.
- Follow whatever conventions this repository already documents for server-state fetching.
```

**Fragments in play:** `tanstack-query`, `javascript`, `flat`, `nextjs-app-router` (demo placement)

---

## Task 4 (JS) — Refactor mixed server/client component

**Id:** `T4-refactor-rsc`

```text
Refactor src/components/user-panel.jsx, src/app/users/[id]/page.jsx, and any helpers they use (including src/lib/users-api.js).

Goal:
- Keep the same user-visible behavior (toggle show/hide; show the user's name when open).
- Separate server data loading from client UI state using App Router conventions.
- Prefer Server Components for data; keep 'use client' on the smallest interactive leaf.
- Do not change the public URL (/users/[id]).
- Do not leave server secrets (API keys) or server-only helpers in Client Component modules — remove imports and any inlined key copies.
- This project is JavaScript (`.js` / `.jsx`). Do not add TypeScript syntax.
```

**Fragments in play:** `nextjs-app-router`, `javascript`, `flat` (and `refactor` workflow if invoked)

---

## Task 5 (JS) — Tests for an existing utility

**Id:** `T5-write-tests`

```text
Write tests for src/utils/cart-total.js.

Requirements:
- Cover the observable behavior of cartTotal (empty cart, multiple lines, optional discountPercent).
- cartTotal reads loadRate from ./rates. Follow the project's test conventions for dependencies.
- Use the project's test runner and conventions.
- This project is JavaScript (`.js` / `.jsx`). Do not add TypeScript syntax.
- Do not change cart-total.js or rates.js unless a test reveals a clear bug; prefer characterizing current behavior.
```

**Fragments in play:** `vitest`, `javascript`, `flat` (and `write-tests` workflow if invoked)
