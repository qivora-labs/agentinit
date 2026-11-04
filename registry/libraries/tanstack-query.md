---
id: tanstack-query
name: TanStack Query
category: library
version: 1.0.0
order: 40
description: Query key factories, queryOptions, mutation invalidation, and Suspense.
hint: Query keys, queryOptions, invalidation
scope: auto
globs:
  - "{{src}}**/hooks/**/*.ts"
  - "{{src}}**/hooks/**/*.tsx"
  - "{{src}}**/queries/**/*.ts"
  - "{{src}}**/queries/**/*.tsx"
detect:
  packages: ["@tanstack/react-query"]
appliesTo:
  "@tanstack/react-query": ">=5"
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
  - react-vite
sources:
  - https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
  - https://tanstack.com/query/latest/docs/framework/react/guides/query-options
  - https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
  - https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
  - https://tanstack.com/query/latest/docs/framework/react/guides/suspense
  - https://tkdodo.eu/blog/effective-react-query-keys
verifiedAt: 2026-10-28
---

## Boundary
TanStack Query caches server data. A query key is an array and must be serializable with `JSON.stringify`. The hash is deterministic: key order inside an object does not matter, and array order does. `queryOptions` returns the object you pass it, so the key and `queryFn` stay together. `useSuspenseQuery` `data` is defined. Loading suspends. An error is thrown only when that query has no data. A refetch error with cached data stays on the result. Do not pass `enabled`, `placeholderData`, or `throwOnError`.

## Directives
- **ALWAYS** build keys in one factory per resource, and include every value the `queryFn` reads. **NEVER** close over a value that is missing from the key.
- **ALWAYS** share the key and `queryFn` through `queryOptions`. Pass that result to `useQuery`, `useSuspenseQuery`, and `queryClient`.
- **ALWAYS** return the `invalidateQueries` promise from the mutation `onSuccess`. A key such as `todoKeys.all` matches every query whose key starts with that array.
- **NEVER** copy a query result into a client store.
- **ALWAYS** render `useSuspenseQuery` under `<Suspense>`. **NEVER** pass `enabled`, `placeholderData`, or `throwOnError` to it.

## Contract
```tsx
import { Suspense } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

export const todoKeys = {
  all: ["todos"],
  detail: (id: string) => [...todoKeys.all, id],
};

export function todoOptions(id: string) {
  return queryOptions({
    queryKey: todoKeys.detail(id),
    queryFn: () => fetchTodo(id),
  });
}

export function Todo({ id }: { id: string }) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <TodoBody id={id} />
    </Suspense>
  );
}

function TodoBody({ id }: { id: string }) {
  const { data } = useSuspenseQuery(todoOptions(id));
  return <p>{data.title}</p>;
}

export function useAddTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addTodo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: todoKeys.all }),
  });
}

// ❌ Anti-pattern: the id is missing from the key
useQuery({ queryKey: ["todo"], queryFn: () => fetchTodo(id) });
```
