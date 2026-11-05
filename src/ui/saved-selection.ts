import { compareText } from '../compare-text.js';
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
  readonly excluded: readonly string[];
}

/**
 * Manifest choices replace fresh suggestions when detection does not contradict them.
 * Framework and library membership stays with detection: a new package is added,
 * and a package that is gone is not kept — except ids in `excluded`, which stay out.
 * Architecture, language, and agents are preferences, so the saved values win.
 * Confidence is raised so a later `--yes` run does not replace a saved architecture
 * with `flat`.
 */
export function draftWithSavedSelections(draft: ProjectDraft, saved: SavedSelections): ProjectDraft {
  const excluded = new Set(saved.excluded);
  return {
    ...draft,
    language: saved.language,
    architecture: { id: saved.architecture, confidence: 1 },
    frameworks: draft.frameworks.filter((id) => !excluded.has(id)),
    libraries: draft.libraries.filter((id) => !excluded.has(id)),
    suggestedAgents: [...saved.agents],
  };
}

/**
 * True when the saved framework/library set still matches detection and the
 * project did not just leave greenfield. Architecture and agents are preferences
 * and are not compared here. Excluded detected ids are ignored on both sides.
 */
export function selectionsMatchDetection(
  saved: SavedSelections,
  draft: ProjectDraft,
  fromGreenfield: boolean,
): boolean {
  if (fromGreenfield) return false;
  const excluded = new Set(saved.excluded);
  const savedIds = new Set([...saved.frameworks, ...saved.libraries]);
  const detectedIds = new Set([...draft.frameworks, ...draft.libraries]);
  return (
    listedIds(draft, savedIds, excluded).length === 0 && listedSaved(saved, detectedIds).length === 0
  );
}

/**
 * After *Customize*, detected ids that the user left unchecked join `excluded`;
 * selecting an excluded id again removes it. `--yes` and *Use this configuration*
 * leave the list alone.
 */
export function updateExcluded(input: {
  readonly previous: readonly string[];
  readonly detected: readonly string[];
  readonly selected: readonly string[];
}): string[] {
  const selected = new Set(input.selected);
  const next = new Set(input.previous);
  for (const id of input.detected) {
    if (selected.has(id)) next.delete(id);
    else next.add(id);
  }
  for (const id of selected) next.delete(id);
  return [...next].sort(compareText);
}

/** Drop ids the registry no longer has. Callers print a notice per dropped id. */
export function pruneExcluded(
  excluded: readonly string[],
  registry: Registry,
): { readonly excluded: string[]; readonly dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const id of excluded) {
    if (registry.byId.has(id)) kept.push(id);
    else dropped.push(id);
  }
  return { excluded: kept.sort(compareText), dropped: dropped.sort(compareText) };
}

export function formatSelectionChanges(input: {
  readonly saved: SavedSelections;
  readonly draft: ProjectDraft;
  readonly registry: Registry;
  /** Greenfield manifest, and `package.json` exists now (PRD §3.4). */
  readonly fromGreenfield: boolean;
  readonly theme: Theme;
}): string {
  const excluded = new Set(input.saved.excluded);
  const savedIds = new Set([...input.saved.frameworks, ...input.saved.libraries]);
  const detectedIds = new Set([...input.draft.frameworks, ...input.draft.libraries]);
  const added = listedIds(input.draft, savedIds, excluded);
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

  const excludedIds = [...input.saved.excluded].sort(compareText);
  if (excludedIds.length > 0) {
    const names = excludedIds.map((id) => fragmentName(input.registry, id)).join(', ');
    lines.push(input.theme.muted(`Excluded: ${names}`));
  }

  return lines.join('\n');
}

function listedIds(
  draft: ProjectDraft,
  savedIds: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
): string[] {
  return [...draft.frameworks, ...draft.libraries].filter(
    (id) => !savedIds.has(id) && !excluded.has(id),
  );
}

function listedSaved(saved: SavedSelections, detectedIds: ReadonlySet<string>): string[] {
  return [...saved.frameworks, ...saved.libraries].filter((id) => !detectedIds.has(id));
}
