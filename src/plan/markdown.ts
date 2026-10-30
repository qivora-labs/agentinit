/** Code-unit order, so plans do not depend on locale. */
export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** GitHub-style anchor for the headings this planner emits. */
export function headingSlug(title: string): string {
  return title
    .trim()
    // `en-US` keeps `I` as `i`. The process locale would turn it into `ı`.
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/**
 * Shift ATX headings down one level so fragment text sits under the planner's
 * heading. Lines inside a fence stay as written; a `#` there is code.
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
        return line.replace(/^( {0,3}#{1,5})(?= |$)/u, '$1#');
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

/** Join blocks with one blank line and exactly one trailing newline. */
export function markdownDocument(blocks: readonly string[]): string {
  const body = blocks
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join('\n\n');
  return `${body.replace(/\n+$/u, '')}\n`;
}
