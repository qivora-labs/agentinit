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
  it('maps detected folders onto the longest matching map row and lists the rest', () => {
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
    expect(content).not.toContain('## Other existing folders');
    expect(content).toContain('## Conventions for new code');
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
});
