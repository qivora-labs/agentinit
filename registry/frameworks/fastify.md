---
id: fastify
name: Fastify
category: framework
version: 1.0.0
order: 30
description: Fastify 5 plugins, JSON schema validation, hooks, and decorators.
scope: auto
globs:
  - "{{src}}routes/**/*.ts"
  - "{{src}}plugins/**/*.ts"
  - "{{src}}**/*.routes.ts"
  - "{{src}}**/*.plugin.ts"
detect:
  packages: ["fastify"]
appliesTo:
  fastify: ">=5"
sources:
  - https://fastify.dev/docs/latest/Reference/Plugins/
  - https://fastify.dev/docs/latest/Reference/Encapsulation/
  - https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
  - https://fastify.dev/docs/latest/Reference/Type-Providers/
  - https://fastify.dev/docs/latest/Reference/Hooks/
  - https://fastify.dev/docs/latest/Reference/Decorators/
verifiedAt: 2026-10-28
---

## Boundary
These rules apply to Fastify route and plugin modules. `register` creates an encapsulation context. Decorators, hooks, and schemas added there are visible to descendants, not to the parent. `onClose` is the hook that is not encapsulated. `decorate`, `decorateRequest`, and `decorateReply` run synchronously and fix the object shape before requests are served.

## Directives
- **ALWAYS** register routes, and the hooks that belong to them, inside a plugin passed to `register`.
- **PREFER** `fastify-plugin` only when a decorator or hook must be visible on the parent instance.
- **ALWAYS** declare a JSON schema for `body`, `querystring`, and `params` on a route that reads them. **NEVER** use Ajv `$async` for that initial schema. Do later async checks in a `preHandler` hook.
- **PREFER** the type provider already attached with `withTypeProvider`, so the handler sees the inferred type. Call `withTypeProvider` again inside an encapsulated plugin. The provider does not cross `register`.
- **ALWAYS** use a non-arrow function for a hook or handler that reads `this` as the Fastify instance. An arrow function keeps the outer `this`.
- **ALWAYS** call `decorateRequest` or `decorateReply` before setting that field. Initialize a string as `''` and an object or function as `null`. **NEVER** pass a shared object or array as the initial value.
- **NEVER** decorate the same name twice in one encapsulation context.

## Contract
```ts
// ✅ Good: encapsulated routes, a schema, and a per-request decorator
export async function userRoutes(fastify: FastifyInstance) {
  fastify.decorateRequest('user', null);
  fastify.addHook('preHandler', async function (request) {
    request.setDecorator('user', await loadUser(this, request));
  });
  fastify.get('/users/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async function (request) {
    return { id: request.params.id };
  });
}

// ❌ Anti-pattern: one object shared by every request, and an arrow hook
fastify.decorateRequest('user', { id: '' });
fastify.addHook('preHandler', async (request) => {
  request.user = await loadUser(this, request);
});
```
