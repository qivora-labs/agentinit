/**
 * Closest candidate when the edit distance is at most `maxDistance`.
 * Ties keep the first candidate in list order.
 */
export function closestMatch(
  input: string,
  candidates: readonly string[],
  maxDistance = 2,
): string | undefined {
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshtein(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}

/** Classic Levenshtein distance over UTF-16 code units. */
export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    const leftChar = left.charCodeAt(i - 1);
    for (let j = 1; j <= right.length; j += 1) {
      const insert = (current[j - 1] ?? 0) + 1;
      const remove = (previous[j] ?? 0) + 1;
      const replace = (previous[j - 1] ?? 0) + (leftChar === right.charCodeAt(j - 1) ? 0 : 1);
      current[j] = Math.min(insert, remove, replace);
    }
    for (let j = 0; j < previous.length; j += 1) previous[j] = current[j] ?? 0;
  }

  return previous[right.length] ?? right.length;
}
