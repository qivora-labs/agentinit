import { CANCELLED } from './exit-codes.js';

let interrupted = false;

/** SIGINT sets this. `apply` reads it before renaming temp files. */
export function requestInterrupt(): void {
  interrupted = true;
}

export function isInterrupted(): boolean {
  return interrupted;
}

/** Tests clear the flag so a later case in the same process is not aborted. */
export function resetInterruptState(): void {
  interrupted = false;
}

/**
 * Exit immediately unless an atomic write is open. `process.exit` during that
 * window skips temp cleanup and can leave a renamed subset of the plan.
 * The write checks `isInterrupted()` and removes temps before any rename.
 */
export function handleSigint(exit: (code: number) => void, atomicWrite: boolean): void {
  requestInterrupt();
  if (!atomicWrite) exit(CANCELLED);
}
