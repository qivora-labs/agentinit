import type { Theme } from './theme.js';

export const PRODUCT_NAME = 'agentinit';

export const TAGLINE = 'rules for the agents in this repo';

export const COMPANY = 'Qivora Labs';

export type CloseTone = 'neutral' | 'error';

type Glyph = readonly string[];

/** Needle logotype. Every row of a glyph has the same width. */
const AGENT: readonly Glyph[] = [
  ['  █  ', ' █ █ ', '█████', '█   █', '█   █'],
  [' ████', '█    ', '█ ███', '█   █', ' ████'],
  ['█████', '█    ', '███  ', '█    ', '█████'],
  ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
];

const INIT: readonly Glyph[] = [
  ['█', '█', '█', '█', '█'],
  ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  ['█', '█', '█', '█', '█'],
  ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
];

const TRACKING = 2;
const WORD_GAP = 4;
/** Tracked capitals. The space inside the name becomes the word gap. */
const KICKER = 'QIVORA LABS'.split('').join(' ');

/**
 * Unicode terminals get the Needle block mark: AGENT in the terminal
 * foreground, INIT in cyan. Anything else gets the same two words in text.
 */
export function formatBanner(theme: Theme): string {
  if (!theme.unicode) return textBanner(theme);
  return needleBanner(theme);
}

export function formatClose(theme: Theme, message: string, tone: CloseTone = 'neutral'): string {
  const mark = theme.glyphs.barEnd;
  const bar = tone === 'error' ? theme.error(mark) : theme.muted(mark);
  const text = tone === 'error' ? theme.error(message) : message;
  return `${bar}  ${text}`;
}

/**
 * Puts a multi-line block under the Clack rail so tree branches and report
 * rows do not sit at column 0 beside the frame.
 */
export function underRail(text: string, theme: Theme): string {
  if (text.length === 0) return text;
  const prefix = `${theme.muted(theme.glyphs.bar)}  `;
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function textBanner(theme: Theme): string {
  const start = theme.muted(theme.glyphs.barStart);
  const bar = theme.muted(theme.glyphs.bar);
  const name = `${theme.ink('AGENT')}  ${theme.accent('INIT')}`;
  return `${theme.muted(COMPANY)}\n\n${start}  ${name}\n${bar}  ${theme.muted(TAGLINE)}`;
}

function needleBanner(theme: Theme): string {
  const agent = paintWord(AGENT, theme.ink);
  const init = paintWord(INIT, theme.accent);
  const rows = agent.map((row, index) => {
    const rest = init[index];
    return rest === undefined ? row : `${row}${' '.repeat(WORD_GAP)}${rest}`;
  });
  const width = visibleWidth(AGENT) + WORD_GAP + visibleWidth(INIT);
  const ornament = `${theme.muted('────────')}${theme.accent('◆')}${theme.muted('────────')}`;
  return [
    center(theme.muted(KICKER), KICKER.length, width),
    '',
    ...rows,
    center(ornament, '────────◆────────'.length, width),
    center(theme.muted(TAGLINE), TAGLINE.length, width),
  ].join('\n');
}

function paintWord(letters: readonly Glyph[], paint: (text: string) => string): string[] {
  const height = letters[0]?.length ?? 0;
  const rows: string[] = [];
  for (let row = 0; row < height; row += 1) {
    const parts = letters.map((letter) => paint(letter[row] ?? ''));
    rows.push(parts.join(' '.repeat(TRACKING)));
  }
  return rows;
}

function visibleWidth(letters: readonly Glyph[]): number {
  const gaps = Math.max(0, letters.length - 1) * TRACKING;
  return letters.reduce((sum, letter) => sum + (letter[0]?.length ?? 0), 0) + gaps;
}

/** `text` may already carry color. `visible` is its width without those codes. */
function center(text: string, visible: number, width: number): string {
  const pad = Math.max(0, width - visible);
  return `${' '.repeat(Math.floor(pad / 2))}${text}`;
}
