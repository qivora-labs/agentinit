---
id: nextjs-app-router
name: Next.js App Router 16
category: framework
version: 1.0.1
order: 30
description: Server Components by default, validated Server Actions, and Next.js 16 caching.
hint: next ≥16.3 · RSC, Server Actions, cache
scope: glob
globs:
  - "{{src}}app/**/*.ts"
  - "{{src}}app/**/*.tsx"
detect:
  packages: ["next"]
appliesTo:
  next: ">=16.3.0"
sources:
  - https://nextjs.org/docs/app/getting-started/server-and-client-components
  - https://nextjs.org/docs/app/getting-started/mutating-data
  - https://nextjs.org/docs/app/guides/server-actions
  - https://nextjs.org/docs/app/getting-started/caching
  - https://nextjs.org/docs/app/guides/caching-without-cache-components
  - https://nextjs.org/docs/app/getting-started/revalidating
  - https://nextjs.org/docs/app/api-reference/file-conventions/loading
  - https://nextjs.org/docs/app/api-reference/file-conventions/error
  - https://nextjs.org/docs/app/getting-started/metadata-and-og-images
  - https://nextjs.org/docs/app/getting-started/route-handlers
  - https://nextjs.org/docs/app/guides/upgrading/version-16
verifiedAt: 2026-10-28
---

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}app/` | App Router route segments (layout, page, loading, error). |
| `{{src}}app/api/` | Route Handlers (route.ts) for HTTP clients outside the React tree. |

## Boundary
These rules apply to files under `app/`. `page` and `layout` modules are Server Components unless that file itself needs state, effects, or browser APIs. `params`, `searchParams`, `cookies()`, and `headers()` are promises. A file with `'use client'` pulls its imports into the client bundle. Props passed into that file must be serializable.

## Directives
- **DEFAULT** to Server Components. **ALWAYS** put `'use client'` on the smallest interactive module, not on a `page` or `layout` that only renders one interactive child.
- **NEVER** import a module that reads secrets or other server-only data into a file marked `'use client'`. Pass serializable props, or pass a Server Component as `children`.
- **ALWAYS** `await` `params`, `searchParams`, `cookies()`, and `headers()` before reading them.
- **ALWAYS** validate Server Action inputs on the server, then authenticate and authorize inside the action, before any mutation. A schema check does not prove the caller owns the row.
- **ALWAYS** return an expected action failure as a value. **NEVER** throw it into `error.tsx`.
- **NEVER** add a Route Handler only so a Server Component can read data. Fetch in the Server Component. Use `route.ts` for an HTTP client outside the React tree, and **NEVER** place it on the same segment as `page.tsx`.
- **NEVER** export `metadata` or `generateMetadata` from a Client Component. **PREFER** a static `metadata` export when the values do not depend on the request, and `generateMetadata` when they do. **ALWAYS** `await` `params` inside `generateMetadata`.
- **PREFER** a `loading.tsx` for a segment that streams. It wraps that segment's `page`, not the `layout` beside it.
- **ALWAYS** make `error.tsx` a Client Component and recover with `retry()`. Use `reset()` only to re-render children without re-fetching. `global-error.tsx` must render its own `<html>` and `<body>`.
- **ALWAYS** keep the caching model the app already uses. When `cacheComponents` is on, mark shared async work with `'use cache'` and **PREFER** `cacheLife` on that work. Leave per-request data uncached. **NEVER** add `'use cache'` when that flag is off.
- **ALWAYS** call `updateTag` in a Server Action when the user must see their own write immediately. **ALWAYS** pass a `cacheLife` profile to `revalidateTag` when stale-while-revalidate is enough. `refresh()` does not revalidate tags.

## Contract
```tsx
// ✅ Good: server page, awaited params, client leaf
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  return <LikeButton likes={post.likes} />;
}

// ❌ Anti-pattern: the page is a client component fetching through an internal route
'use client';
export default function Page() {
  useEffect(() => {
    void fetch('/api/posts');
  }, []);
  return null;
}
```
