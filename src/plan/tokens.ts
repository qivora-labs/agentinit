import type { PlanWarning } from './types.js';

/** PRD §4.4 budget for the always-on core in `AGENTS.md`. */
export const ALWAYS_ON_TOKEN_LIMIT = 1500;

/**
 * PRD §4.4: `ceil(characters / 4)`. This is a guide, not a tokenizer count.
 * `characters` is the JavaScript string length (UTF-16 code units).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Warning only when the estimate is over the budget. The limit itself is quiet. */
export function alwaysOnTokenWarning(tokens: number): PlanWarning | undefined {
  if (tokens > ALWAYS_ON_TOKEN_LIMIT) {
    return { kind: 'always-on-tokens', tokens, limit: ALWAYS_ON_TOKEN_LIMIT };
  }
  return undefined;
}
