import { describe, expect, it } from 'vitest';
import {
  checkAlwaysOn,
  checkChanges,
  checkFragmentPackages,
  checkLegacy,
  checkUnselected,
  collectDoctorIssues,
  doctorChecklist,
  formatDoctorReport,
  issuesFoundMessage,
  notInitializedIssue,
  type DriftChange,
} from '../../src/doctor/checks.js';

const FIX = 'npx @agentinit/cli init';

const zustand = {
  id: 'zustand',
  name: 'Zustand',
  packages: ['zustand'],
  appliesTo: { zustand: '>=5' },
};

describe('collectDoctorIssues', () => {
  it('reports only Not initialized when the manifest is absent', () => {
    expect(
      collectDoctorIssues({
        initialized: false,
        changes: [{ kind: 'create', path: 'AGENTS.md' }],
        unselected: [{ id: 'zustand', name: 'Zustand' }],
        fragments: [zustand],
        packages: {},
        warnings: [{ kind: 'always-on-tokens', tokens: 2000, limit: 1500 }],
        legacyFiles: ['.cursorrules'],
      }),
    ).toEqual([{ kind: 'not-initialized', message: 'Not initialized', fix: FIX }]);
  });

  it('does not report a project with no supported framework', () => {
    expect(
      collectDoctorIssues({
        initialized: true,
        changes: [],
        unselected: [],
        fragments: [],
        packages: { typescript: '5.9.0' },
        warnings: [],
        legacyFiles: [],
      }),
    ).toEqual([]);
  });
});

describe('checkChanges', () => {
  it.each<[string, DriftChange, { kind: string; path: string; message: string; fix: string }]>([
    [
      'missing file',
      { kind: 'create', path: '.cursor/rules/agentinit-zustand.mdc' },
      {
        kind: 'missing',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc is missing.',
        fix: FIX,
      },
    ],
    [
      'missing file that would hold a block',
      { kind: 'create', path: 'AGENTS.md', blockId: 'core' },
      {
        kind: 'missing',
        path: 'AGENTS.md#core',
        message: 'AGENTS.md is missing.',
        fix: FIX,
      },
    ],
    [
      'missing managed block',
      { kind: 'conflict-edited', path: 'AGENTS.md', blockId: 'core', blockMissing: true },
      {
        kind: 'missing',
        path: 'AGENTS.md#core',
        message: 'AGENTS.md is missing managed block "core".',
        fix: FIX,
      },
    ],
    [
      'file edited by hand',
      { kind: 'conflict-edited', path: '.cursor/rules/agentinit-zustand.mdc' },
      {
        kind: 'edited',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc was edited by hand.',
        fix: FIX,
      },
    ],
    [
      'block edited by hand',
      { kind: 'conflict-edited', path: 'AGENTS.md', blockId: 'core' },
      {
        kind: 'edited',
        path: 'AGENTS.md#core',
        message: 'AGENTS.md managed block "core" was edited by hand.',
        fix: FIX,
      },
    ],
    [
      'generated content out of date',
      { kind: 'update', path: 'AGENTS.md', blockId: 'core' },
      {
        kind: 'outdated',
        path: 'AGENTS.md#core',
        message: 'AGENTS.md managed block "core" does not match the generated rules.',
        fix: FIX,
      },
    ],
    [
      'unmanaged file',
      { kind: 'conflict-unmanaged', path: 'CLAUDE.md', blockId: 'claude' },
      {
        kind: 'unmanaged',
        path: 'CLAUDE.md#claude',
        message: 'CLAUDE.md managed block "claude" is not managed.',
        fix: FIX,
      },
    ],
    [
      'stale owned file',
      { kind: 'delete-stale', path: '.cursor/rules/agentinit-zustand.mdc' },
      {
        kind: 'stale',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc is no longer generated.',
        fix: FIX,
      },
    ],
  ])('%s', (_name, change, expected) => {
    expect(checkChanges([change])).toEqual([expected]);
  });

  it('skips unchanged files', () => {
    expect(checkChanges([{ kind: 'unchanged', path: 'AGENTS.md', blockId: 'core' }])).toEqual([]);
  });
});

describe('checkUnselected', () => {
  it('names the matching fragment and points at init', () => {
    expect(checkUnselected([{ id: 'zustand', name: 'Zustand' }])).toEqual([
      {
        kind: 'unselected',
        message: 'Zustand (zustand) matches this project and is not selected.',
        fix: FIX,
      },
    ]);
  });
});

