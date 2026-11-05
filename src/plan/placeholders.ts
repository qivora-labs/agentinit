import { AgentInitError } from '../errors.js';
import type { PackageManager } from '../types.js';

const PLACEHOLDER = /\{\{([^{}\n]+)\}\}/gu;
const SCRIPT_PREFIX = 'scripts.';

/**
 * `src` is `src/` or empty so `{{src}}app` stays a relative glob.
 * `scripts` lists names that exist in package.json; the command comes from
 * `scriptCommand`, not from the script body.
 */
export interface PlaceholderContext {
  src: '' | 'src/';
  /** Null in greenfield mode, where `{{pm}}` and `{{scripts.*}}` cannot render. */
  pm: PackageManager | null;
  scripts: Record<string, string>;
}

type KnownPlaceholder =
  | { readonly kind: 'src' }
  | { readonly kind: 'pm' }
  | { readonly kind: 'script'; readonly name: string };

interface FenceSpan {
  readonly start: number;
  readonly end: number;
  readonly closed: boolean;
}

/**
 * `bun test` runs Bun's runner, so the package script is `bun run <name>`.
 */
export function scriptCommand(pm: PackageManager, name: string): string {
  switch (pm) {
    case 'npm':
      return `npm run ${name}`;
    case 'pnpm':
      return `pnpm ${name}`;
    case 'yarn':
      return `yarn ${name}`;
    case 'bun':
      return `bun run ${name}`;
  }
}

/** Inner names in order, trimmed, including duplicates. */
export function findPlaceholders(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const raw = match[1];
    if (raw !== undefined) names.push(raw.trim());
  }
  return names;
}

/** `src`, `pm`, and `scripts.<name>` (`<name>` is non-empty and has no whitespace). */
export function isKnownPlaceholder(name: string): boolean {
  return classify(name).kind !== 'unknown';
}

export function renderBody(text: string, ctx: PlaceholderContext): string {
  assertKnownPlaceholders(text);
  const { lines, endedWithNewline } = splitLines(text);
  const dropped = unresolvableLines(lines, ctx);
  for (const index of emptiedSectionLines(lines, dropped)) dropped.add(index);
  renumberOrderedLists(lines, dropped);
  const rendered = lines
    .filter((_, index) => !dropped.has(index))
    .map((line) => renderResolved(line, ctx));
  return joinLines(rendered, endedWithNewline);
}

export function renderGlobs(globs: readonly string[], ctx: PlaceholderContext): string[] {
  const rendered: string[] = [];
  const seen = new Set<string>();
  for (const glob of globs) {
    assertKnownPlaceholders(glob);
    if (hasUnresolvable(glob, ctx)) continue;
    const value = collapseSlashes(renderResolved(glob, ctx));
    if (seen.has(value)) continue;
    seen.add(value);
    rendered.push(value);
  }
  return rendered;
}

function assertKnownPlaceholders(text: string): void {
  for (const name of findPlaceholders(text)) {
    const placeholder = classify(name);
    if (placeholder.kind === 'unknown') throw unknownPlaceholder(placeholder.name);
  }
}

function classify(raw: string): KnownPlaceholder | { readonly kind: 'unknown'; readonly name: string } {
  const name = raw.trim();
  if (name === 'src') return { kind: 'src' };
  if (name === 'pm') return { kind: 'pm' };
  if (name.startsWith(SCRIPT_PREFIX)) {
    const scriptName = name.slice(SCRIPT_PREFIX.length);
    if (/^\S+$/u.test(scriptName)) return { kind: 'script', name: scriptName };
  }
  return { kind: 'unknown', name };
}

function replacement(placeholder: KnownPlaceholder, ctx: PlaceholderContext): string | null {
  switch (placeholder.kind) {
    case 'src':
      return ctx.src;
    case 'pm':
      return ctx.pm;
    case 'script':
      if (ctx.pm === null || !Object.hasOwn(ctx.scripts, placeholder.name)) return null;
      return scriptCommand(ctx.pm, placeholder.name);
  }
}

function hasUnresolvable(text: string, ctx: PlaceholderContext): boolean {
  for (const name of findPlaceholders(text)) {
    const placeholder = classify(name);
    if (placeholder.kind !== 'unknown' && replacement(placeholder, ctx) === null) return true;
  }
  return false;
}

