import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { ERROR } from '../../src/exit-codes.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import { parseFragment, type Fragment } from '../../src/registry/parse.js';
import {
  resolveSelection,
  suggestFragments,
  type FragmentConflict,
  type ProjectFacts,
  type RegistryNotice,
  type ResolvedSelection,
  type Selection,
  type SelectionOrigin,
  type Suggestion,
} from '../../src/registry/resolve.js';

const sampleDir = fileURLToPath(new URL('../fixtures/registry-sample', import.meta.url));
const registryPromise = loadRegistry(sampleDir);

const SHADCN_FILES = ['components.json', 'src/components/ui/button.tsx'];

const WORKFLOWS = ['new-feature', 'review-arch'];

interface SuggestCase {
  name: string;
  packages: ProjectFacts['packages'];
  files?: readonly string[];
  expected: Suggestion;
}

interface ResolveCase {
  name: string;
  selection: Selection;
  facts?: ProjectFacts;
  fragmentIds: readonly string[];
  notices: readonly RegistryNotice[];
  conflicts: readonly FragmentConflict[];
}

const suggestCases: readonly SuggestCase[] = [
  {
    name: 'suggests every in-range fragment, including both Next.js routers',
    packages: { next: '15.3.1' },
    expected: {
      frameworks: ['nextjs-app-router', 'nextjs-pages-router'],
      libraries: [],
      notices: [],
    },
  },
  {
    name: 'suggests tailwind 4 for a fragment that applies to >=4',
    packages: { tailwindcss: '4.1.0' },
    expected: {
      frameworks: [],
      libraries: ['tailwind'],
      notices: [],
    },
  },
  {
    name: 'suggests a prerelease that satisfies appliesTo',
    packages: { next: '15.0.0-canary.1', tailwindcss: '4.0.0-beta.1' },
    expected: {
      frameworks: ['nextjs-app-router', 'nextjs-pages-router'],
      libraries: ['tailwind'],
      notices: [],
    },
  },
  {
    name: 'skips an out-of-range version and reports unsupported-version',
    packages: { tailwindcss: '3.4.17' },
    expected: {
      frameworks: [],
      libraries: [],
      notices: [
        {
          kind: 'unsupported-version',
          package: 'tailwindcss',
          version: '3.4.17',
          fragmentId: 'tailwind',
        },
      ],
    },
  },
  {
    name: 'skips every fragment whose appliesTo range excludes the version',
    packages: { next: '14.2.5' },
    expected: {
      frameworks: [],
      libraries: [],
      notices: [
        {
          kind: 'unsupported-version',
          package: 'next',
          version: '14.2.5',
          fragmentId: 'nextjs-app-router',
        },
        {
          kind: 'unsupported-version',
          package: 'next',
          version: '14.2.5',
          fragmentId: 'nextjs-pages-router',
        },
      ],
    },
  },
  {
    name: 'suggests a null version and reports unknown-version',
    packages: { next: null },
    expected: {
      frameworks: ['nextjs-app-router', 'nextjs-pages-router'],
      libraries: [],
      notices: [
        { kind: 'unknown-version', package: 'next', fragmentId: 'nextjs-app-router' },
        { kind: 'unknown-version', package: 'next', fragmentId: 'nextjs-pages-router' },
      ],
    },
  },
  {
    name: 'suggests an unknown version when the fragment has no appliesTo range',
    packages: { zustand: null },
    expected: {
      frameworks: [],
      libraries: ['zustand'],
      notices: [{ kind: 'unknown-version', package: 'zustand', fragmentId: 'zustand' }],
    },
  },
  {
    name: 'suggests a detected library that does not declare appliesTo',
    packages: { zustand: '5.0.8' },
    expected: {
      frameworks: [],
      libraries: ['zustand'],
      notices: [],
    },
  },
  {
    name: 'suggests shadcn only when every detect package and file is present',
    packages: { tailwindcss: '4.1.0', 'class-variance-authority': '0.7.0' },
    files: SHADCN_FILES,
    expected: {
      frameworks: [],
      libraries: ['shadcn', 'tailwind'],
      notices: [],
    },
  },
  {
    name: 'does not suggest shadcn when one detect package is missing',
    packages: { tailwindcss: '4.1.0' },
    files: SHADCN_FILES,
    expected: {
      frameworks: [],
      libraries: ['tailwind'],
      notices: [],
    },
  },
  {
    name: 'does not suggest shadcn when one detect file is missing',
    packages: { tailwindcss: '4.1.0', 'class-variance-authority': '0.7.0' },
    files: ['components.json'],
    expected: {
      frameworks: [],
      libraries: ['tailwind'],
      notices: [],
    },
  },
  {
    name: 'does not suggest shadcn from packages alone',
    packages: { tailwindcss: '4.1.0', 'class-variance-authority': '0.7.0' },
    expected: {
      frameworks: [],
      libraries: ['tailwind'],
      notices: [],
    },
  },
  {
    name: 'does not suggest shadcn from files alone',
    packages: {},
    files: SHADCN_FILES,
    expected: {
      frameworks: [],
      libraries: [],
      notices: [],
    },
  },
];

