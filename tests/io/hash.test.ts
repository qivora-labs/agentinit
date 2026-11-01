import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentHash } from '../../src/io/hash.js';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
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
  ])('hashes the LF normalization of %s', (_name, text) => {
    expect(contentHash(text)).toBe(sha256(text.replaceAll('\r\n', '\n')));
  });

  it('differs when the content differs', () => {
    expect(contentHash('alpha\n')).not.toBe(contentHash('beta\n'));
  });

  it('does not treat a lone carriage return as a CRLF pair', () => {
    expect(contentHash('alpha\rbeta\n')).toBe(sha256('alpha\rbeta\n'));
    expect(contentHash('alpha\rbeta\n')).not.toBe(contentHash('alpha\nbeta\n'));
  });
});
