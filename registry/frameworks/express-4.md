---
id: express-4
name: Express 4
category: framework
version: 1.0.0
order: 30
description: Express 4 routers, boundary validation, and explicit async error forwarding.
hint: express 4.x · catch async, routers
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
  express: ">=4 <5"
sources:
  - https://expressjs.com/en/4x/guide/error-handling/
  - https://expressjs.com/en/4x/guide/routing/
  - https://expressjs.com/en/4x/api/router/
  - https://expressjs.com/en/4x/api/application/
  - https://expressjs.com/en/guide/migrating-5/
verifiedAt: 2026-11-05
---

## Boundary
These rules apply to Express 4 route modules, controllers, and middleware. Express 4 does not forward rejected promises from `async` handlers to error middleware. A rejection that is not passed to `next` is unhandled. Error-handling middleware takes four parameters and is registered after the routes.

## Directives
- **ALWAYS** catch a rejection from an `async` handler and call `next(err)`, or end the chain with `.catch(next)`. **NEVER** rely on Express 4 to see a thrown or rejected promise on its own.
- **ALWAYS** register one error middleware with the signature `(err, req, res, next)` after the routes. Keep the fourth parameter even when the function does not call `next`.
- **ALWAYS** validate `req.body`, `req.params`, and `req.query` before using them.
- **ALWAYS** write an optional segment as `:name?`. **NEVER** use Express 5 brace forms such as `{:name}` or `{.:ext}` in Express 4.
- **ALWAYS** put a group of routes on `express.Router()` and mount that router with `app.use`. Pass `{ mergeParams: true }` when the nested router reads a parent param.

## Contract
```ts
// ✅ Good: async handler forwards rejection; error middleware is last and has four parameters
const router = express.Router();
router.get('/users/:id', async (req, res, next) => {
  try {
    const id = userId(req.params.id);
    res.json(await getUser(id));
  } catch (err) {
    next(err);
  }
});
app.use('/users', router);
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ message: 'Internal error' });
});

// ❌ Anti-pattern: the rejection is not passed to next, so Express 4 never sees it
app.get('/', async (_req, _res) => {
  await Promise.reject(new Error('fail'));
});
```
