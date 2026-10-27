---
id: atomic-design
name: Atomic Design
category: architecture
version: 1.0.0
order: 10
description: UI composed only from lower levels, from atoms up through pages.
scope: always
sources:
  - https://atomicdesign.bradfrost.com/chapter-2/
verifiedAt: 2026-10-28
---

## Summary
- Put the smallest UI pieces in `{{src}}components/atoms/`.
- Put a simple group of atoms in `{{src}}components/molecules/`.
- Put a section made from molecules in `{{src}}components/organisms/`.
- Put a page layout in `{{src}}components/templates/`.
- Put a new page in the route directory the project already uses, or in `{{src}}pages/`.
- Compose a component only from lower levels.
- Keep atoms free of data fetching and business rules.

## Map
| Path | Responsibility |
| :--- | :--- |
| `{{src}}components/atoms/` | Smallest pieces, such as a button, input, or label. Presentation only. |
| `{{src}}components/molecules/` | One simple unit made of atoms, such as a search form. |
| `{{src}}components/organisms/` | A section made of molecules and atoms. |
| `{{src}}components/templates/` | A page layout. Content structure, not the final copy. |
| `{{src}}pages/` | A concrete page. Use the project's route directory when one is already present. |

## Boundary
New UI lands in the lowest level that describes it. Atoms are the floor. Molecules sit on atoms, organisms on molecules and atoms, templates on organisms, and pages on templates. A page uses the route directory the project already has (`app/` or `pages/` under the source root) when that directory is present.

## Directives
- **ALWAYS** import only from a lower level: `molecules/` from `atoms/`; `organisms/` from `atoms/` and `molecules/`; `templates/` from `organisms/`; pages from `templates/`.
- **NEVER** import a component from the same level or a higher level.
- **NEVER** fetch data or branch on a business rule in `{{src}}components/atoms/`.
- **PREFER** an existing atom or molecule with the same role over a new component.

## Contract
```tsx
// ✅ Good: a molecule composes atoms
import { Button } from '{{src}}components/atoms/button';
import { Input } from '{{src}}components/atoms/input';

export function SearchForm() {
  return (
    <form>
      <Input name="q" />
      <Button type="submit">Search</Button>
    </form>
  );
}

// ❌ Anti-pattern: an atom imports a molecule
import { SearchForm } from '{{src}}components/molecules/search-form';
```
