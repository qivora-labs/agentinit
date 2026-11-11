import { compareText } from '../compare-text.js';
import { AgentInitError } from '../errors.js';
import type { ResolvedSelection } from '../registry/resolve.js';
import type { Fragment, RuleFragmentMeta, WorkflowFragmentMeta } from '../registry/schema.js';
import type { FragmentScope, ProjectProfile } from '../types.js';
import { omitSection } from '../registry/parse.js';
import { renderBody, renderGlobs, type PlaceholderContext } from './placeholders.js';
import type { RenderedFragment, RenderedWorkflow, ScopedFragments, TargetContext } from './types.js';

/** `src/` or empty, plus the profile's package manager and scripts. */
export function placeholderContextFor(profile: ProjectProfile): PlaceholderContext {
  return {
    src: profile.srcDir === 'src' ? 'src/' : '',
    pm: profile.packageManager,
    scripts: profile.scripts,
  };
}

const NO_OMIT_H1: ReadonlySet<string> = new Set();

/** Render every resolved fragment body and glob for one profile. */
export function renderTargetContext(profile: ProjectProfile, resolved: ResolvedSelection): TargetContext {
  const placeholders = placeholderContextFor(profile);
  const grouped: Record<FragmentScope, RenderedFragment[]> = {
    always: [],
    glob: [],
    auto: [],
    manual: [],
  };

  for (const fragment of resolved.fragments) {
    if (!isRule(fragment)) continue;
    const rendered = renderRule(fragment, placeholders);
    grouped[rendered.scope].push(rendered);
  }

  const fragments: ScopedFragments = {
    always: sortFragments(grouped.always),
    glob: sortFragments(grouped.glob),
    auto: sortFragments(grouped.auto),
    manual: sortFragments(grouped.manual),
  };

  const workflows = resolved.workflows.filter(isWorkflow).map((fragment) => renderWorkflow(fragment, placeholders));
  workflows.sort(compareRendered);

  return { profile, fragments, workflows, placeholders, omitBlockH1: NO_OMIT_H1 };
}

/** The architecture selected on the profile, searched across every scope. */
export function architectureFragment(ctx: TargetContext): RenderedFragment {
  const fragments = [
    ...ctx.fragments.always,
    ...ctx.fragments.glob,
    ...ctx.fragments.auto,
    ...ctx.fragments.manual,
  ];
  const found = fragments.find(
    (fragment) => fragment.category === 'architecture' && fragment.id === ctx.profile.architecture.id,
  );
  if (found === undefined) {
    throw new AgentInitError(`Architecture fragment "${ctx.profile.architecture.id}" was not resolved.`);
  }
  return found;
}

/** `scope: always` fragments other than the architecture summary, in `order` then `id`. */
export function nonArchitectureAlways(ctx: TargetContext): readonly RenderedFragment[] {
  return ctx.fragments.always.filter((fragment) => fragment.category !== 'architecture');
}

/**
 * Body written into agent rule files. Framework `## Map` is for
 * `ARCHITECTURE.md` only (PRD §4.4), so scoped rules omit it.
 */
export function agentRuleBody(fragment: RenderedFragment): string {
  if (fragment.category !== 'framework') return fragment.body;
  return omitSection(fragment.body, 'Map');
}

function renderRule(fragment: Fragment & { meta: RuleFragmentMeta }, placeholders: PlaceholderContext): RenderedFragment {
  const meta = fragment.meta;
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    scope: meta.scope,
    order: meta.order,
    body: renderBody(fragment.body, placeholders),
    globs: meta.globs === undefined ? [] : renderGlobs(meta.globs, placeholders),
  };
}

function renderWorkflow(
  fragment: Fragment & { meta: WorkflowFragmentMeta },
  placeholders: PlaceholderContext,
): RenderedWorkflow {
  const meta = fragment.meta;
  const rendered: RenderedWorkflow = {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    order: meta.order,
    body: renderBody(fragment.body, placeholders),
  };
  if (meta.argumentHint === undefined) return rendered;
  return { ...rendered, argumentHint: meta.argumentHint };
}

function isRule(fragment: Fragment): fragment is Fragment & { meta: RuleFragmentMeta } {
  return fragment.meta.category !== 'workflow';
}

function isWorkflow(fragment: Fragment): fragment is Fragment & { meta: WorkflowFragmentMeta } {
  return fragment.meta.category === 'workflow';
}

function sortFragments(fragments: readonly RenderedFragment[]): RenderedFragment[] {
  return [...fragments].sort(compareRendered);
}

function compareRendered(left: { order: number; id: string }, right: { order: number; id: string }): number {
  if (left.order !== right.order) return left.order - right.order;
  return compareText(left.id, right.id);
}
