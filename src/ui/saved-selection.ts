import type { ProjectDraft } from '../detect/index.js';
import type { Registry } from '../registry/load.js';
import type { AgentTarget, Language } from '../types.js';
import { fragmentName } from './catalog.js';
import { sanitizeDisplayText } from './display-text.js';

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
}): string {
  const savedIds = new Set([...input.saved.frameworks, ...input.saved.libraries]);
  const detectedIds = new Set([...input.draft.frameworks, ...input.draft.libraries]);
  const added = listedIds(input.draft, savedIds);
  const removed = listedSaved(input.saved, detectedIds);
  const lines: string[] = [];

  if (input.fromGreenfield) {
    lines.push('A package.json is present. Keeping the saved architecture and agents.');
  }

  if (added.length === 0 && removed.length === 0) {
    if (!input.fromGreenfield) lines.push('No package changes since the last run.');
  } else {
    if (added.length > 0) {
      lines.push('Added:');
      for (const id of added) lines.push(`  ${describeFragment(input.registry, id, input.draft.packages)}`);
    }
    if (removed.length > 0) {
      lines.push('Removed:');
      for (const id of removed) lines.push(`  ${fragmentName(input.registry, id)}`);
    }
  }

  if (input.fromGreenfield) {
    lines.push(`Layout: ${input.draft.srcDir === 'src' ? 'src/' : 'project root'}`);
  }

  return lines.join('\n');
}

function listedIds(draft: ProjectDraft, savedIds: ReadonlySet<string>): string[] {
  return [...draft.frameworks, ...draft.libraries].filter((id) => !savedIds.has(id));
}

function listedSaved(saved: SavedSelections, detectedIds: ReadonlySet<string>): string[] {
  return [...saved.frameworks, ...saved.libraries].filter((id) => !detectedIds.has(id));
}

function describeFragment(
  registry: Registry,
  id: string,
  packages: Readonly<Record<string, string>>,
): string {
  const name = fragmentName(registry, id);
  const versions = packageVersions(registry, id, packages);
  if (versions.length === 0) return name;
  return `${name} (${versions.join(', ')})`;
}

function packageVersions(
  registry: Registry,
  id: string,
  packages: Readonly<Record<string, string>>,
): string[] {
  const meta = registry.byId.get(id)?.meta;
  if (meta === undefined || meta.category === 'workflow') return [];
  const names = meta.detect?.packages;
  if (names === undefined) return [];
  return names.map((packageName) => {
    const version = packages[packageName];
    const safeName = sanitizeDisplayText(packageName);
    if (version === undefined) return safeName;
    return `${safeName}@${sanitizeDisplayText(version)}`;
  });
}
