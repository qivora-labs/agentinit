import type { PlaceholderContext } from './placeholders.js';
import type { FileOp, FragmentCategory, FragmentScope, ProjectProfile } from '../types.js';

/** A rule fragment after `{{src}}`, `{{pm}}`, and `{{scripts.*}}` rendering. */
export interface RenderedFragment {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: Exclude<FragmentCategory, 'workflow'>;
  readonly scope: FragmentScope;
  readonly order: number;
  readonly body: string;
  readonly globs: readonly string[];
}

/** A workflow fragment after placeholder rendering. */
export interface RenderedWorkflow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly order: number;
  readonly body: string;
  readonly argumentHint?: string;
}

export interface ScopedFragments {
  readonly always: readonly RenderedFragment[];
  readonly glob: readonly RenderedFragment[];
  readonly auto: readonly RenderedFragment[];
  readonly manual: readonly RenderedFragment[];
}

/**
 * Everything a target adapter needs. Adapters must not read disk, the clock,
 * or each other; scoped rules and workflows are already rendered here.
 */
export interface TargetContext {
  readonly profile: ProjectProfile;
  readonly fragments: ScopedFragments;
  readonly workflows: readonly RenderedWorkflow[];
  readonly placeholders: PlaceholderContext;
}

export type TargetAdapter = (ctx: TargetContext) => FileOp[];

/** Raised when the AGENTS.md core block is over the PRD §4.4 budget. */
export interface PlanWarning {
  readonly kind: 'always-on-tokens';
  readonly tokens: number;
  readonly limit: number;
}

export interface Plan {
  ops: FileOp[];
  alwaysOnTokens: number;
  warnings: PlanWarning[];
}
