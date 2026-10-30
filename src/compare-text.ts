/** Code-unit order, so sorted output does not depend on the process locale. */
export function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
