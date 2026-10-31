# AGENTS.md

Always-on rules for this project. Scoped rules and workflows stay in each agent's own files.

## Contents

- [Architecture](#architecture)
- [TypeScript strict](#typescript-strict)

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
