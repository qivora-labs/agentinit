import type { DetectionWarning, ProjectDraft } from '../detect/index.js';
import type { Registry } from '../registry/load.js';
import type { RegistryNotice, Selection, SelectionOrigin } from '../registry/resolve.js';
import type { AgentTarget } from '../types.js';
import { selectAgents, type AgentPromptInput } from './agents.js';
import {
  architectureOptions,
  frameworkOptions,
  languageOptions,
  libraryOptions,
  preferredOption,
  valuesInOptions,
  withInitial,
} from './catalog.js';
import type { PromptedSetup } from './choices.js';
import { LOW_ARCHITECTURE_CONFIDENCE } from './confidence.js';
import {
  formatConfidence,
  formatRegistryNotice,
  formatSummary,
  formatSummaryTitle,
  formatWarning,
} from './format.js';
import type { MultiSelectPrompt, PromptOption, Prompter } from './prompter.js';
import type { Theme } from './theme.js';

export interface SummaryExtras {
  readonly theme: Theme;
  readonly notices?: readonly RegistryNotice[];
  readonly warnings?: readonly DetectionWarning[];
  /** `--agents` skips the agent prompt. A saved manifest list does the same. */
  readonly agents?: readonly AgentTarget[];
  /**
   * Replaces the full detection box. Re-runs pass only the delta, because the
   * manifest already holds the previous choices (PRD §3.4).
   */
  readonly summary?: string;
  readonly title?: string;
}

interface ChosenFragments {
  readonly language: string;
  readonly architecture: string;
  readonly frameworks: readonly string[];
  readonly libraries: readonly string[];
  /** Set when the low-confidence prompt replaced the inferred architecture. */
  readonly architectureManual: boolean;
}

type ConfigurationChoice = 'use' | 'customize';

/**
 * Existing-project summary from PRD §3.3 steps 4–5.
 * Low-confidence architecture still asks, including after "Use this configuration".
 */
export async function confirmDetected(
  prompter: Prompter,
  draft: ProjectDraft,
  registry: Registry,
  extras: SummaryExtras,
): Promise<PromptedSetup> {
  prompter.note(
    summaryNote(draft, registry, extras),
    extras.summary === undefined
      ? formatSummaryTitle(draft.name)
      : (extras.title ?? 'What changed'),
  );

  const options: readonly PromptOption<ConfigurationChoice>[] = [
    { value: 'use', label: 'Use this configuration' },
    { value: 'customize', label: 'Customize' },
  ];
  const choice = await prompter.select<ConfigurationChoice>({
    message: 'Use this configuration, or customize?',
    options,
    initialValue: 'use',
  });

  const chosen = choice === 'customize'
    ? await customize(prompter, draft, registry, detectedInitial(draft))
    : await acceptDetected(prompter, draft, registry);

  const agents = await selectAgents(prompter, agentInput(draft, extras.agents));
  return { selection: toSelection(draft, chosen, choice), agents };
}

/**
 * Review-card *Change setup*: customize prompts then agents, with the current
 * answers preselected. `--agents` still skips the agent prompt.
 */
export async function changeExistingSetup(
  prompter: Prompter,
  draft: ProjectDraft,
  registry: Registry,
  current: PromptedSetup,
  extras?: { readonly agents?: readonly AgentTarget[] },
): Promise<PromptedSetup> {
  const chosen = await customize(prompter, draft, registry, {
    language: current.selection.language,
    architecture: current.selection.architecture,
    frameworks: current.selection.frameworks,
    libraries: current.selection.libraries,
  });
  const agents = await selectAgents(
    prompter,
    agentInput(draft, extras?.agents, current.agents),
  );
  return { selection: toSelection(draft, chosen, 'customize'), agents };
}

async function acceptDetected(
  prompter: Prompter,
  draft: ProjectDraft,
  registry: Registry,
): Promise<ChosenFragments> {
  const base = {
    language: draft.language,
    frameworks: [...draft.frameworks],
    libraries: [...draft.libraries],
  };
  if (draft.architecture.confidence >= LOW_ARCHITECTURE_CONFIDENCE) {
    return { ...base, architecture: draft.architecture.id, architectureManual: false };
  }

  const options = architectureOptions(registry);
  const architecture = await prompter.select(
    withInitial(
      {
        message: architectureQuestion(draft),
        options,
      },
      preferredOption(options, ['flat']),
    ),
  );
  return { ...base, architecture, architectureManual: true };
}

