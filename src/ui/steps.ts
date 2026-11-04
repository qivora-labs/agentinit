/** Visible step prefix for Clack questions (PRD §3.2). */
export function withStep(current: number, total: number, message: string): string {
  return `${String(current)}/${String(total)} ${message}`;
}

/**
 * Greenfield and customize both ask language/architecture plus one
 * framework step; libraries and agents are optional.
 */
export function countSetupSteps(input: {
  readonly libraries: boolean;
  readonly agents: boolean;
}): number {
  return 3 + (input.libraries ? 1 : 0) + (input.agents ? 1 : 0);
}
