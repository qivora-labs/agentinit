import { createHash } from 'node:crypto';

/**
 * SHA-256 hex of `text` after `\r\n` → `\n`.
 * Git `autocrlf` must not make an unchanged file look edited (PRD §6.2).
 * Lone `\r` is left as-is; only CRLF pairs are normalized.
 */
export function contentHash(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