interface CustomizeInitial {
  readonly language: string;
  readonly architecture: string;
  readonly frameworks: readonly string[];
  readonly libraries: readonly string[];
}

function detectedInitial(draft: ProjectDraft): CustomizeInitial {
  return {
    language: draft.language,
    architecture: draft.architecture.id,
    frameworks: draft.frameworks,
    libraries: draft.libraries,
  };
}

async function customize(
  prompter: Prompter,
  draft: ProjectDraft,
  registry: Registry,
  initial: CustomizeInitial,
): Promise<ChosenFragments> {
  const languages = languageOptions(registry);
  const language = await prompter.select(
    withInitial(
      { message: 'How strict should TypeScript be?', options: languages },
      preferredOption(languages, [initial.language, 'typescript-strict']),
    ),
  );

  const frameworkChoices = frameworkOptions(registry, false);
  const frameworks = await multiselectOrEmpty(prompter, {
    message: 'Which frameworks should we include?',
    options: frameworkChoices,
    initialValues: valuesInOptions(frameworkChoices, initial.frameworks),
  });

  const libraryChoices = libraryOptions(registry, frameworks);
  const libraries = await multiselectOrEmpty(prompter, {
    message: 'Which libraries should we include?',
    options: libraryChoices,
    initialValues: valuesInOptions(libraryChoices, initial.libraries),
  });

  const architectures = architectureOptions(registry);
  const preferred = draft.architecture.confidence < LOW_ARCHITECTURE_CONFIDENCE
    ? ['flat', initial.architecture]
    : [initial.architecture, 'feature-based'];
  const architecture = await prompter.select(
    withInitial(
      { message: 'Which architecture should we follow?', options: architectures },
      preferredOption(architectures, preferred),
    ),
  );

  return { language, architecture, frameworks, libraries, architectureManual: false };
}

function toSelection(
  draft: ProjectDraft,
  chosen: ChosenFragments,
  choice: ConfigurationChoice,
): Selection {
  const origin: Record<string, SelectionOrigin> = {};
  const mark = (id: string, manual: boolean): void => {
    origin[id] = manual ? 'manual' : 'detected';
  };

  if (choice === 'customize') {
    for (const id of [chosen.language, chosen.architecture, ...chosen.frameworks, ...chosen.libraries]) {
      mark(id, true);
    }
  } else {
    mark(chosen.language, false);
    mark(chosen.architecture, chosen.architectureManual);
    for (const id of chosen.frameworks) mark(id, false);
    for (const id of chosen.libraries) mark(id, false);
  }

  return {
    language: chosen.language,
    architecture: chosen.architecture,
    frameworks: chosen.frameworks,
    libraries: chosen.libraries,
    origin,
  };
}

/**
 * A custom summary replaces the full detection box. Notices and warnings still
 * belong on that note, because a re-run otherwise hides an unsupported package
 * or a legacy rule file (PRD §3.4).
 */
function summaryNote(draft: ProjectDraft, registry: Registry, extras: SummaryExtras): string {
  if (extras.summary === undefined) {
    return formatSummary({
      draft,
      registry,
      notices: extras.notices ?? [],
      warnings: extras.warnings ?? [],
      theme: extras.theme,
    });
  }

  const lines = [
    ...(extras.notices ?? []).map((notice) => formatRegistryNotice(notice, registry)),
    ...(extras.warnings ?? []).map((warning) => formatWarning(warning)),
  ];
  if (lines.length === 0) return extras.summary;
  return `${extras.summary}\n${lines.join('\n')}`;
}

function agentInput(
  draft: ProjectDraft,
  override: readonly AgentTarget[] | undefined,
  preselected: readonly AgentTarget[] = draft.suggestedAgents,
): AgentPromptInput {
  if (override === undefined) return { preselected };
  return { preselected, override };
}

function architectureQuestion(draft: ProjectDraft): string {
  const confidence = formatConfidence(draft.architecture.confidence);
  const limit = formatConfidence(LOW_ARCHITECTURE_CONFIDENCE);
  return `Architecture confidence is ${confidence}, below ${limit}. Which architecture should we use?`;
}

async function multiselectOrEmpty(
  prompter: Prompter,
  prompt: MultiSelectPrompt<string>,
): Promise<string[]> {
  if (prompt.options.length === 0) return [];
  // Clack defaults `required` to true and rejects the empty selection this step allows.
  return prompter.multiselect({ ...prompt, required: false });
}
