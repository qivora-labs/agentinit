---
id: nextjs-pages-router
name: Next.js Pages Router
category: framework
version: 1.0.0
order: 30
description: Pages Router data fetching, API routes, and coexistence with the App Router.
scope: glob
globs:
  - "{{src}}pages/**/*.ts"
  - "{{src}}pages/**/*.tsx"
detect:
  packages: ["next"]
appliesTo:
  next: ">=13"
sources:
  - https://nextjs.org/docs/pages/building-your-application/data-fetching/get-server-side-props
  - https://nextjs.org/docs/pages/building-your-application/data-fetching/get-static-props
  - https://nextjs.org/docs/pages/building-your-application/routing/api-routes
  - https://nextjs.org/docs/pages/guides/migrating/app-router-migration
  - https://nextjs.org/docs/app/getting-started/route-handlers
verifiedAt: 2026-10-28
---

## Boundary
These rules apply to files under `pages/`. A page module may export `getServerSideProps` or `getStaticProps`. Files in `pages/api` are HTTP endpoints, not pages. The `app` directory can serve other URLs in the same project. Navigation from one router to the other is a full page load.

## Directives
- **ALWAYS** export `getServerSideProps` or `getStaticProps` from the page module only. **PREFER** `getStaticProps` when the data is not specific to the request, and set `revalidate` on that return value for incremental regeneration. Use `getServerSideProps` for request-time data such as cookies or authorization headers.
- **NEVER** put secrets in the `props` returned to the page. Those props are serialized into the HTML.
- **NEVER** call a `pages/api` route from `getServerSideProps` or `getStaticProps` to load data for that page. Call the database, CMS, or third-party API from the data function.
- **ALWAYS** validate `req.body` in an API route before using it. The payload is untrusted. Branch on `req.method`, and keep the handler in `pages/api`.
- **NEVER** import `next/navigation`, export `generateMetadata`, or use `'use cache'` in `pages/`. Routing hooks in `pages/` come from `next/router`.
- **NEVER** export `getServerSideProps`, `getStaticProps`, or a `pages/api` handler from `app/`.
- **NEVER** add a `pages` file whose URL is already served by `app`, or an API route whose path is already a Route Handler. Each URL belongs to one router.

## Contract
```tsx
// ✅ Good: request-time data from the page module, no internal API hop
export const getServerSideProps = (async () => {
  const post = await getPost();
  return { props: { title: post.title } };
}) satisfies GetServerSideProps<{ title: string }>;

export default function Page({ title }: { title: string }) {
  return <h1>{title}</h1>;
}

// ❌ Anti-pattern: an App Router metadata API inside pages
export async function generateMetadata() {
  return { title: 'Post' };
}
```
