import { describe, expect, it } from 'vitest';
import { assertTarballEntries, windowsCmdArgs } from '../../scripts/smoke.js';

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

  it('rejects stray files under dist/', () => {
    expect(() => {
      assertTarballEntries([...published, 'package/dist/junk/x']);
    }).toThrow(/unexpected paths/);
  });

  it('rejects a tarball that omits dist/cli.js', () => {
    expect(() => {
      assertTarballEntries(published.filter((entry) => entry !== 'package/dist/cli.js'));
    }).toThrow(/missing dist\/cli\.js/);
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

describe('windowsCmdArgs', () => {
  it.each([
    [
      'quotes a temp path that contains spaces',
      'npm.cmd',
      ['install', String.raw`C:\Users\Foo Bar\pkg.tgz`],
      String.raw`"npm.cmd install "C:\Users\Foo Bar\pkg.tgz""`,
    ],
    [
      'quotes the shim path passed to init --cwd',
      String.raw`C:\Users\Foo Bar\install\node_modules\.bin\agentinit.cmd`,
      ['init', '--yes', '--dry-run', '--cwd', String.raw`C:\Users\Foo Bar\project`],
      String.raw`""C:\Users\Foo Bar\install\node_modules\.bin\agentinit.cmd" init --yes --dry-run --cwd "C:\Users\Foo Bar\project""`,
    ],
    [
      'quotes parentheses so they are not a cmd group',
      'npm.cmd',
      ['install', String.raw`C:\Program Files (x86)\pkg.tgz`],
      String.raw`"npm.cmd install "C:\Program Files (x86)\pkg.tgz""`,
    ],
    [
      'doubles percent signs so cmd does not expand them',
      'npm.cmd',
      ['install', String.raw`C:\Users\100%\pkg.tgz`],
      String.raw`"npm.cmd install "C:\Users\100%%\pkg.tgz""`,
    ],
    [
      'leaves a plain --version command unquoted inside the /c string',
      'agentinit.cmd',
      ['--version'],
      '"agentinit.cmd --version"',
    ],
  ])('%s', (_name, executable, args, command) => {
    expect(windowsCmdArgs(executable, args)).toEqual(['/d', '/s', '/c', command]);
  });
});
