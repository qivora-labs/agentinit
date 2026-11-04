import type { ProjectDraft } from '../detect/index.js';
import type { Registry } from '../registry/load.js';
import type { AgentTarget, Language } from '../types.js';
import { alignColumns } from './align.js';
import { formatFragmentValue } from './format.js';
import { fragmentName } from './catalog.js';
import type { Theme } from './theme.js';

/**
 * The selection fields stored in `.agentinit/manifest.json`.
 * Callers pass the manifest object; this module does not read it.
 */
export interface SavedSelections {
  readonly language: Language;
  readonly frameworks: readonly string[];
  readonly libraries: readonly string[];
  readonly architecture: string;
  readonly agents: readonly AgentTarget[];
}

/**
 * Manifest choices replace fresh suggestions when detection does not contradict them.
 * Framework and library membership stays with detection: a new package is added,
 * and a package that is gone is not kept. Architecture, language, and agents are
 * preferences, so the saved values win. Confidence is raised so a later `--yes`
 * run does not replace a saved architecture with `flat`.
 */
export function draftWithSavedSelections(draft: ProjectDraft, saved: SavedSelections): ProjectDraft {
  return {
    ...draft,
    language: saved.language,
    architecture: { id: saved.architecture, confidence: 1 },
    suggestedAgents: [...saved.agents],
  };
}

export function formatSelectionChanges(input: {
  readonly saved: SavedSelections;
  readonly draft: ProjectDraft;
  readonly registry: Registry;
  /** Greenfield manifest, and `package.json` exists now (PRD §3.4). */
  readonly fromGreenfield: boolean;
  readonly theme: Theme;
}): string {
  const savedIds = new Set([...input.saved.frameworks, ...input.saved.libraries]);
  const detectedIds = new Set([...input.draft.frameworks, ...input.draft.libraries]);
  const added = listedIds(input.draft, savedIds);
  const removed = listedSaved(input.saved, detectedIds);
  const lines: string[] = [];
  const rows: string[][] = [];

  if (input.fromGreenfield) {
    lines.push('A package.json is present. Keeping the saved architecture and agents.');
  }

  if (added.length === 0 && removed.length === 0) {
    if (!input.fromGreenfield) lines.push('No package changes since the last run.');
  } else {
    for (let index = 0; index < added.length; index += 1) {
      const id = added[index];
      if (id === undefined) continue;
      rows.push([
        index === 0 ? input.theme.muted('Added') : '',
        formatFragmentValue(input.registry, id, input.draft.packages, input.theme),
      ]);
    }
    for (let index = 0; index < removed.length; index += 1) {
      const id = removed[index];
      if (id === undefined) continue;
      rows.push([
        index === 0 ? input.theme.muted('Removed') : '',
        fragmentName(input.registry, id),
      ]);
    }
  }

  if (input.fromGreenfield) {
    rows.push([
      input.theme.muted('Layout'),
      input.draft.srcDir === 'src' ? 'src/' : 'project root',
    ]);
  }

  if (rows.length > 0) lines.push(...alignColumns(rows));
  return lines.join('\n');
}

function listedIds(draft: ProjectDraft, savedIds: ReadonlySet<string>): string[] {
  return [...draft.frameworks, ...draft.libraries].filter((id) => !savedIds.has(id));
}

function listedSaved(saved: SavedSelections, detectedIds: ReadonlySet<string>): string[] {
  return [...saved.frameworks, ...saved.libraries].filter((id) => !detectedIds.has(id));
}
