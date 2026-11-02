import { describe, expect, it } from 'vitest';
import { formatDiffs, formatFileTree, formatTokenLine } from '../../src/ui/report.js';

describe('formatFileTree', () => {
  it('nests paths and hides unchanged files', () => {
    expect(
      formatFileTree([
        { path: 'AGENTS.md', action: 'created', diff: '' },
        { path: '.cursor/rules/a.mdc', action: 'created', diff: '' },
        { path: 'ARCHITECTURE.md', action: 'unchanged', diff: '' },
      ]),
    ).toBe(
      ['├── .cursor', '│   └── rules', '│       └── a.mdc (created)', '└── AGENTS.md (created)'].join('\n'),
    );
  });
});

describe('formatDiffs', () => {
  it('keeps non-empty diffs and drops blank ones', () => {
    expect(
      formatDiffs([
        { path: 'AGENTS.md', action: 'created', diff: '--- AGENTS.md\n+++ AGENTS.md\n' },
        { path: 'skip.md', action: 'unchanged', diff: '   \n' },
      ]),
    ).toBe('--- AGENTS.md\n+++ AGENTS.md');
  });
});

describe('formatTokenLine', () => {
  it('states the estimate and the budget when the core is over it', () => {
    expect(formatTokenLine(40)).toBe('Always-on tokens: 40');
    expect(formatTokenLine(1600, { tokens: 1600, limit: 1500 })).toBe(
      'Always-on tokens: 1600, over the 1500 token budget.',
    );
  });
});