describe('checkFragmentPackages', () => {
  it('reports a selected fragment whose package is gone', () => {
    expect(checkFragmentPackages([zustand], {})).toEqual([
      {
        kind: 'package-removed',
        message: 'Zustand (zustand) is selected, but zustand is not in the project.',
        fix: FIX,
      },
    ]);
  });

  it('reports a selected fragment whose version left appliesTo', () => {
    expect(checkFragmentPackages([zustand], { zustand: '4.5.0' })).toEqual([
      {
        kind: 'unsupported-version',
        message: 'Zustand (zustand) is selected, but zustand@4.5.0 is outside >=5.',
        fix: FIX,
      },
    ]);
  });

  it.each([
    ['in range', { zustand: '5.0.0' }],
    ['unknown version', { zustand: null }],
  ])('stays quiet when the package is %s', (_name, packages) => {
    expect(checkFragmentPackages([zustand], packages)).toEqual([]);
  });

  it('checks an appliesTo package that detection does not require', () => {
    expect(
      checkFragmentPackages(
        [
          {
            id: 'tailwind',
            name: 'Tailwind CSS',
            packages: ['tailwindcss'],
            appliesTo: { tailwindcss: '>=4', typescript: '>=5' },
          },
        ],
        { tailwindcss: '4.1.0', typescript: '4.9.0' },
      ),
    ).toEqual([
      {
        kind: 'unsupported-version',
        message: 'Tailwind CSS (tailwind) is selected, but typescript@4.9.0 is outside >=5.',
        fix: FIX,
      },
    ]);
  });

  it('does not treat a marker-only fragment as a removed package', () => {
    expect(
      checkFragmentPackages([{ id: 'shadcn', name: 'shadcn/ui', packages: [], appliesTo: {} }], {}),
    ).toEqual([]);
  });
});

describe('checkAlwaysOn', () => {
  it('reports always-on content over the 1,500 token budget', () => {
    expect(checkAlwaysOn([{ kind: 'always-on-tokens', tokens: 1501, limit: 1500 }])).toEqual([
      {
        kind: 'always-on-tokens',
        message: 'Always-on content is 1,501 tokens, over the 1,500 token budget.',
        fix: 'Reduce always-on rules below 1,500 tokens.',
      },
    ]);
  });

  it('stays quiet when the plan has no budget warning', () => {
    expect(checkAlwaysOn([])).toEqual([]);
  });
});

describe('checkLegacy', () => {
  it.each(['.cursorrules', '.windsurfrules'])('reports %s', (filePath) => {
    expect(checkLegacy([filePath])).toEqual([
      {
        kind: 'legacy-file',
        path: filePath,
        message: `${filePath} still loads alongside the new rules.`,
        fix: `Remove ${filePath} if you no longer need it.`,
      },
    ]);
  });
});

describe('doctorChecklist', () => {
  it('lists six passing checks when there are no issues', () => {
    expect(doctorChecklist([])).toEqual([
      { id: 'manifest', label: 'manifest', ok: true, issues: [] },
      { id: 'managed-files', label: 'managed files', ok: true, issues: [] },
      { id: 'detected-packages', label: 'detected packages', ok: true, issues: [] },
      { id: 'package-versions', label: 'package versions', ok: true, issues: [] },
      { id: 'token-budget', label: 'token budget', ok: true, issues: [] },
      { id: 'legacy-files', label: 'legacy files', ok: true, issues: [] },
    ]);
  });

  it('attaches failing issues under the matching check', () => {
    const missing = {
      kind: 'missing' as const,
      path: 'AGENTS.md',
      message: 'AGENTS.md is missing.',
      fix: FIX,
    };
    const checks = doctorChecklist([notInitializedIssue(), missing]);
    expect(checks.find((check) => check.id === 'manifest')).toMatchObject({
      ok: false,
      issues: [notInitializedIssue()],
    });
    expect(checks.find((check) => check.id === 'managed-files')).toMatchObject({
      ok: false,
      issues: [missing],
    });
    expect(checks.filter((check) => check.ok)).toHaveLength(4);
  });
});

describe('issuesFoundMessage', () => {
  it.each([
    [1, '1 issue found.'],
    [2, '2 issues found.'],
  ])('formats %i issues', (count, message) => {
    expect(issuesFoundMessage(count)).toBe(message);
  });
});

describe('formatDoctorReport', () => {
  it('prints a clean project as no issues', () => {
    expect(formatDoctorReport([])).toBe('No issues found.');
  });

  it('prints the not-initialized title once', () => {
    expect(formatDoctorReport([notInitializedIssue()])).toBe(`Not initialized
  Fix: ${FIX}`);
  });

  it('groups issues and prints a fix for each one', () => {
    const issues = collectDoctorIssues({
      initialized: true,
      changes: [
        { kind: 'create', path: 'AGENTS.md' },
        { kind: 'create', path: 'ARCHITECTURE.md' },
        { kind: 'conflict-edited', path: '.cursor/rules/agentinit-zustand.mdc' },
      ],
      unselected: [],
      fragments: [],
      packages: {},
      warnings: [],
      legacyFiles: [],
    });
    expect(formatDoctorReport(issues)).toBe(`Missing
  AGENTS.md is missing.
    Fix: ${FIX}
  ARCHITECTURE.md is missing.
    Fix: ${FIX}

Edited
  .cursor/rules/agentinit-zustand.mdc was edited by hand.
    Fix: ${FIX}`);
  });
});
