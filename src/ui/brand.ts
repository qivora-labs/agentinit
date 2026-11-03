import type { Theme } from './theme.js';

export const PRODUCT_NAME = 'agentinit';

export const TAGLINE = 'rules for the agents in this repo';

export type CloseTone = 'neutral' | 'error';

/** Two-line wordmark. No ASCII art. The caller adds the blank line under it. */
export function formatBanner(theme: Theme): string {
  const start = theme.muted(theme.glyphs.barStart);
  const bar = theme.muted(theme.glyphs.bar);
  const name = theme.boldAccent(PRODUCT_NAME);
  const tagline = theme.muted(TAGLINE);
  return `${start}  ${name}\n${bar}  ${tagline}`;
}

export function formatClose(theme: Theme, message: string, tone: CloseTone = 'neutral'): string {
  const mark = theme.glyphs.barEnd;
  const bar = tone === 'error' ? theme.error(mark) : theme.muted(mark);
  const text = tone === 'error' ? theme.error(message) : message;
  return `${bar}  ${text}`;
}
