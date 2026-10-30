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
  withInitial,
} from './catalog.js';
import type { PromptedSetup } from './choices.js';
import type { MultiSelectPrompt, Prompter } from './prompter.js';

export interface GreenfieldOptions {
  /** `--agents` skips the agent prompt. */
  readonly agents?: readonly AgentTarget[];
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

  const framework = await prompter.select({
    message: 'Which framework is this project?',
    options: frameworkOptions(registry, true),
  });
  const frameworks = framework === OTHER_TYPESCRIPT_PROJECT ? [] : [framework];

  const language = await prompter.select(
    withInitial(
      {
        message: 'How strict should TypeScript be?',
        options: languages,
      },
      preferredOption(languages, ['typescript-strict']),
    ),
  );

  const libraries = await multiselectOrEmpty(prompter, {
    message: 'Which libraries should we include?',
    options: libraryOptions(registry, frameworks),
  });

  const architecture = await prompter.select(
    withInitial(
      {
        message: 'Which architecture should we follow?',
        options: architectures,
      },
      preferredOption(architectures, ['feature-based']),
    ),
  );

  const agents = await selectAgents(prompter, agentInput(options?.agents));
  return {
    selection: manualSelection({ language, architecture, frameworks, libraries }),
    agents,
  };
}

function agentInput(override: readonly AgentTarget[] | undefined): AgentPromptInput {
  if (override === undefined) return { preselected: [] };
  return { preselected: [], override };
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

async function multiselectOrEmpty(
  prompter: Prompter,
  prompt: MultiSelectPrompt<string>,
): Promise<string[]> {
  if (prompt.options.length === 0) return [];
  return prompter.multiselect(prompt);
}
