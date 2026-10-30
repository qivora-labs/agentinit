import type { Registry } from '../../src/registry/load.js';
import { parseFragment, type Fragment } from '../../src/registry/parse.js';

export function ruleFragment(id: string, category: string, extra = ''): Fragment {
  return parseFragment(
    `---
id: ${id}
name: ${id}
category: ${category}
version: 1.0.0
order: 10
description: ${id} description
scope: always
sources:
  - https://example.com/docs
verifiedAt: 2026-10-30
${extra}---

body
`,
    `${category}/${id}.md`,
  );
}

export function registryOf(fragments: readonly Fragment[]): Registry {
  const ordered = [...fragments];
  const byId = new Map(ordered.map((fragment) => [fragment.meta.id, fragment]));
  return {
    fragments: ordered,
    byId,
    byCategory(category) {
      return ordered.filter((fragment) => fragment.meta.category === category);
    },
  };
}