function renderResolved(text: string, ctx: PlaceholderContext): string {
  let rendered = '';
  let cursor = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const index = match.index;
    const placeholder = classify(raw);
    if (placeholder.kind === 'unknown') throw unknownPlaceholder(placeholder.name);
    const value = replacement(placeholder, ctx);
    if (value === null) {
      throw new AgentInitError(`Unresolved placeholder "{{${raw.trim()}}}".`);
    }
    rendered += text.slice(cursor, index);
    rendered += value;
    cursor = index + match[0].length;
  }
  rendered += text.slice(cursor);
  return rendered;
}

function unknownPlaceholder(name: string): AgentInitError {
  return new AgentInitError(`Unknown placeholder "{{${name}}}".`);
}

function collapseSlashes(glob: string): string {
  return glob.replace(/\/{2,}/gu, '/');
}

function splitLines(text: string): { lines: string[]; endedWithNewline: boolean } {
  // A Windows checkout rewrites fragment files to CRLF. Generated text stays
  // LF, so a carriage return cannot stick to a line and change the plan.
  const normalized = text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
  const endedWithNewline = normalized.endsWith('\n');
  const stripped = endedWithNewline ? normalized.slice(0, -1) : normalized;
  if (stripped === '') return { lines: endedWithNewline ? [''] : [], endedWithNewline };
  return { lines: stripped.split('\n'), endedWithNewline };
}

function joinLines(lines: readonly string[], endedWithNewline: boolean): string {
  if (lines.length === 0) return '';
  const joined = lines.join('\n');
  return endedWithNewline ? `${joined}\n` : joined;
}

/**
 * Fence delimiters are not dropped one at a time. Interior lines with
 * unresolvable placeholders go first; if nothing inside remains, or a
 * delimiter itself cannot render, the whole block goes.
 */
