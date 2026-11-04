/** Clack shows the hint on the focused option; keep it on one short line. */
export const PICKER_HINT_LIMIT = 48;

/**
 * Prefer fragment `hint`, else cut `description` at a word boundary with `…`.
 * Always returns at most {@link PICKER_HINT_LIMIT} visible characters.
 */
export function pickerHint(hint: string | undefined, description: string): string {
  const source = hint === undefined || hint.trim().length === 0 ? description : hint;
  return truncateHint(source);
}

export function truncateHint(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PICKER_HINT_LIMIT) return trimmed;
  const budget = PICKER_HINT_LIMIT - 1;
  const slice = trimmed.slice(0, budget);
  const boundary = slice.lastIndexOf(' ');
  const cut = boundary > 0 ? slice.slice(0, boundary) : slice;
  return `${cut.replace(/\s+$/u, '')}…`;
}
