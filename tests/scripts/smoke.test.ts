import { describe, expect, it } from 'vitest';
import { assertTarballEntries } from '../../scripts/smoke.js';

const published = [
  'package/package.json',
  'package/LICENSE',
  'package/dist/cli.js',
  'package/registry/frameworks/nextjs-app-router.md',
];

describe('assertTarballEntries', () => {
  it('accepts package.json, LICENSE, dist, and registry', () => {
    expect(() => {
      assertTarballEntries(published);
    }).not.toThrow();
  });

  it('accepts a packed README.md', () => {
    expect(() => {
      assertTarballEntries([...published, 'package/README.md'], { requireReadme: true });
    }).not.toThrow();
  });

  it('rejects paths outside the published layout', () => {
    expect(() => {
      assertTarballEntries([...published, 'package/src/cli.ts']);
    }).toThrow(/unexpected paths/);
  });

  it('rejects a tarball that omits registry', () => {
    expect(() => {
      assertTarballEntries(published.filter((entry) => !entry.includes('registry/')));
    }).toThrow(/missing registry/);
  });

  it('requires README.md only when the repository has one', () => {
    expect(() => {
      assertTarballEntries(published, { requireReadme: true });
    }).toThrow(/missing README.md/);
  });
});
