/**
 * Column alignment for TTY report rows. Measures visible width by stripping
 * CSI color sequences so padded gaps stay even when cells are painted.
 */

export function stripAnsi(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '\u001b') {
      result += char ?? '';
      continue;
    }
    // CSI SGR used by picocolors: ESC [ ... m
    if (text[index + 1] === '[') {
      const end = text.indexOf('m', index + 2);
      if (end !== -1) {
        index = end;
        continue;
      }
    }
    result += char;
  }
  return result;
}

/** Visible column count. Assumes one column per remaining code unit (ASCII UI). */
export function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Pads each cell so columns line up. Trailing padding on the last column is
 * omitted. Empty input yields an empty array.
 */
export function alignColumns(
  rows: readonly (readonly string[])[],
  gap = 2,
): string[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index] ?? '';
      const width = visibleWidth(cell);
      const current = widths[index];
      if (current === undefined || width > current) widths[index] = width;
    }
  }
  const spacer = ' '.repeat(gap);
  return rows.map((row) => {
    const parts: string[] = [];
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index] ?? '';
      if (index === row.length - 1) {
        parts.push(cell);
        continue;
      }
      const pad = Math.max(0, (widths[index] ?? 0) - visibleWidth(cell));
      parts.push(`${cell}${' '.repeat(pad)}`);
    }
    return parts.join(spacer);
  });
}
