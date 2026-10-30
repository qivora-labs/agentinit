---
id: layered
name: Layered
category: architecture
version: 1.0.0
order: 10
description: One direction of dependencies.
scope: always
sources:
  - https://example.com/docs/layered
verifiedAt: 2026-10-17
---

## Summary
Controllers call services, and services call the data layer.

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}domain/` | Business rules. |
| `{{src}}application/` | Use cases. |
| `{{src}}infrastructure/` | I/O adapters. |
| `{{src}}presentation/` | UI and delivery. |

## Directives
- **ALWAYS** depend inward.
- **NEVER** import infrastructure from domain.

## Contract
```ts
const example = true;
```
