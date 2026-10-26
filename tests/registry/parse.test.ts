import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { getSections, parseFragment } from '../../src/registry/parse.js';
import type { FragmentMeta } from '../../src/registry/schema.js';
import { ERROR } from '../../src/exit-codes.js';

const PRD_EXAMPLE = `---
id: nextjs-app-router
name: Next.js App Router
category: framework
version: 1.0.0
order: 30
description: React Server Components by default, strict client boundaries, and App Router data conventions.
scope: glob
globs:
  - "{{src}}app/**/*.ts"
  - "{{src}}app/**/*.tsx"
detect:
  packages: ["next"]
appliesTo:
  next: ">=15"
sources:
  - https://nextjs.org/docs/app
verifiedAt: 2026-10-17
---

## Next.js App Router Guardrails

### 1. Server vs. Client Component Boundaries
- **DEFAULT** to React Server Components. NEVER add 'use client' to a page or layout file.
- **ISOLATE** interactivity: push 'use client' down to the smallest leaf component.
- **NEVER** import server-only modules or secrets into files marked 'use client'.

### 2. Data Fetching & Mutations
- **ALWAYS** fetch data in Server Components with \`async/await\` and shared data-access helpers.
- **NEVER** create internal route handlers (\`app/api/*\`) only to fetch data for a Server Component.
- **ALWAYS** validate Server Action inputs with Zod before mutating.

### 3. Contract
\`\`\`tsx
// ✅ Good: server page, client leaf
export default async function Page() {
  const posts = await getPosts();
  return <PostList posts={posts} />; // PostList renders <LikeButton /> ('use client')
}

// ❌ Anti-pattern: whole page forced to the client
'use client';
export default function Page() { /* useEffect(() => fetch('/api/posts')) */ }
\`\`\`
`;

const baseRule = {
  id: 'zustand',
  name: 'Zustand',
  category: 'library',
  version: '1.0.0',
  order: 40,
  description: 'Small client-side state.',
  scope: 'glob',
  globs: ['{{src}}stores/**/*.ts', '{{src}}stores/**/*.tsx'],
  sources: ['https://zustand.docs.pm/learn/getting-started/introduction'],
  verifiedAt: '2026-10-17',
};

const baseWorkflow = {
  id: 'new-feature',
  name: 'New feature',
  category: 'workflow',
  version: '1.0.0',
  order: 10,
  description: 'Plan and implement a feature.',
  argumentHint: '<feature-name>',
  sources: ['https://example.com/docs/workflows'],
  verifiedAt: '2026-10-17',
};

function document(data: unknown, body = '## Body\ntext\n'): string {
  return `---\n${stringify(data)}---\n${body}`;
}

