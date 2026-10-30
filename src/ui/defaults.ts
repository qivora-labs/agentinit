import type { ProjectDraft } from '../detect/index.js';
import { AgentInitError, UnsupportedProjectError } from '../errors.js';
import { ERROR } from '../exit-codes.js';
import type { SelectionOrigin } from '../registry/resolve.js';
import type { AgentTarget } from '../types.js';
import { resolvedAgents } from './agents.js';
import type { PromptedSetup } from './choices.js';
import { LOW_ARCHITECTURE_CONFIDENCE } from './confidence.js';
import type { LowConfidenceNotice } from './format.js';

const LOW_CONFIDENCE_ARCHITECTURE = 'flat';

/**
 * File rows from PRD §3.5. `io/` applies them (T26) and cannot import this
 * module; the values are repeated there on purpose.
 */
export const FILE_DEFAULTS = {
  unmanagedShared: 'adopt',
  unmanagedNonShared: 'skip',
  managedEdited: 'skip',
} as const;

export type FileDefaults = typeof FILE_DEFAULTS;

export type NonInteractiveInput =
  | { readonly kind: 'greenfield' }
  | { readonly kind: 'javascript' }
  | { readonly kind: 'monorepo'; readonly tool: string }
  | {
      readonly kind: 'existing';
      readonly draft: ProjectDraft;
      readonly belowGitRoot: boolean;
    };

export interface NonInteractiveOptions {
  /** `--agents`. When set, detection preselection is ignored. */
  readonly agents?: readonly AgentTarget[];
}

export interface NonInteractiveSetup extends PromptedSetup {
  /** `--yes` never switches to the git root. */
  readonly useGitRoot: false;
  readonly notices: readonly LowConfidenceNotice[];
  readonly files: FileDefaults;
}

/**
 * Every `--yes` row in PRD §3.5. Error rows are returned, not thrown, so the
 * caller can map them to an exit code without a second channel.
 * JavaScript and monorepo wording matches `detectProject`.
 */
export function nonInteractiveSelection(
  input: NonInteractiveInput,
  options: NonInteractiveOptions = {},
): NonInteractiveSetup | AgentInitError {
  switch (input.kind) {
    case 'greenfield':
      return new AgentInitError('An empty project needs interactive choices.', {
        exitCode: ERROR,
        hint: 'Run again without --yes.',
      });
    case 'javascript':
      return new UnsupportedProjectError("JavaScript projects aren't supported yet");
    case 'monorepo':
      return new AgentInitError(
        `This directory is a monorepo root (${input.tool}). Run inside a single package.`,
        { exitCode: ERROR },
      );
    case 'existing':
      // belowGitRoot is part of the input so the caller can record it.
      // --yes always stays in the current directory.
      return existingSelection(input.draft, options);
  }
}

function existingSelection(draft: ProjectDraft, options: NonInteractiveOptions): NonInteractiveSetup {
  const lowConfidence = draft.architecture.confidence < LOW_ARCHITECTURE_CONFIDENCE;
  const architecture = lowConfidence ? LOW_CONFIDENCE_ARCHITECTURE : draft.architecture.id;
  const notices: LowConfidenceNotice[] = lowConfidence
    ? [{ kind: 'low-confidence-architecture', confidence: draft.architecture.confidence }]
    : [];

  return {
    selection: {
      language: draft.language,
      architecture,
      frameworks: [...draft.frameworks],
      libraries: [...draft.libraries],
      origin: originFor(draft, architecture, lowConfidence),
    },
    agents: resolvedAgents(draft.suggestedAgents, options.agents),
    useGitRoot: false,
    notices,
    files: FILE_DEFAULTS,
  };
}

function originFor(
  draft: ProjectDraft,
  architecture: string,
  architectureIsManual: boolean,
): Record<string, SelectionOrigin> {
  const origin: Record<string, SelectionOrigin> = {};
  origin[draft.language] = 'detected';
  origin[architecture] = architectureIsManual ? 'manual' : 'detected';
  for (const id of draft.frameworks) origin[id] = 'detected';
  for (const id of draft.libraries) origin[id] = 'detected';
  return origin;
}

export function isNonInteractiveSetup(
  result: NonInteractiveSetup | AgentInitError,
): result is NonInteractiveSetup {
  return !(result instanceof AgentInitError);
}
