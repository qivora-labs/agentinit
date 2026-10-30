import type { Selection } from '../registry/resolve.js';
import type { AgentTarget } from '../types.js';

/**
 * Agents are not fragment ids, so they sit beside the resolver `Selection`
 * instead of inside it. `init` (T27) needs both.
 */
export interface PromptedSetup {
  readonly selection: Selection;
  readonly agents: readonly AgentTarget[];
}
