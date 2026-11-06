import { pickerHint, truncateHint } from '../registry/hint.js';
import type { Registry } from '../registry/load.js';
import type { Fragment } from '../registry/parse.js';
import { sanitizeDisplayText } from './display-text.js';
import type { PromptOption, SelectPrompt } from './prompter.js';

/**
 * Group membership is the PRD §3.2 picker order. Labels, descriptions, and
 * `compatibleWith` still come from the registry. A fragment id that is not
 * listed here is offered after the known groups.
 */
const FRAMEWORK_GROUPS: readonly { readonly label: string; readonly ids: readonly string[] }[] = [
  { label: 'Web frontend', ids: ['react-vite'] },
  {
    label: 'Full-stack web',
    ids: ['nextjs-app-router', 'nextjs-app-router-15', 'nextjs-pages-router'],
  },
  { label: 'Backend / API', ids: ['express', 'express-4', 'fastify'] },
];

const LIBRARY_GROUPS: readonly { readonly label: string; readonly ids: readonly string[] }[] = [
  { label: 'State & Data', ids: ['zustand', 'tanstack-query'] },
  { label: 'Styling & UI', ids: ['tailwind', 'shadcn'] },
  { label: 'Forms & Validation', ids: ['react-hook-form-zod'] },
  { label: 'Testing', ids: ['vitest', 'playwright'] },
];

const LANGUAGE_ORDER = ['typescript-strict', 'typescript'] as const;
const ARCHITECTURE_ORDER = ['feature-based', 'layered', 'atomic-design', 'flat', 'modular'] as const;

/** Sentinel select value. It is not a fragment id; the wizard maps it to `frameworks: []`. */
export const OTHER_TYPESCRIPT_PROJECT = 'other-typescript-project';

export const OTHER_TYPESCRIPT_LABEL = 'Other TypeScript project (library, CLI, scripts)';

const RECOMMENDED_LANGUAGE = 'typescript-strict';
const RECOMMENDED_ARCHITECTURE = 'feature-based';

export function fragmentName(registry: Registry, id: string): string {
  return sanitizeDisplayText(registry.byId.get(id)?.meta.name ?? id);
}

export function frameworkOptions(registry: Registry, includeOther: boolean): PromptOption<string>[] {
  const options = groupedOptions(registry, 'framework', FRAMEWORK_GROUPS);
  if (!includeOther) return options;
  options.push({
    value: OTHER_TYPESCRIPT_PROJECT,
    label: OTHER_TYPESCRIPT_LABEL,
    hint: 'Base rules only',
    group: 'Other',
  });
  return options;
}

/**
 * A library with no `compatibleWith` is framework-agnostic (PRD §3.6).
 * Otherwise it is shown when one selected framework is listed.
 */
export function libraryOptions(registry: Registry, frameworkIds: readonly string[]): PromptOption<string>[] {
  const allowed = registry.byCategory('library').filter((fragment) => isCompatible(fragment, frameworkIds));
  return groupedOptionsFrom(allowed, LIBRARY_GROUPS);
}

/**
 * True when at least one listed framework (or an agnostic library) would unlock
 * a library step. Ignores the greenfield "Other TypeScript project" sentinel.
 */
export function mayOfferLibraries(
  registry: Registry,
  frameworksOffered: readonly { readonly value: string }[],
): boolean {
  if (libraryOptions(registry, []).length > 0) return true;
  const ids = frameworksOffered
    .map((option) => option.value)
    .filter((id) => id !== OTHER_TYPESCRIPT_PROJECT);
  return libraryOptions(registry, ids).length > 0;
}

export function languageOptions(registry: Registry): PromptOption<string>[] {
  return orderedOptions(registry, 'language', LANGUAGE_ORDER, (id, fragment) => {
    const base = fragmentHint(fragment);
    if (id !== RECOMMENDED_LANGUAGE) return base;
    return truncateHint(`recommended · ${base}`);
  });
}

export function architectureOptions(registry: Registry): PromptOption<string>[] {
  return orderedOptions(registry, 'architecture', ARCHITECTURE_ORDER, (id, fragment) => {
    if (id !== RECOMMENDED_ARCHITECTURE) return fragmentHint(fragment);
    return 'recommended · src/features/<domain>';
  });
}

export function preferredOption(
  options: readonly PromptOption<string>[],
  preferred: readonly string[],
): string | undefined {
  for (const id of preferred) {
    const match = options.find((option) => option.value === id);
    if (match !== undefined) return match.value;
  }
  return options[0]?.value;
}

export function withInitial(
  prompt: SelectPrompt<string>,
  initialValue: string | undefined,
): SelectPrompt<string> {
  if (initialValue === undefined) return prompt;
  return { ...prompt, initialValue };
}

export function valuesInOptions(
  options: readonly PromptOption<string>[],
  ids: readonly string[],
): string[] {
  const allowed = new Set(options.map((option) => option.value));
  return ids.filter((id) => allowed.has(id));
}

function isCompatible(fragment: Fragment, frameworkIds: readonly string[]): boolean {
  if (fragment.meta.category !== 'library') return false;
  const compatibleWith = fragment.meta.compatibleWith;
  if (compatibleWith === undefined) return true;
  return compatibleWith.some((id) => frameworkIds.includes(id));
}

function groupedOptions(
  registry: Registry,
  category: 'framework' | 'library',
  groups: readonly { readonly label: string; readonly ids: readonly string[] }[],
): PromptOption<string>[] {
  return groupedOptionsFrom(registry.byCategory(category), groups);
}

function groupedOptionsFrom(
  fragments: readonly Fragment[],
  groups: readonly { readonly label: string; readonly ids: readonly string[] }[],
): PromptOption<string>[] {
  const byId = new Map(fragments.map((fragment) => [fragment.meta.id, fragment]));
  const used = new Set<string>();
  const options: PromptOption<string>[] = [];

  for (const group of groups) {
    for (const id of group.ids) {
      const fragment = byId.get(id);
      if (fragment === undefined) continue;
      used.add(id);
      options.push(optionFor(fragment, group.label));
    }
  }

  for (const fragment of fragments) {
    if (used.has(fragment.meta.id)) continue;
    options.push(optionFor(fragment, 'Other'));
  }

  return options;
}

function orderedOptions(
  registry: Registry,
  category: 'language' | 'architecture',
  order: readonly string[],
  hintFor: (id: string, fragment: Fragment) => string,
): PromptOption<string>[] {
  const fragments = registry.byCategory(category);
  const byId = new Map(fragments.map((fragment) => [fragment.meta.id, fragment]));
  const used = new Set<string>();
  const options: PromptOption<string>[] = [];

  for (const id of order) {
    const fragment = byId.get(id);
    if (fragment === undefined) continue;
    used.add(id);
    options.push(promptOption(id, fragment.meta.name, hintFor(id, fragment)));
  }

  for (const fragment of fragments) {
    if (used.has(fragment.meta.id)) continue;
    options.push(promptOption(fragment.meta.id, fragment.meta.name, hintFor(fragment.meta.id, fragment)));
  }

  return options;
}

function optionFor(fragment: Fragment, group: string): PromptOption<string> {
  return {
    ...promptOption(fragment.meta.id, fragment.meta.name, fragmentHint(fragment)),
    group,
  };
}

function fragmentHint(fragment: Fragment): string {
  return pickerHint(fragment.meta.hint, fragment.meta.description);
}

function promptOption(id: string, label: string, hint: string): PromptOption<string> {
  return {
    value: id,
    label: sanitizeDisplayText(label),
    hint: sanitizeDisplayText(hint),
  };
}