const resolveCases: readonly ResolveCase[] = [
  {
    name: 'adds requires transitively and keeps a single copy of each fragment',
    selection: selection({
      language: 'typescript',
      frameworks: ['nextjs-app-router'],
      libraries: ['forms'],
      origin: detected('typescript', 'layered', 'nextjs-app-router', 'forms'),
    }),
    fragmentIds: ['layered', 'typescript', 'typescript-strict', 'nextjs-app-router', 'forms', 'zustand'],
    notices: [
      { kind: 'required-by', fragmentId: 'zustand', requiredBy: 'forms' },
      { kind: 'required-by', fragmentId: 'typescript-strict', requiredBy: 'zustand' },
    ],
    conflicts: [],
  },
  {
    name: 'does not duplicate a fragment that was both selected and required',
    selection: selection({
      libraries: ['forms', 'zustand'],
      origin: detected('typescript-strict', 'layered', 'nextjs-app-router', 'forms', 'zustand'),
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'forms', 'zustand'],
    notices: [],
    conflicts: [],
  },
  {
    name: 'reports a conflict when both sides were selected manually',
    selection: selection({
      libraries: ['zustand'],
      origin: {
        'typescript-strict': 'manual',
        layered: 'manual',
        'nextjs-app-router': 'manual',
        zustand: 'manual',
      },
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'zustand'],
    notices: [],
    conflicts: [{ a: 'layered', b: 'zustand' }],
  },
  {
    name: 'does not report a conflict when both sides were detected',
    selection: selection({
      libraries: ['zustand'],
      origin: detected('typescript-strict', 'layered', 'nextjs-app-router', 'zustand'),
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'zustand'],
    notices: [],
    conflicts: [],
  },
  {
    name: 'reports a conflict when one side is manual',
    selection: selection({
      libraries: ['zustand'],
      origin: {
        'typescript-strict': 'detected',
        layered: 'detected',
        'nextjs-app-router': 'detected',
        zustand: 'manual',
      },
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'zustand'],
    notices: [],
    conflicts: [{ a: 'layered', b: 'zustand' }],
  },
  {
    name: 'reports a conflict when one side has no origin entry',
    selection: selection({
      libraries: ['zustand'],
      origin: {
        'typescript-strict': 'detected',
        'nextjs-app-router': 'detected',
        zustand: 'detected',
      },
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'zustand'],
    notices: [],
    conflicts: [{ a: 'layered', b: 'zustand' }],
  },
  {
    name: 'reports a conflict for a required fragment that inherits a manual origin',
    selection: selection({
      libraries: ['forms'],
      origin: {
        'typescript-strict': 'detected',
        layered: 'detected',
        'nextjs-app-router': 'detected',
        forms: 'manual',
      },
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'forms', 'zustand'],
    notices: [{ kind: 'required-by', fragmentId: 'zustand', requiredBy: 'forms' }],
    conflicts: [{ a: 'layered', b: 'zustand' }],
  },
  {
    name: 'drops an incompatible library and does not report its conflicts',
    selection: selection({
      frameworks: ['nextjs-pages-router'],
      libraries: ['zustand'],
      origin: {
        'typescript-strict': 'manual',
        layered: 'manual',
        'nextjs-pages-router': 'manual',
        zustand: 'manual',
      },
    }),
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-pages-router'],
    notices: [{ kind: 'incompatible', fragmentId: 'zustand' }],
    conflicts: [],
  },
  {
    name: 'does not keep requires of a library that was dropped',
    selection: selection({
      language: 'typescript',
      frameworks: ['nextjs-pages-router'],
      libraries: ['forms'],
      origin: detected('typescript', 'layered', 'nextjs-pages-router', 'forms'),
    }),
    fragmentIds: ['layered', 'typescript', 'nextjs-pages-router'],
    notices: [
      { kind: 'incompatible', fragmentId: 'forms' },
      { kind: 'incompatible', fragmentId: 'zustand' },
    ],
    conflicts: [],
  },
  {
    name: 'drops framework-bound libraries when no framework is selected',
    selection: selection({
      frameworks: [],
      libraries: ['zustand', 'vitest'],
      origin: detected('typescript-strict', 'layered', 'zustand', 'vitest'),
    }),
    fragmentIds: ['layered', 'typescript-strict', 'vitest'],
    notices: [
      { kind: 'no-framework' },
      { kind: 'incompatible', fragmentId: 'zustand' },
    ],
    conflicts: [],
  },
  {
    name: 'keeps a framework-agnostic library and still notices that no framework was selected',
    selection: selection({
      frameworks: [],
      libraries: ['vitest'],
      origin: detected('typescript-strict', 'layered', 'vitest'),
    }),
    fragmentIds: ['layered', 'typescript-strict', 'vitest'],
    notices: [{ kind: 'no-framework' }],
    conflicts: [],
  },
  {
    name: 'sorts fragments by order then id and always includes every workflow',
    selection: selection({
      frameworks: ['nextjs-pages-router', 'nextjs-app-router'],
      libraries: ['vitest', 'tailwind', 'zustand'],
      origin: detected(
        'typescript-strict',
        'layered',
        'nextjs-app-router',
        'nextjs-pages-router',
        'vitest',
        'tailwind',
        'zustand',
      ),
    }),
    fragmentIds: [
      'layered',
      'typescript-strict',
      'nextjs-app-router',
      'nextjs-pages-router',
      'tailwind',
      'vitest',
      'zustand',
    ],
    notices: [],
    conflicts: [],
  },
  {
    name: 'adds a required fragment when its version satisfies appliesTo',
    selection: selection({
      libraries: ['shadcn'],
      origin: detected('typescript-strict', 'layered', 'nextjs-app-router', 'shadcn'),
    }),
    facts: { packages: { tailwindcss: '4.1.0' }, files: [] },
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'shadcn', 'tailwind'],
    notices: [{ kind: 'required-by', fragmentId: 'tailwind', requiredBy: 'shadcn' }],
    conflicts: [],
  },
  {
    name: 'omits a required fragment whose version is outside appliesTo',
    selection: selection({
      libraries: ['shadcn'],
      origin: detected('typescript-strict', 'layered', 'nextjs-app-router', 'shadcn'),
    }),
    facts: { packages: { tailwindcss: '3.4.17' }, files: [] },
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'shadcn'],
    notices: [
      {
        kind: 'unsupported-version',
        package: 'tailwindcss',
        version: '3.4.17',
        fragmentId: 'tailwind',
      },
    ],
    conflicts: [],
  },
  {
    name: 'adds a required fragment when its version is unknown',
    selection: selection({
      libraries: ['shadcn'],
      origin: detected('typescript-strict', 'layered', 'nextjs-app-router', 'shadcn'),
    }),
    facts: { packages: { tailwindcss: null }, files: [] },
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'shadcn', 'tailwind'],
    notices: [{ kind: 'required-by', fragmentId: 'tailwind', requiredBy: 'shadcn' }],
    conflicts: [],
  },
  {
    name: 'keeps an explicitly selected fragment whose version is outside appliesTo',
    selection: selection({
      libraries: ['tailwind'],
      origin: detected('typescript-strict', 'layered', 'nextjs-app-router', 'tailwind'),
    }),
    facts: { packages: { tailwindcss: '3.4.17' }, files: [] },
    fragmentIds: ['layered', 'typescript-strict', 'nextjs-app-router', 'tailwind'],
    notices: [],
    conflicts: [],
  },
];

function selection(overrides: Partial<Selection> = {}): Selection {
  return {
    language: 'typescript-strict',
    architecture: 'layered',
    frameworks: ['nextjs-app-router'],
    libraries: [],
    origin: {
      'typescript-strict': 'manual',
      layered: 'manual',
      'nextjs-app-router': 'manual',
    },
    ...overrides,
  };
}

function detected(...ids: readonly string[]): Record<string, SelectionOrigin> {
  const origin: Record<string, SelectionOrigin> = {};
  for (const id of ids) origin[id] = 'detected';
  return origin;
}

function idsOf(fragments: readonly Fragment[]): string[] {
  return fragments.map((fragment) => fragment.meta.id);
}

function expectResolved(registry: Registry, testCase: ResolveCase): void {
  const first = resolveSelection(registry, testCase.selection, testCase.facts);
  const second = resolveSelection(registry, testCase.selection, testCase.facts);
  expect(snapshot(first)).toEqual(snapshot(second));
  expect(snapshot(first)).toEqual({
    fragmentIds: [...testCase.fragmentIds],
    workflowIds: WORKFLOWS,
    notices: [...testCase.notices],
    conflicts: [...testCase.conflicts],
  });
}

function snapshot(result: ResolvedSelection): {
  fragmentIds: string[];
  workflowIds: string[];
  notices: RegistryNotice[];
  conflicts: FragmentConflict[];
} {
  return {
    fragmentIds: idsOf(result.fragments),
    workflowIds: idsOf(result.workflows),
    notices: result.notices,
    conflicts: result.conflicts,
  };
}

function selectionError(registry: Registry, overrides: Partial<Selection>): AgentInitError {
  try {
    resolveSelection(registry, selection(overrides));
  } catch (error) {
    if (error instanceof AgentInitError) return error;
    throw error;
  }
  throw new Error('expected resolveSelection to throw');
}

function registryFrom(fragments: readonly Fragment[]): Registry {
  const ordered = [...fragments].sort((left, right) => {
    if (left.meta.order !== right.meta.order) return left.meta.order - right.meta.order;
    if (left.meta.id < right.meta.id) return -1;
    if (left.meta.id > right.meta.id) return 1;
    return 0;
  });
  const byId = new Map(ordered.map((fragment) => [fragment.meta.id, fragment]));
  return {
    fragments: ordered,
    byId,
    byCategory(category) {
      return ordered.filter((fragment) => fragment.meta.category === category);
    },
  };
}

describe('suggestFragments', () => {
  it.each(suggestCases)('$name', async (testCase) => {
    const registry = await registryPromise;
    expect(
      suggestFragments(registry, {
        packages: testCase.packages,
        files: testCase.files ?? [],
      }),
    ).toEqual(testCase.expected);
  });
});

describe('resolveSelection', () => {
  it.each(resolveCases)('$name', async (testCase) => {
    expectResolved(await registryPromise, testCase);
  });

  it.each([
    ['language', { language: 'missing' }],
    ['architecture', { architecture: 'missing' }],
    ['framework', { frameworks: ['missing'] }],
    ['library', { libraries: ['missing'] }],
  ] as const)('rejects an unknown %s id', async (_slot, overrides) => {
    const error = selectionError(await registryPromise, overrides);
    expect(error).toBeInstanceOf(AgentInitError);
    expect(error.exitCode).toBe(ERROR);
    expect(error.message).toBe('Unknown fragment "missing".');
  });

  it('rejects a selected id from the wrong category', async () => {
    const error = selectionError(await registryPromise, { language: 'zustand' });
    expect(error.exitCode).toBe(ERROR);
    expect(error.message).toBe('Fragment "zustand" is a library, not a language.');
  });

  it('rejects a requires id that is not in the registry', async () => {
    const registry = await registryPromise;
    const language = registry.byId.get('typescript-strict');
    const architecture = registry.byId.get('layered');
    if (language === undefined || architecture === undefined) {
      throw new Error('expected sample language and architecture fragments');
    }
    const broken = parseFragment(
      `---
id: needs-missing
name: Needs missing
category: library
version: 1.0.0
order: 40
description: Requires an id that does not exist.
scope: always
requires:
  - missing-lib
sources:
  - https://example.com/docs/missing
verifiedAt: 2026-10-17
---
## Boundary
text
`,
      'libraries/needs-missing.md',
    );
    const fake = registryFrom([language, architecture, broken]);
    expect(() =>
      resolveSelection(fake, {
        language: 'typescript-strict',
        architecture: 'layered',
        frameworks: [],
        libraries: ['needs-missing'],
        origin: {},
      }),
    ).toThrow('Unknown fragment "missing-lib" required by "needs-missing".');
  });

  it('does not add requires of a fragment omitted for an unsupported version', () => {
    const resolved = resolveSelection(versionedRegistry(), shadcnSelection(), {
      packages: { tailwindcss: '3.4.17' },
      files: [],
    });
    expect(snapshot(resolved)).toEqual({
      fragmentIds: ['layered', 'typescript-strict', 'react-vite', 'shadcn'],
      workflowIds: [],
      notices: [
        {
          kind: 'unsupported-version',
          package: 'tailwindcss',
          version: '3.4.17',
          fragmentId: 'tailwind',
        },
      ],
      conflicts: [],
    });
  });

  it('adds requires of a required fragment when the version is in range', () => {
    const resolved = resolveSelection(versionedRegistry(), shadcnSelection(), {
      packages: { tailwindcss: '4.1.0' },
      files: [],
    });
    expect(snapshot(resolved)).toEqual({
      fragmentIds: ['layered', 'typescript-strict', 'react-vite', 'shadcn', 'tailwind', 'tokens'],
      workflowIds: [],
      notices: [
        { kind: 'required-by', fragmentId: 'tailwind', requiredBy: 'shadcn' },
        { kind: 'required-by', fragmentId: 'tokens', requiredBy: 'tailwind' },
      ],
      conflicts: [],
    });
  });
});

function shadcnSelection(): Selection {
  return {
    language: 'typescript-strict',
    architecture: 'layered',
    frameworks: ['react-vite'],
    libraries: ['shadcn'],
    origin: detected('typescript-strict', 'layered', 'react-vite', 'shadcn'),
  };
}

function versionedRegistry(): Registry {
  return registryFrom([
    alwaysFragment('layered', 'architecture', 10),
    alwaysFragment('typescript-strict', 'language', 20),
    alwaysFragment('react-vite', 'framework', 30),
    alwaysFragment('shadcn', 'library', 40, 'requires:\n  - tailwind\n'),
    alwaysFragment(
      'tailwind',
      'library',
      40,
      'detect:\n  packages: ["tailwindcss"]\nappliesTo:\n  tailwindcss: ">=4"\nrequires:\n  - tokens\n',
    ),
    alwaysFragment('tokens', 'library', 40),
  ]);
}

function alwaysFragment(
  id: string,
  category: 'architecture' | 'language' | 'framework' | 'library',
  order: number,
  extra = '',
): Fragment {
  return parseFragment(
    `---
id: ${id}
name: ${id}
category: ${category}
version: 1.0.0
order: ${String(order)}
description: ${id} rules.
scope: always
${extra}sources:
  - https://example.com/docs/${id}
verifiedAt: 2026-10-17
---
## Boundary
text
`,
    `${category === 'library' ? 'libraries' : `${category}s`}/${id}.md`,
  );
}
