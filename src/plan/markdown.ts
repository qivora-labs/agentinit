/**
 * GitHub heading anchor. Punctuation and emoji are deleted, and each space
 * becomes a hyphen, so a leading emoji leaves a leading hyphen. Lowercase
 * uses the Unicode default mapping, so `I` is `i` on every OS.
 */
export function headingSlug(title: string): string {
  return title.toLowerCase().replace(/[^\p{Letter}\p{Number} _-]+/gu, '').replace(/ /gu, '-');
}

/**
 * Shift ATX headings down one level so fragment text sits under the planner's
 * heading. Level 6 stays level 6: a seventh hash is not a heading, so nesting
 * it would turn the line into ordinary text. Lines inside a fence stay as
 * written; a `#` there is code.
 */
export function nestHeadings(body: string): string {
  const lines = body.split('\n');
  let fence: { char: '`' | '~'; length: number } | null = null;
  return lines
    .map((line) => {
      if (fence === null) {
        const open = openingFence(line);
        if (open !== null) {
          fence = open;
          return line;
        }
        return line.replace(/^( {0,3})(#{1,6})(?= |$)/u, (matched, indent: string, marks: string) =>
          marks.length < 6 ? `${indent}${marks}#` : matched,
        );
      }
      if (isClosingFence(line, fence)) fence = null;
      return line;
    })
    .join('\n');
}

function openingFence(line: string): { char: '`' | '~'; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
  if (match === null) return null;
  const marker = match[1];
  if (marker === undefined) return null;
  const char = marker.startsWith('`') ? '`' : '~';
  if (char === '`' && line.slice(match[0].length).includes('`')) return null;
  return { char, length: marker.length };
}

function isClosingFence(line: string, open: { char: '`' | '~'; length: number }): boolean {
  const pattern = open.char === '`' ? /^ {0,3}(`+)\s*$/u : /^ {0,3}(~+)\s*$/u;
  const marker = pattern.exec(line)?.[1];
  return marker !== undefined && marker.length >= open.length;
}

const STRUCTURAL = new Set(['\\', '`', '|', '[', ']', '<', '>']);

/**
 * One physical line. A line break has already left the heading, link, or
 * table row, so escaping the next line cannot put it back.
 */
function oneLine(value: string): string {
  return value.replace(/\r\n?|[\n\u2028\u2029]/gu, ' ');
}

/**
 * Plain text for a heading, link label, or table cell. A backslash escape
 * still renders as the original character, and it does not open a link, a
 * tag, inline code, or another column.
 */
export function escapeMarkdownText(value: string): string {
  let escaped = '';
  for (const char of oneLine(value)) {
    escaped += STRUCTURAL.has(char) ? `\\${char}` : char;
  }
  return escaped;
}

/**
 * Inline code for a path. A pipe still splits a table when it sits inside
 * code, so that path is plain escaped text and the pipe renders as itself.
 */
export function markdownInlineCode(value: string): string {
  const line = oneLine(value);
  if (line.includes('|')) return escapeMarkdownText(line);
  return codeSpan(line);
}

function codeSpan(value: string): string {
  let longest = 0;
  let run = 0;
  for (const char of value) {
    if (char === '`') {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  const fence = '`'.repeat(longest + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

/** Join blocks with one blank line and exactly one trailing newline. */
export function markdownDocument(blocks: readonly string[]): string {
  const body = blocks
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join('\n\n');
  return `${body.replace(/\n+$/u, '')}\n`;
}
