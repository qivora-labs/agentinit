import { AgentInitError } from '../errors.js';

const BEGIN_MARKER = /^[ \t]*<!-- agentinit:begin id=([^\s>]+) -->[ \t]*$/;
const END_MARKER = /^[ \t]*<!-- agentinit:end id=([^\s>]+) -->[ \t]*$/;

const MARKER_HINT =
  'Give every begin marker a matching end marker, and do not nest markers or repeat an id.';

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
 * Malformed structure throws; the markers are never paired by guesswork.
 */
export function findBlocks(text: string, file: string): Block[] {
  const lines = splitLines(text);
  const blocks: Block[] = [];
  const seen = new Set<string>();
  let open: { id: string; start: number; innerStart: number } | undefined;

  for (const line of lines) {
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

/**
 * Replaces the inner content of `id`, or appends the block at the end.
 * Bytes outside the inner span are copied unchanged.
 * Inserted newlines use CRLF when the file already contains `\r\n`, otherwise LF.
 * A new block is separated from existing text by exactly one blank line.
 */
export function upsertBlock(text: string, id: string, inner: string, file: string): string {
  assertBlockId(id, file);
  const blocks = findBlocks(text, file);
  const ending = fileEnding(text);
  const existing = blocks.find((block) => block.id === id);
  if (existing === undefined) {
    return appendBlock(text, renderBlock(id, inner, ending), ending);
  }
  const body = normalizeInner(inner, ending);
  return text.slice(0, existing.innerStart) + body + text.slice(existing.innerEnd);
}

/**
 * Removes `id`. A block at the end of the file also drops one preceding blank line,
 * so an append/remove cycle does not leave a growing gap. User content after the
 * block is kept byte-for-byte, including its blank lines.
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
  const after = text.slice(existing.end);
  if (after.length > 0) return text.slice(0, existing.start) + after;
  return withoutTrailingBlankLine(text.slice(0, existing.start));
}

/** New files use LF. The end marker stays on its own line. */
export function createWithBlock(id: string, inner: string): string {
  assertBlockId(id);
  return renderBlock(id, inner, '\n');
}

function renderBlock(id: string, inner: string, ending: '\n' | '\r\n'): string {
  const body = normalizeInner(inner, ending);
  return `<!-- agentinit:begin id=${id} -->${ending}${body}<!-- agentinit:end id=${id} -->${ending}`;
}

function appendBlock(text: string, block: string, ending: '\n' | '\r\n'): string {
  if (text.length === 0) return block;
  if (text.endsWith(ending + ending)) return text + block;
  if (text.endsWith(ending)) return text + ending + block;
  return text + ending + ending + block;
}

/**
 * Drop the separator blank line added when a block was appended.
 * A file that already ended in a blank line loses that one line; a file with
 * no trailing newline gains one after an add/remove cycle.
 */
function withoutTrailingBlankLine(before: string): string {
  if (before.endsWith('\r\n\r\n')) return before.slice(0, -2);
  if (before.endsWith('\n\n')) return before.slice(0, -1);
  return before;
}

function normalizeInner(inner: string, ending: '\n' | '\r\n'): string {
  const lf = inner.replaceAll('\r\n', '\n');
  const converted = ending === '\n' ? lf : lf.replaceAll('\n', '\r\n');
  if (converted.length === 0 || converted.endsWith(ending)) return converted;
  return converted + ending;
}

function fileEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function assertBlockId(id: string, file?: string): void {
  if (id.length > 0 && !/[\s>]/.test(id)) return;
  const where = file === undefined ? '' : `${file}: `;
  throw new AgentInitError(`${where}managed block id "${id}" is not valid.`, {
    hint: 'Use an id without spaces or ">".',
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
