export function formatLabel(value) {
  if (typeof value !== 'string') throw new Error('Expected a string');
  return value.trim();
}
