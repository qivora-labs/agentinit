import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentHash } from '../../src/io/hash.js';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** CRLF first, then a lone CR, so a pair does not become two newlines. */
function normalizeLineEndings(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

describe('contentHash', () => {
  it('is identical for LF and CRLF versions of the same content', () => {
    const lf = 'alpha\nbeta\n';
    const crlf = 'alpha\r\nbeta\r\n';
    expect(contentHash(lf)).toBe(contentHash(crlf));
    expect(contentHash(lf)).toBe(sha256(lf));
    expect(contentHash(crlf)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['empty', ''],
    ['no newline', 'alpha'],
    ['lf only', 'alpha\n'],
    ['crlf only', 'alpha\r\n'],
    ['mixed pair in the middle', 'alpha\r\nbeta\n'],
    ['lone carriage return', 'alpha\rbeta'],
    ['old mac lines', 'alpha\rbeta\r'],
  ])('hashes the LF normalization of %s', (_name, text) => {
    expect(contentHash(text)).toBe(sha256(normalizeLineEndings(text)));
  });

  it('differs when the content differs', () => {
    expect(contentHash('alpha\n')).not.toBe(contentHash('beta\n'));
  });

  it('treats a lone carriage return as LF and keeps a CRLF pair as one newline', () => {
    expect(contentHash('alpha\rbeta\n')).toBe(contentHash('alpha\nbeta\n'));
    expect(contentHash('alpha\r\n')).toBe(contentHash('alpha\n'));
    expect(contentHash('alpha\r\n')).not.toBe(contentHash('alpha\n\n'));
  });
});
