import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/plan/build-plan.js';
import { renderTargetContext } from '../../src/plan/render.js';
import { architectureMdAdapter } from '../../src/targets/architecture-md.js';
import { layeredFragment, profile, resolved, ruleFragment } from '../plan/helpers.js';

function architecture(folders: readonly string[], srcDir: '' | 'src', mode: 'existing' | 'greenfield' = 'existing'): string {
  const ctx = renderTargetContext(
    profile({
      mode,
      srcDir,
      packageManager: mode === 'greenfield' ? null : 'pnpm',
      folders: [...folders],
    }),
    resolved([layeredFragment()]),
  );
  const op = architectureMdAdapter(ctx)[0];
  if (op === undefined) throw new Error('missing architecture op');
  return op.content;
}

describe('architectureMdAdapter', () => {
  it('maps each folder to the first same-length map row and lists the rest', () => {
    const content = architecture(['components/atoms', 'lib', 'components', 'domain'], 'src');
    expect(content).toContain('| `src/components/atoms` | One component group. |');
    expect(content).toContain('| `src/components` | UI modules. |');
    expect(content).toContain('| `src/domain` | Business rules. |');
    expect(content).toContain('## Other existing folders');
    expect(content).toContain('- `src/lib`');
    expect(content).not.toMatch(/\bmove\b/iu);
    expect(content).not.toContain('const example = true');
    expect(content.indexOf('| `src/components` |')).toBeLessThan(content.indexOf('| `src/components/atoms` |'));
    expect(content.indexOf('| `src/components/atoms` |')).toBeLessThan(content.indexOf('| `src/domain` |'));
  });

  it('says when an existing project has no detected folders', () => {
    const content = architecture([], 'src');
    expect(content).toContain('No folders were detected under the source root.');
    expect(content).not.toContain('None of the detected folders match a row in the architecture map.');
    expect(content).not.toContain('## Other existing folders');
    expect(content).toContain('## Conventions for new code');
  });

  it('says when every detected folder misses the map', () => {
    const content = architecture(['lib'], 'src');
    expect(content).toContain(
      'No detected folder matches the architecture map. Follow the conventions below for new code.',
    );
    expect(content).not.toContain('No folders were detected under the source root.');
    expect(content).not.toContain('## Other existing folders');
    expect(content).toContain('- `src/lib`');
    expect(content).not.toMatch(/\bmove\b/iu);
  });

  it('merges framework Map rows when matching detected folders', () => {
    const frameworkBody = [
      '## Map',
      '| Path | Responsibility |',
      '| :--- | :--- |',
      '| `{{src}}app/` | App Router route segments. |',
      '',
      '## Directives',
      '- **ALWAYS** keep boundaries.',
      '',
      '```ts',
      ' const ok = true;',
      '```',
    ].join('\n');
    const content =
      buildPlan(
        profile({ folders: ['app', 'lib'] }),
        resolved([
          layeredFragment(),
          ruleFragment({
            id: 'nextjs-app-router',
            name: 'Next.js App Router',
            category: 'framework',
            scope: 'glob',
            order: 30,
            body: frameworkBody,
            globs: ['{{src}}app/**/*.ts'],
          }),
        ]),
      ).ops.find((op) => op.path === 'ARCHITECTURE.md')?.content ?? '';

    expect(content).toContain('| `src/app` | App Router route segments. |');
    expect(content).toContain('## Other existing folders');
    expect(content).toContain('- `src/lib`');
  });

  it('uses paths relative to the project root when there is no src directory', () => {
    const content = architecture(['domain', 'lib'], '');
    expect(content).toContain('| `domain` | Business rules. |');
    expect(content).toContain('- `lib`');
    expect(content).not.toContain('src/domain');
  });

  it('shows the planned map in greenfield and ignores detected folders', () => {
    const content = architecture(['lib', 'domain'], 'src', 'greenfield');
    expect(content).toContain('## Planned layout');
    expect(content).toContain('| `src/domain/` | Business rules. |');
    expect(content).toContain('| `src/components/<group>/` | One component group. |');
    expect(content).not.toContain('## Other existing folders');
    expect(content).not.toContain('src/lib');
    expect(content).not.toContain('## Layout');
  });

  it('keeps a non-table map as the planned layout text', () => {
    const body = ['## Summary', 'Short.', '', '## Map', '- ui → domain → data', '', '## Directives', '- **ALWAYS** depend inward.'].join(
      '\n',
    );
    const plan = buildPlan(
      profile({ mode: 'greenfield', packageManager: null, folders: ['lib'] }),
      resolved([
        ruleFragment({
          id: 'layered',
          name: 'Layered',
          category: 'architecture',
          scope: 'always',
          order: 10,
          body,
        }),
      ]),
    );
    const content = plan.ops.find((op) => op.path === 'ARCHITECTURE.md')?.content ?? '';
    expect(content).toContain('- ui → domain → data');
    expect(content).toContain('## Conventions for new code');
    expect(content).not.toContain('src/lib');
  });

  it('escapes folder names and responsibilities that would break the table or the list', () => {
    const body = [
      '## Summary',
      'Short.',
      '',
      '## Map',
      '| Path | Responsibility |',
      '| :--- | :--- |',
      '| `<name>` | See [docs](http://evil.test) and `code`. |',
      '',
      '## Directives',
      '- Stay.',
    ].join('\n');
    const content = buildPlan(
      profile({ srcDir: '', folders: ['a|b', 'c`d', 'e\nf', 'p|q/r', 'x`y/z'] }),
      resolved([
        ruleFragment({
          id: 'layered',
          name: 'Layered',
          category: 'architecture',
          scope: 'always',
          order: 10,
          body,
        }),
      ]),
    ).ops.find((op) => op.path === 'ARCHITECTURE.md')?.content ?? '';

    expect(content).toContain('| a\\|b | See \\[docs\\](http://evil.test) and \\`code\\`. |');
    expect(content).toContain('| ``c`d`` | See \\[docs\\](http://evil.test) and \\`code\\`. |');
    expect(content).toContain('| `e f` | See \\[docs\\](http://evil.test) and \\`code\\`. |');
    expect(content).toContain('- p\\|q/r');
    expect(content).toContain('- ``x`y/z``');
    expect(content).not.toContain('| a|b |');
    expect(content).not.toContain('[docs](http://evil.test)');
    expect(content).not.toContain('- `p|q/r`');
    expect(content.indexOf('| a\\|b |')).toBeLessThan(content.indexOf('| ``c`d`` |'));
    expect(content.indexOf('| ``c`d`` |')).toBeLessThan(content.indexOf('| `e f` |'));
    expect(content.indexOf('- p\\|q/r')).toBeLessThan(content.indexOf('- ``x`y/z``'));
  });

  it('lists every detected folder as unmatched when the map is not a table', () => {
    const body = ['## Summary', 'Short.', '', '## Map', '- ui → domain → data', '', '## Directives', '- **ALWAYS** depend inward.'].join(
      '\n',
    );
    const plan = buildPlan(
      profile({ folders: ['lib', 'domain'] }),
      resolved([
        ruleFragment({
          id: 'layered',
          name: 'Layered',
          category: 'architecture',
          scope: 'always',
          order: 10,
          body,
        }),
      ]),
    );
    const content = plan.ops.find((op) => op.path === 'ARCHITECTURE.md')?.content ?? '';
    expect(content).toContain(
      'No detected folder matches the architecture map. Follow the conventions below for new code.',
    );
    expect(content).not.toContain('No folders were detected under the source root.');
    expect(content).not.toContain('- ui → domain → data');
    expect(content).not.toContain('## Other existing folders');
    expect(content).toContain('- `src/domain`');
    expect(content).toContain('- `src/lib`');
    expect(content.indexOf('- `src/domain`')).toBeLessThan(content.indexOf('- `src/lib`'));
  });
});
