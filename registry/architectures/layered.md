---
id: layered
name: Layered / Clean
category: architecture
version: 1.0.0
order: 10
description: Domain, application, infrastructure, and presentation, with dependencies pointing inward.
scope: always
sources:
  - https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
verifiedAt: 2026-10-28
---

## Summary
- Put business rules in `{{src}}domain/` and use cases in `{{src}}application/`.
- Put database, HTTP, and filesystem adapters in `{{src}}infrastructure/`.
- Put UI and delivery code in `{{src}}presentation/`.
- Point imports inward, toward `{{src}}domain/`.
- Keep `{{src}}domain/` free of framework and I/O imports.

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}domain/` | Business rules and types. No framework, UI, or I/O. |
| `{{src}}application/` | Use cases that orchestrate the domain through ports declared here or in `domain/`. |
| `{{src}}infrastructure/` | Implementations of those ports: database, HTTP, filesystem, and other I/O. |
| `{{src}}presentation/` | UI, controllers, and other delivery code. |

## Boundary
New code goes in the layer that owns that responsibility. `presentation/` and `infrastructure/` are outer layers. `application/` sits inside them. `domain/` is the innermost layer. A source file may import a layer closer to `domain/` than its own.

## Directives
- **ALWAYS** import inward: `presentation/` and `infrastructure/` may import `application/` and `domain/`; `application/` may import `domain/`.
- **NEVER** import `application/`, `infrastructure/`, or `presentation/` from `domain/`.
- **NEVER** import a framework, database client, HTTP client, or filesystem module from `domain/`.
- **NEVER** import `infrastructure/` or `presentation/` from `application/`.
- **NEVER** import `presentation/` from `infrastructure/`, or `infrastructure/` from `presentation/`.
- **PREFER** a port type declared in `application/` or `domain/` when a use case needs I/O, with the implementation in `infrastructure/`.

## Contract
```ts
// ✅ Good: {{src}}application/load-invoice.ts depends on the domain and an inward port
import type { Invoice } from '../domain/invoice';
import type { InvoiceStore } from './invoice-store';

export function loadInvoice(store: InvoiceStore, id: string): Promise<Invoice> {
  return store.find(id);
}

// ❌ Anti-pattern: {{src}}domain/invoice.ts names an outer adapter
import { db } from '../infrastructure/db';
```
