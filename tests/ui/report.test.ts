import { describe, expect, it } from 'vitest';
import { stripAnsi } from '../../src/ui/align.js';
import { existingNextSteps, formatNextSteps } from '../../src/ui/next-steps.js';
import {
  formatAgentReport,
  formatDiffs,
  formatFileTree,
  formatTokenLine,
  resolveReportTarget,
  type ReportEntry,
} from '../../src/ui/report.js';
import { createTheme } from '../../src/ui/theme.js';

const plain = createTheme(false, true);
const color = createTheme(true, true, true);

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
  it('skips created files and blank diffs; headers existing-file changes', () => {
    const unified = [
      'Index: CLAUDE.md',
      '===================================================================',
      '--- CLAUDE.md',
      '+++ CLAUDE.md',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');
    expect(
      formatDiffs(
        [
          { path: 'AGENTS.md', action: 'created', diff: `${unified}\n` },
          { path: 'skip.md', action: 'unchanged', diff: '   \n' },
          { path: 'CLAUDE.md', action: 'updated', diff: unified },
        ],
        plain,
      ),
    ).toBe(['CLAUDE.md (updated)', '@@ -1,1 +1,1 @@', '-old', '+new'].join('\n'));
  });
});

describe('formatTokenLine', () => {
  it('keeps the short form on a pipe', () => {
    expect(formatTokenLine(40)).toBe('Always-on tokens: 40');
    expect(formatTokenLine(1600, { tokens: 1600, limit: 1500 })).toBe(
      'Always-on tokens: 1600, over the 1500 token budget.',
    );
  });

  it('spells out context cost on a TTY', () => {
    expect(formatTokenLine(830, undefined, { theme: color, limit: 1500 })).toBe(
      'Context cost  ~830 tokens loaded in every chat (budget 1,500)',
    );
  });

  it('uses the warning tone when over budget on a TTY', () => {
    const line = formatTokenLine(1600, { tokens: 1600, limit: 1500 }, { theme: color });
    expect(stripAnsi(line)).toBe(
      'Context cost  ~1,600 tokens loaded in every chat (over the 1,500 token budget)',
    );
    expect(line).toContain('\u001b[33m');
  });
});

