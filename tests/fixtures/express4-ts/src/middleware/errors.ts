export function reportError(error: unknown): string {
  return error instanceof Error ? error.message : 'error';
}
