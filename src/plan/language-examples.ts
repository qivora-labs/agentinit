import { languageFamily, type LanguageFamily } from '../language-family.js';
import type { Language } from '../types.js';

/** HTML comment that marks a fragment or a single directive as TypeScript-only. */
export const TYPESCRIPT_ONLY_MARKER = '<!-- agentinit:typescript-only -->';

export type ExampleLanguageFamily = LanguageFamily;

interface FenceSpan {
  readonly start: number;
  readonly end: number;
  readonly closed: boolean;
  readonly family: ExampleLanguageFamily | null;
}

/** JavaScript family languages select `js`/`jsx` Contract fences and `{{ext}}` → `js`. */
export function exampleLanguageFamily(language: Language): ExampleLanguageFamily {
  return languageFamily(language);
}

/**
 * True when the body has a fragment-level TypeScript-only marker: a line that is
 * only `<!-- agentinit:typescript-only -->`. A marker trailing a directive does
 * not count — that marks one directive, not the whole fragment.
 */
export function hasTypescriptOnlyMarker(body: string): boolean {
  const { lines } = splitLines(body);
  return lines.some((line) => markerPattern().test(line) && isMarkerOnlyLine(line));
}

/** True when `## Contract` contains at least one fenced block in the JavaScript family. */
export function hasJavaScriptContractFence(body: string): boolean {
  return contractFenceFamilies(body).has('javascript');
}

/** True when `## Contract` contains at least one fenced block in the TypeScript family. */
export function hasTypeScriptContractFence(body: string): boolean {
  return contractFenceFamilies(body).has('typescript');
}

/**
 * Select Contract (and other) language fences, strip TypeScript-only markers, and
 * drop headings left empty by a removed fence. Does not resolve `{{ext}}` —
 * that stays in placeholder rendering.
 */
export function applyLanguageExamples(body: string, family: ExampleLanguageFamily): string {
  const { lines, endedWithNewline } = splitLines(body);
  const dropped = new Set<number>();

  for (const span of findFenceSpans(lines)) {
    if (span.family === null || span.family === family) continue;
    for (let index = span.start; index <= span.end; index += 1) dropped.add(index);
    // Drop blank separators so dual fences do not leave trailing empty lines.
    dropAdjacentBlankLines(lines, dropped, span.start, span.end);
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (dropped.has(index)) continue;
    const line = lines[index] ?? '';
    if (!markerPattern().test(line)) continue;
    if (family === 'javascript' && !isMarkerOnlyLine(line)) {
      dropped.add(index);
      continue;
    }
    lines[index] = stripMarker(line);
    if ((lines[index] ?? '').trim() === '') dropped.add(index);
  }

  for (const index of emptiedSectionLines(lines, dropped)) dropped.add(index);

  const kept = lines.filter((_, index) => !dropped.has(index));
  return joinLines(kept, endedWithNewline);
}

function markerPattern(): RegExp {
  return /<!--\s*agentinit:typescript-only\s*-->/gu;
}

function contractFenceFamilies(body: string): Set<ExampleLanguageFamily> {
  const families = new Set<ExampleLanguageFamily>();
  const { lines } = splitLines(body);
  const contract = contractLineRange(lines);
  if (contract === null) return families;
  for (const span of findFenceSpans(lines)) {
    if (span.family === null) continue;
    if (span.start < contract.start || span.start >= contract.end) continue;
    families.add(span.family);
  }
  return families;
}

function contractLineRange(lines: readonly string[]): { start: number; end: number } | null {
  const inFence = fenceMask(lines, findFenceSpans(lines));
  let start: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (inFence[index] === true) continue;
    const level = headingLevel(lines[index] ?? '');
    if (typeof level !== 'number') continue;
    const title = headingTitle(lines[index] ?? '');
    if (start === null) {
      if (title === 'Contract') start = index + 1;
      continue;
    }
    if (level <= 2) return { start, end: index };
  }
  return start === null ? null : { start, end: lines.length };
}

function fenceLanguageFamily(info: string): ExampleLanguageFamily | null {
  const lang = info.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
  switch (lang) {
    case 'ts':
    case 'tsx':
    case 'typescript':
    case 'typescriptreact':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'javascript':
    case 'javascriptreact':
      return 'javascript';
    default:
      return null;
  }
}

function isMarkerOnlyLine(line: string): boolean {
  return stripMarker(line).trim() === '';
}

function stripMarker(line: string): string {
  return line.replace(markerPattern(), '').replace(/[ \t]+$/u, '');
}

function findFenceSpans(lines: readonly string[]): FenceSpan[] {
  const spans: FenceSpan[] = [];
  let openAt: number | null = null;
  let open: { char: '`' | '~'; length: number; family: ExampleLanguageFamily | null } | null = null;

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
    spans.push({ start: openAt, end: index, closed: true, family: open.family });
    open = null;
    openAt = null;
  }

  if (open !== null && openAt !== null) {
    spans.push({ start: openAt, end: lines.length - 1, closed: false, family: open.family });
  }
  return spans;
}

function openingFence(
  line: string,
): { char: '`' | '~'; length: number; family: ExampleLanguageFamily | null } | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  if (match === null) return null;
  const marker = match[1];
  const info = match[2] ?? '';
  if (marker === undefined) return null;
  const char = marker.startsWith('`') ? '`' : '~';
  if (char === '`' && info.includes('`')) return null;
  return { char, length: marker.length, family: fenceLanguageFamily(info) };
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
 * Drop a heading when this pass removed every content line under it.
 * Headings that were already empty stay.
 */
function emptiedSectionLines(lines: readonly string[], dropped: ReadonlySet<number>): Set<number> {
  const extra = new Set<number>();
  const inFence = fenceMask(lines, findFenceSpans(lines));
  const levels = lines.map((line, index) =>
    inFence[index] === true || dropped.has(index) ? null : headingLevel(line),
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
    let before = index - 1;
    while (before >= 0 && !dropped.has(before) && (lines[before] ?? '').trim() === '') {
      extra.add(before);
      before -= 1;
    }
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      if (!dropped.has(cursor)) extra.add(cursor);
    }
  }
  return extra;
}

function dropAdjacentBlankLines(
  lines: readonly string[],
  dropped: Set<number>,
  start: number,
  end: number,
): void {
  let before = start - 1;
  while (before >= 0 && !dropped.has(before) && (lines[before] ?? '').trim() === '') {
    dropped.add(before);
    before -= 1;
  }
  let after = end + 1;
  while (after < lines.length && !dropped.has(after) && (lines[after] ?? '').trim() === '') {
    dropped.add(after);
    after += 1;
  }
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

function headingTitle(line: string): string {
  const match = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/u.exec(line);
  return (match?.[1] ?? '').trim();
}

function splitLines(text: string): { lines: string[]; endedWithNewline: boolean } {
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
