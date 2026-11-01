import { createHash } from 'node:crypto';

/**
 * SHA-256 hex of `text` with line endings normalized to LF (PRD §6.2).
 * `\r\n` is replaced before a lone `\r`, so a CRLF pair stays one newline.
 * Git `autocrlf` must not make an unchanged file look edited.
 */
export function contentHash(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