describe('formatAgentReport', () => {
  const next15: ReportEntry[] = [
    { path: 'AGENTS.md', action: 'created', target: 'shared' },
    { path: 'ARCHITECTURE.md', action: 'created', target: 'shared' },
    { path: 'CLAUDE.md', action: 'created', target: 'claude' },
    { path: '.claude/rules/a.md', action: 'created', target: 'claude' },
    { path: '.claude/skills/new-feature/SKILL.md', action: 'created', target: 'claude' },
    { path: '.cursor/rules/a.mdc', action: 'created', target: 'cursor' },
    { path: '.cursor/commands/new-feature.md', action: 'created', target: 'cursor' },
    { path: '.windsurf/rules/a.md', action: 'created', target: 'windsurf' },
    { path: '.github/copilot-instructions.md', action: 'created', target: 'copilot' },
    { path: '.github/instructions/a.instructions.md', action: 'created', target: 'copilot' },
  ];

  it('groups by AGENT_TARGETS order and omits empty agents', () => {
    const report = formatAgentReport(
      [
        { path: '.github/copilot-instructions.md', action: 'created', target: 'copilot' },
        { path: '.cursor/rules/a.mdc', action: 'created', target: 'cursor' },
        { path: 'AGENTS.md', action: 'created', target: 'shared' },
      ],
      plain,
    );
    expect(report).toBe(
      [
        'Wrote 3 files for 2 agents',
        'Cursor          1 file  .cursor/',
        'GitHub Copilot  1 file  .github/',
        'Shared          AGENTS.md',
      ].join('\n'),
    );
  });

  it('shows mixed-action breakdown and warning colors', () => {
    const report = formatAgentReport(
      [
        { path: '.cursor/a.mdc', action: 'created', target: 'cursor' },
        { path: '.cursor/b.mdc', action: 'updated', target: 'cursor' },
        { path: '.cursor/c.mdc', action: 'adopted', target: 'cursor' },
        { path: '.cursor/d.mdc', action: 'skipped', target: 'cursor' },
        { path: '.cursor/e.mdc', action: 'created', target: 'cursor' },
      ],
      color,
    );
    const plainText = stripAnsi(report);
    expect(plainText).toContain('5 files · 1 updated, 1 adopted, 1 skipped');
    expect(report).toContain('\u001b[33m');
    expect(report).toContain('\u001b[90m');
  });

  it('groups deleted cursor paths when the plan no longer lists them', () => {
    const report = formatAgentReport(
      [
        { path: '.cursor/rules/old.mdc', action: 'deleted', target: 'cursor' },
        { path: '.cursor/commands/old.md', action: 'deleted', target: 'cursor' },
        { path: '.claude/rules/a.md', action: 'created', target: 'claude' },
      ],
      plain,
    );
    expect(report).toBe(
      [
        'Wrote 3 files for 2 agents',
        'Cursor       2 files · 2 deleted  .cursor/',
        'Claude Code  1 file               .claude/',
      ].join('\n'),
    );
  });

  it('keeps deleted Claude root and folder files on one Claude Code row', () => {
    const report = formatAgentReport(
      [
        { path: 'CLAUDE.md', action: 'deleted', target: 'claude' },
        { path: '.claude/rules/a.md', action: 'deleted', target: 'claude' },
        { path: '.cursor/rules/a.mdc', action: 'created', target: 'cursor' },
      ],
      plain,
    );
    expect(report).toBe(
      [
        'Wrote 3 files for 2 agents',
        'Cursor       1 file               .cursor/',
        'Claude Code  2 files · 2 deleted  .claude/',
      ].join('\n'),
    );
  });

  it('lists orphan deletes under Removed without counting them as agents', () => {
    const report = formatAgentReport(
      [
        { path: 'legacy-notes.md', action: 'deleted', target: 'removed' },
        { path: 'old-rules.md', action: 'deleted', target: 'removed' },
        { path: 'AGENTS.md', action: 'created', target: 'shared' },
      ],
      plain,
    );
    expect(report).toBe(
      [
        'Wrote 3 files for 0 agents',
        'Shared   AGENTS.md',
        'Removed  2 files · 2 deleted',
      ].join('\n'),
    );
  });

  it('keeps the next15-src style report within 12 lines with next steps and Done', async () => {
    const report = formatAgentReport(
      [
        ...next15,
        // Pad to the fixture’s four-agent shape with extra created files.
        { path: '.claude/skills/refactor/SKILL.md', action: 'created', target: 'claude' },
        { path: '.claude/skills/review-arch/SKILL.md', action: 'created', target: 'claude' },
        { path: '.claude/skills/write-tests/SKILL.md', action: 'created', target: 'claude' },
        { path: '.cursor/commands/refactor.md', action: 'created', target: 'cursor' },
        { path: '.cursor/commands/review-arch.md', action: 'created', target: 'cursor' },
        { path: '.cursor/commands/write-tests.md', action: 'created', target: 'cursor' },
        { path: '.windsurf/workflows/new-feature.md', action: 'created', target: 'windsurf' },
        { path: '.windsurf/workflows/refactor.md', action: 'created', target: 'windsurf' },
        { path: '.windsurf/workflows/review-arch.md', action: 'created', target: 'windsurf' },
        { path: '.windsurf/workflows/write-tests.md', action: 'created', target: 'windsurf' },
        { path: '.github/prompts/new-feature.prompt.md', action: 'created', target: 'copilot' },
        { path: '.github/prompts/refactor.prompt.md', action: 'created', target: 'copilot' },
        { path: '.github/prompts/review-arch.prompt.md', action: 'created', target: 'copilot' },
        { path: '.github/prompts/write-tests.prompt.md', action: 'created', target: 'copilot' },
      ],
      plain,
    );
    const token = stripAnsi(formatTokenLine(830, undefined, { theme: color, limit: 1500 }));
    const steps = stripAnsi(
      formatNextSteps(
        existingNextSteps(['cursor', 'claude', 'windsurf', 'copilot'], [
          { id: 'write-tests', order: 50 },
          { id: 'new-feature', order: 50 },
        ]),
        color,
      ),
    );
    const body = [report, token, steps, 'Done.'].join('\n');
    expect(body.split('\n').length).toBeLessThanOrEqual(12);
    await expect(`${body}\n`).toMatchFileSnapshot('../__snapshots__/ui/init-report-tty.txt');
  });
});

describe('resolveReportTarget', () => {
  it('uses the plan target when present', () => {
    const map = new Map<string, 'cursor' | 'shared'>([['AGENTS.md', 'shared']]);
    expect(resolveReportTarget('AGENTS.md', map)).toBe('shared');
  });

  it.each([
    ['.cursor/rules/gone.mdc', 'cursor'],
    ['CLAUDE.md', 'claude'],
    ['.claude/rules/gone.md', 'claude'],
    ['.cursorrules', 'cursor'],
    ['.windsurfrules', 'windsurf'],
    ['.devin/settings.json', 'windsurf'],
    ['.devin', 'windsurf'],
    ['orphan.md', 'removed'],
  ] as const)('falls back for deleted %s → %s', (path, target) => {
    expect(resolveReportTarget(path, new Map())).toBe(target);
  });
});
