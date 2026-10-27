import { describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import {
  findPlaceholders,
  renderBody,
  renderGlobs,
  scriptCommand,
  type PlaceholderContext,
} from '../../src/plan/placeholders.js';
import type { PackageManager } from '../../src/types.js';

function context(overrides: Partial<PlaceholderContext> = {}): PlaceholderContext {
  return {
    src: 'src/',
    pm: 'pnpm',
    scripts: { test: 'vitest' },
    ...overrides,
  };
}

describe('scriptCommand', () => {
  it.each([
    ['npm', 'npm run test'],
    ['pnpm', 'pnpm test'],
    ['yarn', 'yarn test'],
    ['bun', 'bun run test'],
  ] as const)('%s runs the package script as %s', (pm: PackageManager, expected: string) => {
    expect(scriptCommand(pm, 'test')).toBe(expected);
  });
});

describe('renderGlobs', () => {
  it.each([
    ['src/' as const, 'src/app/**/*.tsx'],
    ['' as const, 'app/**/*.tsx'],
  ])('renders {{src}}app/**/*.tsx with src %j', (src, expected) => {
    expect(renderGlobs(['{{src}}app/**/*.tsx'], context({ src }))).toEqual([expected]);
  });

  it('collapses duplicate slashes, drops duplicate globs, and keeps first-seen order', () => {
    expect(
      renderGlobs(
        ['{{src}}/app/**/*.tsx', 'lib/**/*.ts', '{{src}}app/**/*.tsx', 'lib/**/*.ts'],
        context({ src: 'src/' }),
      ),
    ).toEqual(['src/app/**/*.tsx', 'lib/**/*.ts']);
  });

  it('omits a glob whose {{pm}} or {{scripts.*}} cannot be resolved', () => {
    expect(
      renderGlobs(['{{src}}a.ts', '{{pm}}/**', '{{scripts.lint}}/**'], context({ src: '', pm: null })),
    ).toEqual(['a.ts']);
  });

  it('is idempotent after src substitution', () => {
    const once = renderGlobs(['{{src}}/app/**/*.ts'], context({ src: 'src/' }));
    expect(renderGlobs(once, context({ src: 'src/' }))).toEqual(once);
    expect(once).toEqual(['src/app/**/*.ts']);
  });
});

describe('renderBody', () => {
  it.each([
    ['npm', 'npm run test'],
    ['pnpm', 'pnpm test'],
    ['yarn', 'yarn test'],
    ['bun', 'bun run test'],
  ] as const)('renders {{scripts.test}} for %s', (pm: PackageManager, expected: string) => {
    expect(renderBody('{{scripts.test}}', context({ pm, scripts: { test: 'vitest' } }))).toBe(expected);
    expect(renderBody('{{scripts.test:unit}}', context({ pm, scripts: { 'test:unit': 'vitest' } }))).toBe(
      expected.replace('test', 'test:unit'),
    );
  });

  it('drops a missing-script list item, drops the heading it emptied, and keeps the rest', () => {
    const source = [
      '## Setup',
      '',
      'Do this.',
      '',
      '## Scripts',
      '',
      '- Run `{{scripts.lint}}` before pushing.',
      '',
      '## Testing',
      '',
      '- Run `{{scripts.test}}`.',
      '',
    ].join('\n');

    expect(renderBody(source, context())).toBe(
      ['## Setup', '', 'Do this.', '', '## Testing', '', '- Run `pnpm test`.', ''].join('\n'),
    );
  });

  it('drops every line that uses {{pm}} or {{scripts.*}} when pm is null', () => {
    const source = ['Keep {{src}}app.', 'Manager {{pm}}.', 'Run {{scripts.test}}.', 'Plain line.'].join('\n');

    expect(renderBody(source, context({ src: '', pm: null, scripts: { test: 'vitest' } }))).toBe(
      ['Keep app.', 'Plain line.'].join('\n'),
    );
  });

  it('drops a whole line when any placeholder on it is unresolvable', () => {
    expect(renderBody('{{src}}app and {{scripts.lint}}', context())).toBe('');
  });

  it('renders {{pm}} and {{src}} on lines that can be resolved', () => {
    expect(renderBody('Use {{pm}} in {{src}}app.', context({ pm: 'yarn', src: 'src/' }))).toBe(
      'Use yarn in src/app.',
    );
  });

  it('throws when a placeholder name is unknown', () => {
    expect(() => renderBody('Use {{unknown}} here', context())).toThrow(AgentInitError);
    expect(() => renderBody('Use {{unknown}} here', context())).toThrow(/unknown/u);
  });

  it('throws for an unknown placeholder even on a line that would otherwise be dropped', () => {
    expect(() => renderBody('{{scripts.lint}} {{nope}}', context())).toThrow(/nope/u);
  });

  it('leaves placeholder-free text unchanged, including an already empty heading', () => {
    const source = '## Empty\n\n## Kept\n\n- stay\n';
    expect(renderBody(source, context())).toBe(source);
  });

  it('is idempotent after placeholders have been rendered', () => {
    const source = '## Testing\n\n- Run {{scripts.test}}.\n\n## Missing\n\n- {{scripts.lint}}\n';
    const once = renderBody(source, context());
    // The blank line before the removed heading stays in the previous section.
    expect(once).toBe('## Testing\n\n- Run pnpm test.\n\n');
    expect(renderBody(once, context())).toBe(once);
  });

  it('drops an unresolvable line inside a fence and keeps both fences when other lines remain', () => {
    const source = ['```ts', 'const cmd = "{{scripts.lint}}";', 'const kept = 1;', '```'].join('\n');
    expect(renderBody(source, context())).toBe(['```ts', 'const kept = 1;', '```'].join('\n'));
  });

  it('drops both fences when every interior line is unresolvable', () => {
    const source = ['Before', '```ts', 'const cmd = "{{scripts.lint}}";', '```', 'After'].join('\n');
    expect(renderBody(source, context())).toBe(['Before', 'After'].join('\n'));
  });

  it('drops a whole fenced block when a fence line itself is unresolvable', () => {
    const source = ['Before', '```{{pm}}', 'const kept = 1;', '```', 'After'].join('\n');
    expect(renderBody(source, context({ pm: null }))).toBe(['Before', 'After'].join('\n'));
  });

  it('does not treat a heading inside a fence as a section heading', () => {
    const source = ['```md', '## {{scripts.lint}}', '- also {{scripts.lint}}', '```', '## Real', '', 'stay'].join(
      '\n',
    );
    expect(renderBody(source, context())).toBe(['## Real', '', 'stay'].join('\n'));
  });

  it('drops a heading whose only content was a fenced block that could not render', () => {
    const source = ['## Example', '', '```ts', '{{scripts.lint}}', '```', '', '## Next', '', 'ok', ''].join('\n');
    expect(renderBody(source, context())).toBe(['## Next', '', 'ok', ''].join('\n'));
  });

  it('keeps a parent heading when a nested heading is the only emptied section', () => {
    const source = ['## Parent', '', 'intro', '', '### Child', '', '- {{scripts.lint}}', '', '## Next', '', 'ok'].join(
      '\n',
    );
    expect(renderBody(source, context())).toBe(
      ['## Parent', '', 'intro', '', '## Next', '', 'ok'].join('\n'),
    );
  });
});

describe('findPlaceholders', () => {
  it('returns trimmed names in order, including duplicates', () => {
    expect(findPlaceholders('{{src}} {{ pm }} {{scripts.test}} {{src}}')).toEqual([
      'src',
      'pm',
      'scripts.test',
      'src',
    ]);
  });
});
