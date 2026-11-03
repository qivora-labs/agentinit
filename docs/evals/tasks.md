# Eval Tasks

Paste each prompt **verbatim** into a fresh agent session. Do not add setup commentary in the session; seed files and packages come from [README.md](./README.md).

Prompts assume the project root is the eval workdir (`src/app/…`, flat layout).

## Seed files (add during fixture setup)

Create these before `init` and before splitting `with-rules` / `without-rules`.

### `src/components/user-panel.tsx` (task 4)

Deliberately mixes server data fetching with client UI state so a refactor has a clear target:

```tsx
'use client';

import { useEffect, useState } from 'react';

type User = { id: string; name: string };

export function UserPanel({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetch(`/api/users/${userId}`)
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

```tsx
import { UserPanel } from '@/components/user-panel';

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserPanel userId={id} />;
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
Add a newsletter signup feature under the App Router.

Requirements:
- A page at /newsletter with an email field and a submit button.
- Submitting the form calls a Server Action that accepts the email.
- Persist is out of scope: the action may no-op after handling the input, but it must be a real Server Action wired to the form.
- Follow whatever conventions this repository already documents for forms, validation, and Server Actions.
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
Refactor src/components/user-panel.tsx and src/app/users/[id]/page.tsx.

Goal:
- Keep the same user-visible behavior (toggle show/hide; show the user's name when open).
- Separate server data loading from client UI state using App Router conventions.
- Prefer Server Components for data; keep 'use client' on the smallest interactive leaf.
- Do not change the public URL (/users/[id]).
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
