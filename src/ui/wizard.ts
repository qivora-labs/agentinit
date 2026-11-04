import { AgentInitError } from '../errors.js';
import type { Registry } from '../registry/load.js';
import type { Selection, SelectionOrigin } from '../registry/resolve.js';
import type { AgentTarget } from '../types.js';
import { selectAgents, type AgentPromptInput } from './agents.js';
import {
  architectureOptions,
  frameworkOptions,
  languageOptions,
  libraryOptions,
  OTHER_TYPESCRIPT_PROJECT,
  preferredOption,
  valuesInOptions,
  withInitial,
} from './catalog.js';
import type { PromptedSetup } from './choices.js';
import type { MultiSelectPrompt, Prompter } from './prompter.js';
import { countSetupSteps, withStep } from './steps.js';

export interface GreenfieldInitial {
  readonly language?: string;
  readonly architecture?: string;
  readonly frameworks?: readonly string[];
  readonly libraries?: readonly string[];
  /** Preselects the agent prompt. Does not skip it; pass `agents` on options for that. */
  readonly agents?: readonly AgentTarget[];
}

export interface GreenfieldOptions {
  /** `--agents` skips the agent prompt. */
  readonly agents?: readonly AgentTarget[];
  /** Manifest selections. Each prompt starts on these instead of the recommendation. */
  readonly initial?: GreenfieldInitial;
}

/**
 * Greenfield prompts from PRD §3.2. Nothing here reads the project directory.
 * Cancelled prompts reject with exit code 130 via the prompter.
 */
export async function runGreenfieldWizard(
  prompter: Prompter,
  registry: Registry,
  options?: GreenfieldOptions,
): Promise<PromptedSetup> {
  const languages = languageOptions(registry);
  const architectures = architectureOptions(registry);
  if (languages.length === 0) {
    throw new AgentInitError('The registry has no language fragments.');
  }
  if (architectures.length === 0) {
    throw new AgentInitError('The registry has no architecture fragments.');
  }

  const askAgents = options?.agents === undefined;
  prompter.info('No package.json found. Setting up a new project.');

  const frameworksOffered = frameworkOptions(registry, true);
  // Before a framework is chosen, count a library step when any offered
  // framework (or an agnostic library) would unlock one.
  let total = countSetupSteps({
    libraries: mayOfferLibraries(registry, frameworksOffered),
    agents: askAgents,
  });
  let step = 1;

  const framework = await prompter.select(
    withInitial(
      {
        message: withStep(step, total, 'Which framework are you using?'),
        options: frameworksOffered,
      },
      initialFramework(options?.initial?.frameworks, frameworksOffered),
    ),
  );
  step += 1;
  const frameworks = framework === OTHER_TYPESCRIPT_PROJECT ? [] : [framework];

  const libraryChoices = libraryOptions(registry, frameworks);
  total = countSetupSteps({ libraries: libraryChoices.length > 0, agents: askAgents });

  const languagePreferred = preferredIds(options?.initial?.language, 'typescript-strict');
  const language = await prompter.select(
    withInitial(
      {
        message: withStep(step, total, 'How strict should TypeScript be?'),
        options: languages,
      },
      preferredOption(languages, languagePreferred),
    ),
  );
  step += 1;

  const libraries = await groupMultiselectOrEmpty(prompter, {
    message: withStep(step, total, 'Which libraries should we include?'),
    options: libraryChoices,
    initialValues: valuesInOptions(libraryChoices, options?.initial?.libraries ?? []),
  });
  if (libraryChoices.length > 0) step += 1;

  const architecturePreferred = preferredIds(options?.initial?.architecture, 'feature-based');
  const architecture = await prompter.select(
    withInitial(
      {
        message: withStep(step, total, 'Which architecture should we follow?'),
        options: architectures,
      },
      preferredOption(architectures, architecturePreferred),
    ),
  );
  step += 1;

  const agents = await selectAgents(prompter, agentInput(options), {
    step,
    total,
  });
  return {
    selection: manualSelection({ language, architecture, frameworks, libraries }),
    agents,
  };
}

/** True when at least one listed framework (or no framework) unlocks a library. */
function mayOfferLibraries(
  registry: Registry,
  frameworksOffered: readonly { readonly value: string }[],
): boolean {
  if (libraryOptions(registry, []).length > 0) return true;
  const ids = frameworksOffered
    .map((option) => option.value)
    .filter((id) => id !== OTHER_TYPESCRIPT_PROJECT);
  return libraryOptions(registry, ids).length > 0;
}

function agentInput(options: GreenfieldOptions | undefined): AgentPromptInput {
  const preselected = options?.initial?.agents ?? [];
  if (options?.agents === undefined) return { preselected };
  return { preselected, override: options.agents };
}

function preferredIds(initial: string | undefined, fallback: string): string[] {
  if (initial === undefined) return [fallback];
  return [initial, fallback];
}

function initialFramework(
  frameworks: readonly string[] | undefined,
  options: readonly { readonly value: string }[],
): string | undefined {
  if (frameworks === undefined) return undefined;
  if (frameworks.length === 0) return OTHER_TYPESCRIPT_PROJECT;
  const first = frameworks[0];
  if (first !== undefined && options.some((option) => option.value === first)) return first;
  return undefined;
}

function manualSelection(chosen: {
  readonly language: string;
  readonly architecture: string;
  readonly frameworks: readonly string[];
  readonly libraries: readonly string[];
}): Selection {
  const origin: Record<string, SelectionOrigin> = {};
  for (const id of [chosen.language, chosen.architecture, ...chosen.frameworks, ...chosen.libraries]) {
    origin[id] = 'manual';
  }
  return { ...chosen, origin };
}

async function groupMultiselectOrEmpty(
  prompter: Prompter,
  prompt: MultiSelectPrompt<string>,
): Promise<string[]> {
  if (prompt.options.length === 0) return [];
  // Clack defaults `required` to true and rejects the empty selection this step allows.
  return prompter.groupMultiselect({ ...prompt, required: false });
}
