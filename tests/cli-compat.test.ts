import { describe, expect, it } from 'vitest';
import {
  assessCliCompat,
  cliCompatNotice,
  formatCliVersionNotice,
  olderCliMessage,
} from '../src/cli-compat.js';

describe('assessCliCompat', () => {
  it.each([
    {
      name: 'same version',
      running: '0.1.1',
      manifest: '0.1.1',
      kind: 'same' as const,
    },
    {
      name: 'same version ignoring build metadata',
      running: '0.1.1+build.1',
      manifest: '0.1.1',
      kind: 'same' as const,
    },
    {
      name: 'running newer patch',
      running: '0.1.2',
      manifest: '0.1.1',
      kind: 'newer' as const,
    },
    {
      name: 'running newer minor',
      running: '0.2.0',
      manifest: '0.1.9',
      kind: 'newer' as const,
    },
    {
      name: 'same major.minor, older patch',
      running: '0.1.0',
      manifest: '0.1.1',
      kind: 'patch-behind' as const,
    },
    {
      name: 'older minor',
      running: '0.1.1',
      manifest: '0.2.0',
      kind: 'behind' as const,
    },
    {
      name: 'older major',
      running: '0.9.9',
      manifest: '1.0.0',
      kind: 'behind' as const,
    },
    {
      name: 'invalid manifest version',
      running: '0.1.1',
      manifest: 'not-a-version',
      kind: 'unknown' as const,
    },
    {
      name: 'invalid running version',
      running: 'dev',
      manifest: '0.1.1',
      kind: 'unknown' as const,
    },
  ])('$name → $kind', ({ running, manifest, kind }) => {
    const compat = assessCliCompat(running, manifest);
    expect(compat.kind).toBe(kind);
    if (kind === 'same') {
      expect(cliCompatNotice(compat)).toBeUndefined();
      return;
    }
    expect(cliCompatNotice(compat)).toBe(formatCliVersionNotice(manifest, running));
    if (kind === 'behind' && compat.kind === 'behind') {
      expect(compat.message).toBe(olderCliMessage(manifest));
    }
  });
});
