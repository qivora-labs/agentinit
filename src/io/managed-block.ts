import { AgentInitError } from '../errors.js';

// `#` and `\` are excluded so a block id can be stored as a manifest key `path#id`.
const BLOCK_ID = /^[^\s>#\\]+$/;
const BEGIN_MARKER = /^[ \t]*<!-- agentinit:begin id=([^\s>#\\]+) -->[ \t]*$/;
const END_MARKER = /^[ \t]*<!-- agentinit:end id=([^\s>#\\]+) -->[ \t]*$/;

const MARKER_HINT =
  'Give every begin marker a matching end marker, and do not nest markers or repeat an id.';

const INNER_MARKER_HINT =
  'Do not put an agentinit begin or end marker on its own line inside the block.';

export interface Block {
  readonly id: string;
  /** Index of the begin marker. */
  readonly start: number;
  /** Index just past the end marker line, including its line ending when present. */
  readonly end: number;
  /** Index just past the begin marker line. */
  readonly innerStart: number;
  /** Index of the end marker. */
  readonly innerEnd: number;
  /** Text between the marker lines. */
  readonly inner: string;
}

/**
 * Whole-line markers only. A marker with trailing text is user content, not a block.
 * Marker lines inside a *closed* CommonMark fenced code block (``` / ~~~, length ≥ 3)
 * are documentation, not structure. An unclosed fence opener is ordinary text so a
 * typo ``` cannot hide later managed blocks (and cause upsert to append a duplicate).
 * Malformed structure throws; markers are never paired by guesswork.
 */
export function findBlocks(text: string, file: string): Block[] {
  const lines = splitLines(text);
  const inFence = closedFenceMask(lines);
  const blocks: Block[] = [];
  const seen = new Set<string>();
  let open: { id: string; start: number; innerStart: number } | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    if (inFence[index] === true) continue;
    const line = lines[index];
    if (line === undefined) continue;

    const begin = BEGIN_MARKER.exec(line.text);
    if (begin !== null) {
      const id = capture(begin);
      if (open !== undefined) {
        throw markerError(file, `managed block "${id}" is nested inside "${open.id}"`);
      }
      if (seen.has(id)) {
        throw markerError(file, `managed block "${id}" appears more than once`);
      }
      open = { id, start: line.start, innerStart: line.end };
      continue;
    }

    const end = END_MARKER.exec(line.text);
    if (end === null) continue;
    const id = capture(end);
    if (open === undefined) {
      throw markerError(file, `managed block "${id}" has an end marker without a begin marker`);
    }
    if (open.id !== id) {
      throw markerError(file, `managed block "${open.id}" ends with marker id "${id}"`);
    }
    blocks.push({
      id,
      start: open.start,
      end: line.end,
      innerStart: open.innerStart,
      innerEnd: line.start,
      inner: text.slice(open.innerStart, line.start),
    });
    seen.add(id);
    open = undefined;
  }

  if (open !== undefined) {
    throw markerError(file, `managed block "${open.id}" is missing its end marker`);
  }
  return blocks;
}

/** CommonMark: 0–3 spaces, then 3+ backticks or tildes (PRD §6.1). */
interface FenceOpen {
  readonly marker: '`' | '~';
  readonly length: number;
}

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^( {0,3})(`{3,}|~{3,})[ \t]*$/;

/**
 * True for lines that sit inside a closed fence (including the open and close
 * delimiters). An opener with no matching close does not mark any line.
 */
function closedFenceMask(lines: readonly TextLine[]): boolean[] {
  const mask = Array.from({ length: lines.length }, () => false);
  let open: FenceOpen | undefined;
  let openAt: number | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (open === undefined) {
      const opened = openFence(line.text);
      if (opened === undefined) continue;
      open = opened;
      openAt = index;
      continue;
    }
    if (!closesFence(line.text, open) || openAt === undefined) continue;
    for (let filled = openAt; filled <= index; filled += 1) mask[filled] = true;
    open = undefined;
    openAt = undefined;
  }
  return mask;
}

function openFence(line: string): FenceOpen | undefined {
  const match = FENCE_OPEN.exec(line);
  if (match === null) return undefined;
  const ticks = match[2];
  if (ticks === undefined) return undefined;
  const marker = ticks[0];
  if (marker !== '`' && marker !== '~') return undefined;
  // Backtick fences cannot include backticks in the info string.
  if (marker === '`' && (match[3] ?? '').includes('`')) return undefined;
  return { marker, length: ticks.length };
}

function closesFence(line: string, open: FenceOpen): boolean {
  const match = FENCE_CLOSE.exec(line);
  if (match === null) return false;
  const ticks = match[2];
  if (!ticks?.startsWith(open.marker)) return false;
  return ticks.length >= open.length;
}

/**
 * Replaces the inner content of `id`, or appends the block at the end.
 * Bytes outside the inner span are copied unchanged.
 * Inserted newlines use CRLF when the file already contains `\r\n`, otherwise LF.
 * A new block is preceded by exactly one inserted line ending, so a file that
 * already ends in a newline gets one blank line and an existing trailing blank
 * line is kept. A file with no trailing newline gets the marker on the next line.
 */
export function upsertBlock(text: string, id: string, inner: string, file: string): string {
  assertBlockId(id, file);
  const blocks = findBlocks(text, file);
  const ending = fileEnding(text);
  const existing = blocks.find((block) => block.id === id);
  if (existing === undefined) {
    return appendBlock(text, renderBlock(id, inner, ending, file), ending);
  }
  const body = normalizeInner(inner, ending, file);
  return text.slice(0, existing.innerStart) + body + text.slice(existing.innerEnd);
}

/**
 * Removes `id` and the one line ending inserted in front of it when this block
 * is at the end of the file, or when another managed block follows after a blank
 * line. A block at the start of the file has that separator in front of the next
 * block instead, so the separator is taken from there. Any other text after the
 * block stays byte-for-byte, including a line that only looks like a marker.
 */
export function removeBlock(text: string, id: string, file: string): string {
  assertBlockId(id, file);
  const blocks = findBlocks(text, file);
  const existing = blocks.find((block) => block.id === id);
  if (existing === undefined) {
    throw new AgentInitError(`${file}: managed block "${id}" was not found.`, {
      hint: 'Check the block id.',
    });
  }
  let after = text.slice(existing.end);
  let before = text.slice(0, existing.start);
  if (after.length === 0) {
    before = withoutInsertedEnding(before);
  } else if (followedByAppendedBlock(after, existing.end, blocks)) {
    if (existing.start === 0) after = withoutLeadingEnding(after);
    else before = withoutInsertedEnding(before);
  }
  return before + after;
}

/** New files use LF. The end marker stays on its own line. */
export function createWithBlock(id: string, inner: string): string {
  assertBlockId(id);
  return renderBlock(id, inner, '\n');
}

/**
 * True when content **outside** managed blocks has an ATX H1 (`# …`), ignoring
 * lines inside a closed CommonMark fence. The block's own H1 does not count, so
 * re-runs stay stable after adopt (PRD §6.1).
 */
export function hasOutsideAtxH1(text: string, file: string): boolean {
  return hasAtxH1(textOutsideManagedBlocks(text, file));
}

function textOutsideManagedBlocks(text: string, file: string): string {
  const blocks = findBlocks(text, file);
  if (blocks.length === 0) return text;
  let outside = '';
  let cursor = 0;
  for (const block of blocks) {
    outside += text.slice(cursor, block.start);
    cursor = block.end;
  }
  return outside + text.slice(cursor);
}

function hasAtxH1(text: string): boolean {
  const lines = splitLines(text);
  const inFence = closedFenceMask(lines);
  for (let index = 0; index < lines.length; index += 1) {
    if (inFence[index] === true) continue;
    const line = lines[index];
    if (line !== undefined && isAtxH1(line.text)) return true;
  }
  return false;
}

/** CommonMark ATX H1: optional indent, one `#`, then space/tab or end of line. */
function isAtxH1(line: string): boolean {
  return /^ {0,3}#(?:[ \t]|$)/u.test(line);
}

function renderBlock(id: string, inner: string, ending: '\n' | '\r\n', file?: string): string {
  const body = normalizeInner(inner, ending, file);
  return `<!-- agentinit:begin id=${id} -->${ending}${body}<!-- agentinit:end id=${id} -->${ending}`;
}

function appendBlock(text: string, block: string, ending: '\n' | '\r\n'): string {
  if (text.length === 0) return block;
  // Always insert a fresh ending. Reusing a user's trailing blank line makes
  // add/remove unable to restore that blank line.
  return text + ending + block;
}

/**
 * `after` is one inserted line ending, then a block `findBlocks` already
 * accepted. A line that only resembles a marker is not in `blocks`, so the
 * blank line in front of it stays.
 */
function followedByAppendedBlock(after: string, end: number, blocks: readonly Block[]): boolean {
  const separator = leadingEndingLength(after);
  if (separator === 0) return false;
  const nextStart = end + separator;
  return blocks.some((block) => block.start === nextStart);
}

/** Inverse of the single line ending `appendBlock` inserts. */
function withoutInsertedEnding(before: string): string {
  if (before.endsWith('\r\n')) return before.slice(0, -2);
  if (before.endsWith('\n')) return before.slice(0, -1);
  return before;
}

function withoutLeadingEnding(after: string): string {
  return after.slice(leadingEndingLength(after));
}

function leadingEndingLength(text: string): number {
  if (text.startsWith('\r\n')) return 2;
  if (text.startsWith('\n')) return 1;
  return 0;
}

function normalizeInner(inner: string, ending: '\n' | '\r\n', file?: string): string {
  const lf = inner.replaceAll('\r\n', '\n');
  const converted = ending === '\n' ? lf : lf.replaceAll('\n', '\r\n');
  const body = converted.length === 0 || converted.endsWith(ending) ? converted : `${converted}${ending}`;
  assertInnerHasNoMarkers(body, file);
  return body;
}

function assertInnerHasNoMarkers(body: string, file?: string): void {
  for (const line of splitLines(body)) {
    if (!BEGIN_MARKER.test(line.text) && !END_MARKER.test(line.text)) continue;
    const where = file === undefined ? '' : `${file}: `;
    throw new AgentInitError(`${where}managed block content contains a marker line.`, {
      hint: INNER_MARKER_HINT,
    });
  }
}

function fileEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function assertBlockId(id: string, file?: string): void {
  if (BLOCK_ID.test(id)) return;
  const where = file === undefined ? '' : `${file}: `;
  throw new AgentInitError(`${where}managed block id "${id}" is not valid.`, {
    hint: 'Use an id without spaces, "#", ">", or backslashes.',
  });
}

function markerError(file: string, message: string): AgentInitError {
  return new AgentInitError(`${file}: ${message}`, { hint: MARKER_HINT });
}

function capture(match: RegExpExecArray): string {
  const id = match[1];
  if (id === undefined) {
    throw new AgentInitError('managed block marker is missing an id.', { hint: MARKER_HINT });
  }
  return id;
}

interface TextLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function splitLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') continue;
    const carriage = index > start && text[index - 1] === '\r';
    const contentEnd = carriage ? index - 1 : index;
    lines.push({ text: text.slice(start, contentEnd), start, end: index + 1 });
    start = index + 1;
  }
  if (start < text.length) {
    lines.push({ text: text.slice(start), start, end: text.length });
  }
  return lines;
}