function rejection(text: string, sourcePath: string): AgentInitError {
  try {
    parseFragment(text, sourcePath);
  } catch (error) {
    if (error instanceof AgentInitError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected parseFragment to throw');
}

type HasKey<T, K extends string> = K extends keyof T ? true : false;
type WorkflowMeta = Extract<FragmentMeta, { category: 'workflow' }>;
type RuleMeta = Exclude<FragmentMeta, { category: 'workflow' }>;

describe('parseFragment', () => {
  it('parses the PRD §4.4 example fragment', () => {
    const sourcePath = 'registry/frameworks/nextjs-app-router.md';
    const fragment = parseFragment(PRD_EXAMPLE, sourcePath);

    expect(fragment.sourcePath).toBe(sourcePath);
    expect(fragment.meta).toMatchObject({
      id: 'nextjs-app-router',
      name: 'Next.js App Router',
      category: 'framework',
      version: '1.0.0',
      order: 30,
      description:
        'React Server Components by default, strict client boundaries, and App Router data conventions.',
      scope: 'glob',
      globs: ['{{src}}app/**/*.ts', '{{src}}app/**/*.tsx'],
      detect: { packages: ['next'] },
      appliesTo: { next: '>=15' },
      sources: ['https://nextjs.org/docs/app'],
      verifiedAt: '2026-10-17',
    });
    expect(fragment.body.startsWith('## Next.js App Router Guardrails')).toBe(true);
    expect(fragment.body).toContain('### 1. Server vs. Client Component Boundaries');
    expect(fragment.body.endsWith('```')).toBe(true);
    expect(fragment.meta.category).toBe('framework');
    if (fragment.meta.category !== 'workflow') {
      expect(fragment.meta.scope).toBe('glob');
    }
  });

  it('trims the body and keeps a workflow free of scope', () => {
    const sourcePath = 'registry/workflows/new-feature.md';
    const fragment = parseFragment(
      document(baseWorkflow, '\n## Purpose\n\nShip a feature.\n'),
      sourcePath,
    );

    expect(fragment.body).toBe('## Purpose\n\nShip a feature.');
    expect(fragment.meta.category).toBe('workflow');
    if (fragment.meta.category === 'workflow') {
      expect(fragment.meta.argumentHint).toBe('<feature-name>');
      expect('scope' in fragment.meta).toBe(false);
      expect('globs' in fragment.meta).toBe(false);
    }
  });

  it('accepts scope always without globs and scope manual with or without globs', () => {
    const always = parseFragment(
      document({ ...baseRule, category: 'language', scope: 'always', globs: undefined }),
      'registry/languages/typescript.md',
    );
    const manual = parseFragment(
      document({ ...baseRule, scope: 'manual', globs: undefined }),
      'registry/libraries/zustand.md',
    );
    const manualWithGlobs = parseFragment(
      document({ ...baseRule, scope: 'manual' }),
      'registry/libraries/zustand.md',
    );

    expect(always.meta.category).not.toBe('workflow');
    expect(manual.meta.category).not.toBe('workflow');
    expect(manualWithGlobs.meta.category).not.toBe('workflow');
  });

  it.each([
    {
      behavior: 'rejects a brace glob and names the file and field',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({
        ...baseRule,
        globs: ['{{src}}stores/**/*.ts', '{{src}}stores/**/*.{ts,tsx}'],
      }),
      parts: ['registry/libraries/zustand.md', 'globs[1]', 'brace patterns are not allowed'],
    },
    {
      behavior: 'rejects scope glob without globs',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, globs: undefined }),
      parts: ['registry/libraries/zustand.md', 'globs:', 'required when scope is glob or auto'],
    },
    {
      behavior: 'rejects scope auto without globs',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, scope: 'auto', globs: undefined }),
      parts: ['globs:', 'required when scope is glob or auto'],
    },
    {
      behavior: 'rejects scope always with globs',
      sourcePath: 'registry/architectures/feature-based.md',
      text: document({
        ...baseRule,
        category: 'architecture',
        scope: 'always',
        globs: ['{{src}}**/*.ts'],
      }),
      parts: [
        'registry/architectures/feature-based.md',
        'globs:',
        'forbidden when scope is always',
      ],
    },
    {
      behavior: 'rejects an invalid semver range in appliesTo',
      sourcePath: 'registry/frameworks/nextjs-app-router.md',
      text: document({ ...baseRule, appliesTo: { next: 'not-a-range' } }),
      parts: ['appliesTo.next', 'must be a valid semver range'],
    },
    {
      behavior: 'rejects an empty appliesTo range',
      sourcePath: 'registry/frameworks/nextjs-app-router.md',
      text: document({ ...baseRule, appliesTo: { next: '' } }),
      parts: ['appliesTo.next', 'must be a valid semver range'],
    },
    {
      behavior: 'rejects a whitespace appliesTo range',
      sourcePath: 'registry/frameworks/nextjs-app-router.md',
      text: document({ ...baseRule, appliesTo: { next: '   ' } }),
      parts: ['appliesTo.next', 'must be a valid semver range'],
    },
    {
      behavior: 'rejects an empty appliesTo mapping',
      sourcePath: 'registry/frameworks/nextjs-app-router.md',
      text: document({ ...baseRule, appliesTo: {} }),
      parts: ['appliesTo:', 'must list at least one package'],
    },
    {
      behavior: 'rejects an empty detect.packages list',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, detect: { packages: [] } }),
      parts: ['detect.packages', 'must list at least one entry'],
    },
    {
      behavior: 'rejects an empty detect.files list',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, detect: { files: [] } }),
      parts: ['detect.files', 'must list at least one entry'],
    },
    {
      behavior: 'rejects an empty requires list',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, requires: [] }),
      parts: ['requires:', 'must list at least one id'],
    },
    {
      behavior: 'rejects an empty conflictsWith list',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, conflictsWith: [] }),
      parts: ['conflictsWith:', 'must list at least one id'],
    },
    {
      behavior: 'rejects an empty compatibleWith list',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, compatibleWith: [] }),
      parts: ['compatibleWith:', 'must list at least one id'],
    },
    {
      behavior: 'rejects an id that is not kebab-case',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, id: 'Zustand' }),
      parts: ['id:', 'must be kebab-case'],
    },
    {
      behavior: 'rejects a version that is not semver',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, version: '1.2' }),
      parts: ['version:', 'must be valid semver'],
    },
    {
      behavior: 'rejects a non-integer order',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, order: 1.5 }),
      parts: ['order:', 'must be an integer'],
    },
    {
      behavior: 'rejects a name that spans lines',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, name: 'line one\nline two' }),
      parts: ['name:', 'must be a single line'],
    },
    {
      behavior: 'rejects a description that spans lines',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, description: 'line one\nline two' }),
      parts: ['description:', 'must be a single line'],
    },
    {
      behavior: 'rejects a bad verifiedAt date',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, verifiedAt: '2026-02-31' }),
      parts: ['verifiedAt', 'must be YYYY-MM-DD'],
    },
    {
      behavior: 'rejects missing sources',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, sources: undefined }),
      parts: ['registry/libraries/zustand.md', 'sources:'],
    },
    {
      behavior: 'rejects an unknown frontmatter key',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, appliesto: { next: '>=15' } }),
      parts: ['registry/libraries/zustand.md', 'appliesto:', 'unknown key'],
    },
    {
      behavior: 'rejects a workflow that sets scope',
      sourcePath: 'registry/workflows/new-feature.md',
      text: document({ ...baseWorkflow, scope: 'always' }),
      parts: ['registry/workflows/new-feature.md', 'scope:', 'unknown key'],
    },
    {
      behavior: 'rejects a backslash in a glob',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, globs: ['{{src}}stores\\**\\*.ts'] }),
      parts: ['globs[0]', 'backslashes are not allowed'],
    },
    {
      behavior: 'rejects a glob that starts with /',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, globs: ['/src/**/*.ts'] }),
      parts: ['globs[0]', 'must not start with / or ./'],
    },
    {
      behavior: 'rejects a glob that starts with ./',
      sourcePath: 'registry/libraries/zustand.md',
      text: document({ ...baseRule, globs: ['./stores/**/*.ts'] }),
      parts: ['globs[0]', 'must not start with / or ./'],
    },
  ])('$behavior', ({ text, sourcePath, parts }) => {
    const error = rejection(text, sourcePath);
    expect(error).toBeInstanceOf(AgentInitError);
    expect(error.exitCode).toBe(ERROR);
    for (const part of parts) {
      expect(error.message).toContain(part);
    }
  });

  it('reports one line per issue', () => {
    const sourcePath = 'registry/libraries/zustand.md';
    const error = rejection(
      document({ ...baseRule, globs: undefined, appliesto: true }),
      sourcePath,
    );
    const lines = error.message.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((line) => line.startsWith(`${sourcePath}:`))).toBe(true);
  });

  it.each([
    {
      behavior: 'rejects a missing frontmatter block',
      text: '## No frontmatter\n',
      part: 'missing frontmatter block',
    },
    {
      behavior: 'rejects an unterminated frontmatter block',
      text: '---\nid: zustand\n',
      part: 'unterminated frontmatter block',
    },
    {
      behavior: 'rejects frontmatter that is not a mapping',
      text: '---\n- just\n- a\n- list\n---\n',
      part: 'frontmatter must be a mapping',
    },
  ])('$behavior', ({ text, part }) => {
    const sourcePath = 'registry/libraries/zustand.md';
    const error = rejection(text, sourcePath);
    expect(error.message).toBe(`${sourcePath}: ${part}`);
    expect(error.exitCode).toBe(ERROR);
  });

  it('rejects an empty frontmatter mapping instead of returning an empty fragment', () => {
    const sourcePath = 'registry/libraries/zustand.md';
    const error = rejection('---\n---\n## Body\n', sourcePath);
    expect(error.message).toContain(`${sourcePath}: category:`);
  });

  it('allows {{src}}, {{pm}}, and {{scripts.<name>}} braces in globs', () => {
    const fragment = parseFragment(
      document({
        ...baseRule,
        globs: ['{{src}}stores/**/*.ts', '{{pm}}/{{scripts.test}}/**/*.ts'],
      }),
      'registry/libraries/zustand.md',
    );
    expect(fragment.meta.category).toBe('library');
    if (fragment.meta.category !== 'workflow') {
      expect(fragment.meta.globs).toEqual([
        '{{src}}stores/**/*.ts',
        '{{pm}}/{{scripts.test}}/**/*.ts',
      ]);
    }
  });

  it('parses CRLF frontmatter', () => {
    const fragment = parseFragment(
      document(baseWorkflow).replaceAll('\n', '\r\n'),
      'registry/workflows/new-feature.md',
    );
    expect(fragment.meta.category).toBe('workflow');
    expect(fragment.body).toBe('## Body\r\ntext');
  });
});

