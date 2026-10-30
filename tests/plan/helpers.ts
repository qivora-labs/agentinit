import type { ResolvedSelection } from '../../src/registry/resolve.js';
import type { Fragment, RuleFragmentMeta, WorkflowFragmentMeta } from '../../src/registry/schema.js';
import type { FragmentScope, ProjectProfile } from '../../src/types.js';

export function profile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  const base: ProjectProfile = {
    root: '/repo',
    mode: 'existing',
    packageManager: 'pnpm',
    srcDir: 'src',
    language: 'typescript-strict',
    packages: {},
    scripts: { lint: 'eslint .', test: 'vitest' },
    frameworks: [],
    libraries: [],
    architecture: { id: 'layered', confidence: 1 },
    folders: [],
    agents: [],
    existingAgentFiles: [],
    isMonorepo: false,
  };
  return { ...base, ...overrides };
}

export function ruleFragment(input: {
  id: string;
  name: string;
  category: RuleFragmentMeta['category'];
  scope: FragmentScope;
  order: number;
  body: string;
  globs?: string[];
}): Fragment {
  const meta: RuleFragmentMeta = {
    id: input.id,
    name: input.name,
    category: input.category,
    version: '1.0.0',
    order: input.order,
    description: 'A fragment.',
    scope: input.scope,
    sources: ['https://example.com/docs'],
    verifiedAt: '2026-10-17',
  };
  if (input.globs !== undefined) meta.globs = [...input.globs];
  return { meta, body: input.body, sourcePath: `${input.id}.md` };
}

export function workflowFragment(input: {
  id: string;
  name: string;
  order: number;
  body: string;
  argumentHint?: string;
}): Fragment {
  const meta: WorkflowFragmentMeta = {
    id: input.id,
    name: input.name,
    category: 'workflow',
    version: '1.0.0',
    order: input.order,
    description: 'A workflow.',
    sources: ['https://example.com/docs'],
    verifiedAt: '2026-10-17',
  };
  if (input.argumentHint !== undefined) meta.argumentHint = input.argumentHint;
  return { meta, body: input.body, sourcePath: `${input.id}.md` };
}

export function resolved(fragments: readonly Fragment[], workflows: readonly Fragment[] = []): ResolvedSelection {
  return { fragments: [...fragments], workflows: [...workflows], notices: [], conflicts: [] };
}

export const LAYERED_BODY = [
  '## Summary',
  'Controllers call services, and services call the data layer.',
  '',
  '## Map',
  '| Path | Responsibility |',
  '| :--- | :--- |',
  '| `{{src}}domain/` | Business rules. |',
  '| `{{src}}application/` | Use cases. |',
  '| `{{src}}components/` | UI modules. |',
  '| `{{src}}components/<group>/` | One component group. |',
  '',
  '## Directives',
  '- **ALWAYS** depend inward.',
  '- **NEVER** import infrastructure from domain.',
  '',
  '## Contract',
  '```ts',
  'const example = true;',
  '```',
].join('\n');

export function layeredFragment(body: string = LAYERED_BODY): Fragment {
  return ruleFragment({
    id: 'layered',
    name: 'Layered',
    category: 'architecture',
    scope: 'always',
    order: 10,
    body,
  });
}
