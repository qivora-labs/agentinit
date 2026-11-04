import { visibleWidth } from './align.js';

/**
 * Clack prints these strings. A package name, path, or fragment title that
 * contains ESC or another C0/C1 control can rewrite the prompt, so display
 * text is cleaned before it is shown.
 *
 * A finished escape sequence is removed. An unfinished one drops only its
 * introducer, so it cannot swallow the rest of a question that follows.
 */

export function sanitizeDisplayText(value: string): string {
  return sanitize(value, false);
}

/**
 * Wrap `text` so each output line fits in `width` columns. The rail `prefix`
 * starts each input line; `continuationPrefix` (defaults to `prefix`) is used
 * on wrap continuations. Word boundaries are preferred; a single token longer
 * than the content width is hard-broken. CSI color codes do not count toward
 * width and stay attached to their text.
 */
export function fitToWidth(
  text: string,
  width: number,
  prefix: string,
  continuationPrefix = prefix,
): string {
  if (text.length === 0) return text;
  const budget = Math.max(1, width);
  // A prefix that already fills the budget would make every line overflow; drop it.
  const lead = visibleWidth(prefix) < budget ? prefix : '';
  const cont =
    visibleWidth(continuationPrefix) < budget ? continuationPrefix : lead;
  const prefixWidth = Math.max(visibleWidth(lead), visibleWidth(cont));
  const contentWidth = Math.max(1, budget - prefixWidth);
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const segments = wrapLine(line, contentWidth);
    for (let index = 0; index < segments.length; index += 1) {
      const start = index === 0 ? lead : cont;
      lines.push(`${start}${segments[index] ?? ''}`);
    }
  }
  return lines.join('\n');
}

/** Summary notes keep formatter newlines. Every other control is still removed. */
export function sanitizeMultilineDisplayText(value: string): string {
  return sanitize(value, true);
}

function sanitize(value: string, keepNewlines: boolean): string {
  const parts: string[] = [];
  let index = 0;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === 0x1b || code === 0x9b) {
      const next = completeEscapeEnd(value, index);
      index = next ?? index + 1;
      continue;
    }
    if (isDroppedControl(code, keepNewlines)) {
      index += 1;
      continue;
    }
    const char = value[index];
    if (char === undefined) break;
    parts.push(char);
    index += 1;
  }
  return parts.join('');
}

function isDroppedControl(code: number, keepNewlines: boolean): boolean {
  if (keepNewlines && code === 0x0a) return false;
  if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true;
  return code === 0x2028 || code === 0x2029;
}

/** Index just after a complete sequence, or undefined when it never terminates. */
function completeEscapeEnd(value: string, index: number): number | undefined {
  if (value.charCodeAt(index) === 0x9b) return completeCsi(value, index + 1);
  const kind = value.charCodeAt(index + 1);
  if (Number.isNaN(kind)) return undefined;
  if (kind === 0x5b) return completeCsi(value, index + 2);
  if (isStringSequence(kind)) return completeStringSequence(value, index + 2);
  return index + 2;
}

function isStringSequence(kind: number): boolean {
  return kind === 0x5d || kind === 0x50 || kind === 0x5e || kind === 0x5f || kind === 0x58;
}

function completeCsi(value: string, start: number): number | undefined {
  for (let index = start; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x0a || code === 0x0d || code === 0x1b) return undefined;
    if (code >= 0x40 && code <= 0x7e) return index + 1;
  }
  return undefined;
}

function completeStringSequence(value: string, start: number): number | undefined {
  for (let index = start; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x0a || code === 0x0d) return undefined;
    if (code === 0x07) return index + 1;
    if (code === 0x1b && value.charCodeAt(index + 1) === 0x5c) return index + 2;
    if (code === 0x1b) return undefined;
  }
  return undefined;
}

interface Token {
  readonly raw: string;
  readonly visible: number;
  readonly breakAfter: boolean;
}

function wrapLine(line: string, max: number): string[] {
  if (visibleWidth(line) <= max) return [line];
  const tokens = tokenize(line);
  const segments: string[] = [];
  let current = '';
  let currentWidth = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    // Drop the space that marked the wrap point; keep it only mid-line.
    segments.push(current.replace(/ +$/u, ''));
    current = '';
    currentWidth = 0;
  };

  for (const token of tokens) {
    if (token.visible === 0) {
      current += token.raw;
      continue;
    }
    if (currentWidth > 0 && currentWidth + token.visible > max) {
      flush();
      // Leading spaces on a continuation are padding, not content.
      if (token.breakAfter && token.raw.trim().length === 0) continue;
    }
    if (token.visible > max) {
      flush();
      for (const part of hardBreak(token.raw, max)) {
        segments.push(part);
      }
      continue;
    }
    current += token.raw;
    currentWidth += token.visible;
    if (token.breakAfter && currentWidth === max) flush();
  }
  flush();
  return segments.length === 0 ? [''] : segments;
}

/** Split into words (space-terminated) and ANSI runs that have no width. */
function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let word = '';
  let wordVisible = 0;

  const pushWord = (breakAfter: boolean): void => {
    if (word.length === 0) return;
    tokens.push({ raw: word, visible: wordVisible, breakAfter });
    word = '';
    wordVisible = 0;
  };

  while (index < line.length) {
    const code = line.charCodeAt(index);
    if (code === 0x1b || code === 0x9b) {
      const end = completeEscapeEnd(line, index) ?? index + 1;
      pushWord(false);
      tokens.push({ raw: line.slice(index, end), visible: 0, breakAfter: false });
      index = end;
      continue;
    }
    const char = line[index] ?? '';
    word += char;
    wordVisible += 1;
    index += 1;
    if (char === ' ') {
      pushWord(true);
    }
  }
  pushWord(false);
  return tokens;
}

function hardBreak(raw: string, max: number): string[] {
  const parts: string[] = [];
  let current = '';
  let width = 0;
  let index = 0;
  while (index < raw.length) {
    const code = raw.charCodeAt(index);
    if (code === 0x1b || code === 0x9b) {
      const end = completeEscapeEnd(raw, index) ?? index + 1;
      current += raw.slice(index, end);
      index = end;
      continue;
    }
    if (width === max) {
      parts.push(current);
      current = '';
      width = 0;
    }
    current += raw[index] ?? '';
    width += 1;
    index += 1;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}
