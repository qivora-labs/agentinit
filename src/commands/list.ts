import type { Writable } from 'node:stream';
import type { RunContext } from '../context.js';
import { AgentInitError } from '../errors.js';
import { SUCCESS } from '../exit-codes.js';
import { FRAGMENT_CATEGORIES, loadRegistry, type Registry } from '../registry/load.js';
import type { Fragment } from '../registry/parse.js';
import type { FragmentCategory } from '../types.js';
import type { Logger } from '../ui/logger.js';
import { paintGroupedList } from '../ui/paint.js';

export interface ListOptions {
  stdout: Writable;
  registryDir?: string;
  category?: string;
}

interface ListEntry {
  id: string;
  name: string;
  category: FragmentCategory;
  version: string;
  description: string;
}

export async function list(ctx: RunContext, logger: Logger, options: ListOptions): Promise<number> {
  const category = readCategory(options.category);
  const registry = options.registryDir === undefined
    ? await loadRegistry()
    : await loadRegistry(options.registryDir);
  const entries = listEntries(registry, category);

  if (ctx.json) {
    // The logger sends info() to stderr in json mode so stdout stays a payload.
    options.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return SUCCESS;
  }

  const body = entries.length === 0 ? 'No fragments available.' : formatGrouped(entries);
  logger.info(entries.length === 0 ? body : paintGroupedList(body, logger.theme));
  logger.close();
  return SUCCESS;
}

function listEntries(registry: Registry, category: FragmentCategory | undefined): ListEntry[] {
  const fragments = category === undefined ? fragmentsInCategoryOrder(registry) : registry.byCategory(category);
  return fragments.map((fragment) => ({
    id: fragment.meta.id,
    name: fragment.meta.name,
    category: fragment.meta.category,
    version: fragment.meta.version,
    description: fragment.meta.description,
  }));
}

function fragmentsInCategoryOrder(registry: Registry): Fragment[] {
  const ordered: Fragment[] = [];
  for (const category of FRAGMENT_CATEGORIES) {
    ordered.push(...registry.byCategory(category));
  }
  return ordered;
}

function formatGrouped(entries: readonly ListEntry[]): string {
  const idWidth = Math.max(...entries.map((entry) => entry.id.length));
  const nameWidth = Math.max(...entries.map((entry) => entry.name.length));
  const blocks: string[] = [];
  for (const category of FRAGMENT_CATEGORIES) {
    const rows = entries.filter((entry) => entry.category === category);
    if (rows.length === 0) continue;
    const lines = rows.map(
      (row) => `  ${row.id.padEnd(idWidth)}  ${row.name.padEnd(nameWidth)}  ${row.description}`,
    );
    blocks.push([category, ...lines].join('\n'));
  }
  return blocks.join('\n\n');
}

function readCategory(value: string | undefined): FragmentCategory | undefined {
  if (value === undefined) return undefined;
  const category = value.trim();
  if (category.length === 0) {
    throw new AgentInitError('Flag --category requires a category name.');
  }
  if (!isFragmentCategory(category)) {
    throw new AgentInitError(
      `Unknown category "${category}". Valid categories: ${FRAGMENT_CATEGORIES.join(', ')}.`,
    );
  }
  return category;
}

function isFragmentCategory(value: string): value is FragmentCategory {
  for (const category of FRAGMENT_CATEGORIES) {
    if (category === value) return true;
  }
  return false;
}
