---
id: express
name: Express 5
category: framework
version: 1.0.0
order: 30
description: Express 5 async errors, boundary validation, and modular routers.
hint: express ≥5 · async errors, routers
scope: auto
globs:
  - "{{src}}routes/**/*.ts"
  - "{{src}}controllers/**/*.ts"
  - "{{src}}middleware/**/*.ts"
  - "{{src}}**/*.routes.ts"
  - "{{src}}**/*.controller.ts"
  - "{{src}}**/*.middleware.ts"
detect:
  packages: ["express"]
appliesTo:
  express: ">=5"
sources:
  - https://expressjs.com/en/5x/guide/error-handling/
  - https://expressjs.com/en/guide/migrating-5/
  - https://expressjs.com/en/5x/guide/using-middleware/
  - https://expressjs.com/en/5x/guide/routing.html
verifiedAt: 2026-10-28
---

## Boundary
These rules apply to Express route modules, controllers, and middleware. An `async` handler, or a handler that returns a rejected promise, forwards that rejection to error-handling middleware. A promise that is not returned never reaches Express. Error-handling middleware takes four parameters and is registered after the routes.

## Directives
- **ALWAYS** write a handler as an `async` function, or return its promise. **NEVER** start a promise you neither return nor pass to `next`.
- **ALWAYS** register one error middleware with the signature `(err, req, res, next)` after the routes. Keep the fourth parameter even when the function does not call `next`.
- **ALWAYS** validate `req.body`, `req.params`, and `req.query` before using them. **NEVER** assign to `req.query`. It is a getter, and the default parser is `simple`.
- **ALWAYS** write an optional segment as `{:name}` or `{.:ext}`. **NEVER** mark it with `?`. Express 5 omits an unmatched optional param. **ALWAYS** treat a named wildcard such as `/*splat` as a string array.
- **ALWAYS** put a group of routes on `express.Router()` and mount that router with `app.use`. Pass `{ mergeParams: true }` when the nested router reads a parent param.

## Contract
```ts
// ✅ Good: async router handler; error middleware is last and has four parameters
const router = express.Router();
router.get('/users/:id', async (req, res) => {
  const id = userId(req.params.id);
  res.json(await getUser(id));
});
app.use('/users', router);
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ message: 'Internal error' });
});

// ❌ Anti-pattern: the rejection is not returned, so Express never sees it
app.get('/', (_req, _res) => {
  Promise.reject(new Error('fail'));
});
```
