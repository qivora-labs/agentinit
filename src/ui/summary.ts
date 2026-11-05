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
  mayOfferLibraries,
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
import { updateExcluded } from './saved-selection.js';
import { countSetupSteps, withStep } from './steps.js';
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
  /** Previous `selections.excluded`. *Customize* updates it; *Use* keeps it. */
  readonly excluded?: readonly string[];
  /**
   * Framework/library ids detection suggested (before applying `excluded`).
   * *Customize* uses these to decide what joins `excluded`.
   */
  readonly detectedIds?: readonly string[];
}

interface ChosenFragments {
  readonly language: string;
  readonly architecture: string;
  readonly frameworks: readonly string[];
  readonly libraries: readonly string[];
  /** Set when the low-confidence prompt replaced the inferred architecture. */
  readonly architectureManual: boolean;
  /** Agent prompt position after customize; omitted when `--agents` skips it. */
  readonly agentStep?: number;
  readonly agentTotal?: number;
}

type ConfigurationChoice = 'use' | 'customize';

export type UpToDateChoice = 'done' | 'change';

/**
 * Interactive re-run when nothing would change (PRD §3.4).
 * *Done* (default) exits; *Change setup* continues into customize.
 */
export async function confirmUpToDate(prompter: Prompter): Promise<UpToDateChoice> {
  const options: readonly PromptOption<UpToDateChoice>[] = [
    { value: 'done', label: 'Done' },
    { value: 'change', label: 'Change setup' },
  ];
  return prompter.select<UpToDateChoice>({
    message: 'What next?',
    options,
    initialValue: 'done',
  });
}

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

  const askAgents = extras.agents === undefined;
  const chosen = choice === 'customize'
    ? await customize(prompter, draft, registry, detectedInitial(draft), askAgents)
    : await acceptDetected(prompter, draft, registry);

  const agents = await selectAgents(
    prompter,
    agentInput(draft, extras.agents),
    agentStepInfo(chosen),
  );
  const selection = toSelection(draft, chosen, choice);
  const previousExcluded = extras.excluded ?? [];
  const detectedIds = extras.detectedIds ?? [...draft.frameworks, ...draft.libraries];
  const excluded =
    choice === 'customize'
      ? updateExcluded({
          previous: previousExcluded,
          detected: detectedIds,
          selected: [...selection.frameworks, ...selection.libraries],
        })
      : [...previousExcluded];
  return { selection, agents, excluded };
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
  extras?: { readonly agents?: readonly AgentTarget[]; readonly excluded?: readonly string[] },
): Promise<PromptedSetup> {
  const askAgents = extras?.agents === undefined;
  const chosen = await customize(
    prompter,
    draft,
    registry,
    {
      language: current.selection.language,
      architecture: current.selection.architecture,
      frameworks: current.selection.frameworks,
      libraries: current.selection.libraries,
    },
    askAgents,
  );
  const agents = await selectAgents(
    prompter,
    agentInput(draft, extras?.agents, current.agents),
    agentStepInfo(chosen),
  );
  const selection = toSelection(draft, chosen, 'customize');
  const previousExcluded = extras?.excluded ?? current.excluded ?? [];
  return {
    selection,
    agents,
    excluded: updateExcluded({
      previous: previousExcluded,
      detected: [...draft.frameworks, ...draft.libraries],
      selected: [...selection.frameworks, ...selection.libraries],
    }),
  };
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
  askAgents: boolean,
): Promise<ChosenFragments> {
  const languages = languageOptions(registry);
  const frameworkChoices = frameworkOptions(registry, false);
  // Before frameworks are chosen, count a library step when any listed
  // framework (or an agnostic library) would unlock one.
  let total = countSetupSteps({
    libraries: mayOfferLibraries(registry, frameworkChoices),
    agents: askAgents,
  });
  let step = 1;

  const language = await prompter.select(
    withInitial(
      {
        message: withStep(step, total, 'How strict should TypeScript be?'),
        options: languages,
      },
      preferredOption(languages, [initial.language, 'typescript-strict']),
    ),
  );
  step += 1;

  const frameworks = await groupMultiselectOrEmpty(prompter, {
    message: withStep(step, total, 'Which frameworks should we include?'),
    options: frameworkChoices,
    initialValues: valuesInOptions(frameworkChoices, initial.frameworks),
  });
  step += 1;

  const libraryChoices = libraryOptions(registry, frameworks);
  total = countSetupSteps({ libraries: libraryChoices.length > 0, agents: askAgents });

  const libraries = await groupMultiselectOrEmpty(prompter, {
    message: withStep(step, total, 'Which libraries should we include?'),
    options: libraryChoices,
    initialValues: valuesInOptions(libraryChoices, initial.libraries),
  });
  if (libraryChoices.length > 0) step += 1;

  const architectures = architectureOptions(registry);
  const preferred = draft.architecture.confidence < LOW_ARCHITECTURE_CONFIDENCE
    ? ['flat', initial.architecture]
    : [initial.architecture, 'feature-based'];
  const architecture = await prompter.select(
    withInitial(
      {
        message: withStep(step, total, 'Which architecture should we follow?'),
        options: architectures,
      },
      preferredOption(architectures, preferred),
    ),
  );
  step += 1;

  if (!askAgents) {
    return { language, architecture, frameworks, libraries, architectureManual: false };
  }
  return {
    language,
    architecture,
    frameworks,
    libraries,
    architectureManual: false,
    agentStep: step,
    agentTotal: total,
  };
}

function agentStepInfo(
  chosen: ChosenFragments,
): { readonly step: number; readonly total: number } | undefined {
  if (chosen.agentStep === undefined || chosen.agentTotal === undefined) return undefined;
  return { step: chosen.agentStep, total: chosen.agentTotal };
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
  return `Not sure about the architecture (${confidence}). Which one should we use?`;
}

async function groupMultiselectOrEmpty(
  prompter: Prompter,
  prompt: MultiSelectPrompt<string>,
): Promise<string[]> {
  if (prompt.options.length === 0) return [];
  // Clack defaults `required` to true and rejects the empty selection this step allows.
  return prompter.groupMultiselect({ ...prompt, required: false });
}
