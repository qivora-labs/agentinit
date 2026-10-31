# AGENTS.md

Always-on rules for this project. Scoped rules and workflows stay in each agent's own files.

## Contents

- [Project commands](#project-commands)
- [Architecture](#architecture)
- [TypeScript strict](#typescript-strict)

## Project commands

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`

## Architecture

Controllers call services, and services call the data layer.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the folder map and conventions for new code.

## TypeScript strict

### Boundary
Application and test code is typechecked in strict mode.

ALWAYS typecheck in strict mode.

```ts
const example = true;
```
