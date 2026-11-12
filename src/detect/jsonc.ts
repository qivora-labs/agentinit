/**
 * Strip line/block comments and trailing commas so `JSON.parse` can read
 * JSONC (tsconfig) and Bun's text lockfile.
 */
export function jsoncToJson(text: string): string {
  let out = '';
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === undefined) break;

    if (char === '"') {
      const copied = copyJsonString(text, index);
      out += copied.value;
      index = copied.index;
      continue;
    }

    if (isCommentStart(text, index)) {
      index = skipComment(text, index);
      continue;
    }

    if (char === ',' && isTrailingComma(text, index + 1)) {
      index += 1;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

function copyJsonString(text: string, start: number): { readonly value: string; readonly index: number } {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    index += 1;
    if (char === '"') break;
  }
  return { value: text.slice(start, index), index };
}

function isCommentStart(text: string, index: number): boolean {
  return text[index] === '/' && (text[index + 1] === '/' || text[index + 1] === '*');
}

function skipComment(text: string, index: number): number {
  if (text[index + 1] === '/') {
    let next = index + 2;
    while (next < text.length && text[next] !== '\n') next += 1;
    return next;
  }

  let next = index + 2;
  while (next < text.length && !(text[next] === '*' && text[next + 1] === '/')) next += 1;
  return Math.min(next + 2, text.length);
}

function isTrailingComma(text: string, index: number): boolean {
  const next = nextSignificant(text, index);
  return next === '}' || next === ']';
}

function nextSignificant(text: string, index: number): string | undefined {
  let cursor = index;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === undefined) return undefined;
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      cursor += 1;
      continue;
    }
    if (isCommentStart(text, cursor)) {
      cursor = skipComment(text, cursor);
      continue;
    }
    return char;
  }
  return undefined;
}