describe('getSections', () => {
  it('returns Summary and Map and keeps ### subheadings inside the parent section', () => {
    const body = [
      'ignored preamble',
      '## Summary',
      'Feature folders under src.',
      '',
      '## Map',
      'src/features',
      '### feature',
      'one folder per feature',
      '##Not a heading',
    ].join('\n');

    const sections = getSections(body);

    expect([...sections.keys()]).toEqual(['Summary', 'Map']);
    expect(sections.get('Summary')).toBe('Feature folders under src.');
    expect(sections.get('Map')).toBe('src/features\n### feature\none folder per feature\n##Not a heading');
  });

  it('keeps ## headings inside fenced code in the parent section', () => {
    const body = [
      '## Steps',
      'Show an example.',
      '```md',
      '## Not a section',
      '```',
      '## Output',
      'A summary.',
    ].join('\n');

    const sections = getSections(body);

    expect([...sections.keys()]).toEqual(['Steps', 'Output']);
    expect(sections.get('Steps')).toContain('## Not a section');
    expect(sections.get('Output')).toBe('A summary.');
  });

  it('keeps the later body when a ## heading is repeated', () => {
    const body = ['## Summary', 'first body', '## Summary', 'later body', '## Map', 'src/features'].join(
      '\n',
    );

    const sections = getSections(body);

    expect([...sections.keys()]).toEqual(['Summary', 'Map']);
    expect(sections.get('Summary')).toBe('later body');
    expect(sections.get('Map')).toBe('src/features');
  });
});

describe('fragment meta types', () => {
  it('drops scope from the workflow branch of the category union', () => {
    const workflowHasScope: HasKey<WorkflowMeta, 'scope'> = false;
    const ruleHasScope: HasKey<RuleMeta, 'scope'> = true;
    expect(workflowHasScope).toBe(false);
    expect(ruleHasScope).toBe(true);
  });
});
