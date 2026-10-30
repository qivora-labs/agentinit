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
