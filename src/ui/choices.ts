import type { Selection } from '../registry/resolve.js';
import type { AgentTarget } from '../types.js';

/**
 * Agents are not fragment ids, so they sit beside the resolver `Selection`
 * instead of inside it. `init` (T27) needs both.
 */
export interface PromptedSetup {
  readonly selection: Selection;
  readonly agents: readonly AgentTarget[];
  /**
   * Opted-out detected fragment ids. Set by existing-project confirm/customize;
   * greenfield and `--yes` paths leave this undefined so the caller keeps the
   * previous list.
   */
  readonly excluded?: readonly string[];
  /**
   * Whether to emit slash-command workflows. Set by *Customize*; other paths
   * leave this undefined so the caller keeps the flag or saved value.
   */
  readonly workflows?: boolean;
}