function unresolvableLines(lines: readonly string[], ctx: PlaceholderContext): Set<number> {
  const dropped = new Set<number>();
  const fences = findFenceSpans(lines);
  const inFence = fenceMask(lines, fences);

  for (const span of fences) {
    const closeIndex = span.closed ? span.end : null;
    let delimiterUnresolvable = false;
    const interiorUnresolvable: number[] = [];
    let interiorCount = 0;

    for (let index = span.start; index <= span.end; index += 1) {
      const line = lines[index] ?? '';
      const isDelimiter = index === span.start || index === closeIndex;
      if (isDelimiter) {
        if (hasUnresolvable(line, ctx)) delimiterUnresolvable = true;
        continue;
      }
      interiorCount += 1;
      if (hasUnresolvable(line, ctx)) interiorUnresolvable.push(index);
    }

    if (delimiterUnresolvable) {
      for (let index = span.start; index <= span.end; index += 1) dropped.add(index);
      continue;
    }

    for (const index of interiorUnresolvable) dropped.add(index);
    if (interiorCount > 0 && interiorUnresolvable.length === interiorCount) {
      dropped.add(span.start);
      if (closeIndex !== null) dropped.add(closeIndex);
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (inFence[index] === true) continue;
    if (hasUnresolvable(lines[index] ?? '', ctx)) dropped.add(index);
  }

  return dropped;
}

function findFenceSpans(lines: readonly string[]): FenceSpan[] {
  const spans: FenceSpan[] = [];
  let openAt: number | null = null;
  let open: { char: '`' | '~'; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (open === null) {
      const marker = openingFence(line);
      if (marker === null) continue;
      open = marker;
      openAt = index;
      continue;
    }
    if (!isClosingFence(line, open) || openAt === null) continue;
    spans.push({ start: openAt, end: index, closed: true });
    open = null;
    openAt = null;
  }

  if (open !== null && openAt !== null) {
    spans.push({ start: openAt, end: lines.length - 1, closed: false });
  }
  return spans;
}

function openingFence(line: string): { char: '`' | '~'; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  if (match === null) return null;
  const marker = match[1];
  const info = match[2] ?? '';
  if (marker === undefined) return null;
  const char = marker.startsWith('`') ? '`' : '~';
  if (char === '`' && info.includes('`')) return null;
  return { char, length: marker.length };
}

function isClosingFence(line: string, open: { char: '`' | '~'; length: number }): boolean {
  const pattern = open.char === '`' ? /^ {0,3}(`+)\s*$/u : /^ {0,3}(~+)\s*$/u;
  const marker = pattern.exec(line)?.[1];
  return marker !== undefined && marker.length >= open.length;
}

function fenceMask(lines: readonly string[], fences: readonly FenceSpan[]): boolean[] {
  const mask = Array.from({ length: lines.length }, () => false);
  for (const span of fences) {
    for (let index = span.start; index <= span.end; index += 1) mask[index] = true;
  }
  return mask;
}

/**
 * A heading is removed only when this pass dropped every content line in its
 * section. Headings that were already empty stay, so a second render is a no-op.
 * ATX headings only; setext underlines are ordinary text.
 */
function emptiedSectionLines(lines: readonly string[], dropped: ReadonlySet<number>): Set<number> {
  const extra = new Set<number>();
  const fences = findFenceSpans(lines);
  const inFence = fenceMask(lines, fences);
  const levels = lines.map((line, index) =>
    inFence[index] === true ? null : headingLevel(line),
  );
  const headings: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (typeof levels[index] === 'number' && !dropped.has(index)) headings.push(index);
  }

  const emptyHeadings = new Set<number>();
  for (let heading = headings.length - 1; heading >= 0; heading -= 1) {
    const index = headings[heading];
    if (index === undefined) continue;
    const level = levels[index];
    if (typeof level !== 'number') continue;
    const end = sectionEnd(levels, dropped, index, level);
    let droppedSomething = false;
    let hasContent = false;
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      if (dropped.has(cursor) || emptyHeadings.has(cursor)) {
        droppedSomething = true;
        continue;
      }
      if ((lines[cursor] ?? '').trim() === '') continue;
      hasContent = true;
      break;
    }
    if (!droppedSomething || hasContent) continue;
    emptyHeadings.add(index);
    extra.add(index);
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      if (!dropped.has(cursor)) extra.add(cursor);
    }
  }
  return extra;
}

function sectionEnd(
  levels: readonly (number | null)[],
  dropped: ReadonlySet<number>,
  index: number,
  level: number,
): number {
  for (let cursor = index + 1; cursor < levels.length; cursor += 1) {
    const next = levels[cursor];
    if (typeof next === 'number' && next <= level && !dropped.has(cursor)) return cursor;
  }
  return levels.length;
}

function headingLevel(line: string): number | null {
  const match = /^ {0,3}(#{1,6})(?:[ \t]+.*)?$/u.exec(line);
  const hashes = match?.[1];
  return hashes === undefined ? null : hashes.length;
}

const ORDERED_ITEM = /^(\s*)(\d+)(\.[ \t]+)(.*)$/u;

/**
 * After drops, renumber each ordered list that lost an item. A list is a run of
 * consecutive `N.` lines at the same indent, outside fences. The first item's
 * number is kept; lists that lost nothing stay as written.
 */
function renumberOrderedLists(lines: string[], dropped: ReadonlySet<number>): void {
  const inFence = fenceMask(lines, findFenceSpans(lines));
  let index = 0;
  while (index < lines.length) {
    if (inFence[index] === true) {
      index += 1;
      continue;
    }
    const first = ORDERED_ITEM.exec(lines[index] ?? '');
    if (first === null) {
      index += 1;
      continue;
    }
    const indent = first[1] ?? '';
    const startNumber = Number(first[2]);
    const listIndices: number[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      if (inFence[cursor] === true) break;
      const item = ORDERED_ITEM.exec(lines[cursor] ?? '');
      if (item === null || (item[1] ?? '') !== indent) break;
      listIndices.push(cursor);
      cursor += 1;
    }

    const survivors = listIndices.filter((lineIndex) => !dropped.has(lineIndex));
    if (survivors.length > 0 && survivors.length < listIndices.length) {
      let next = startNumber;
      for (const lineIndex of survivors) {
        const item = ORDERED_ITEM.exec(lines[lineIndex] ?? '');
        if (item === null) continue;
        lines[lineIndex] = `${indent}${String(next)}${item[3] ?? '. '}${item[4] ?? ''}`;
        next += 1;
      }
    }
    index = cursor;
  }
}
