import { sanitizeMultilineDisplayText } from './display-text.js';
import type { Theme } from './theme.js';

const DIFF_CAP = 40;

export interface FormatDiffOptions {
  /** When true, never truncate (dry-run preview). */
  readonly full?: boolean;
}

/**
 * Strip unified-diff headers, color hunks, and optionally cap length on a TTY.
 * Content is sanitized before painting so ESC in file bytes cannot restyle the terminal.
 */
export function formatDiff(
  unified: string,
  theme: Theme,
  options: FormatDiffOptions = {},
): string {
  const cleaned = sanitizeMultilineDisplayText(unified);
  const kept = dropHeaders(cleaned.split('\n'));
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop();

  const full = options.full === true;
  const capped = theme.tty && !full && kept.length > DIFF_CAP;
  const visible = capped ? kept.slice(0, DIFF_CAP) : kept;
  const painted = visible.map((line) => paintLine(line, theme));
  if (capped) {
    const remaining = kept.length - DIFF_CAP;
    painted.push(`… ${String(remaining)} more lines`);
  }
  return painted.join('\n');
}

function dropHeaders(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith('Index:')) continue;
    if (/^=+$/u.test(line)) continue;
    // Header only (`--- path` / `+++ path`). Hunk lines like `----` (removed `---`) stay.
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('+++ ')) continue;
    out.push(line);
  }
  return out;
}

function paintLine(line: string, theme: Theme): string {
  if (line.startsWith('+')) return theme.success(line);
  if (line.startsWith('-')) return theme.error(line);
  if (line.startsWith('@@')) return theme.muted(line);
  return line;
}
