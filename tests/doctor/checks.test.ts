import { describe, expect, it } from 'vitest';
import {
  checkAlwaysOn,
  checkChanges,
  checkFragmentPackages,
  checkLegacy,
  checkUnselected,
  cliVersionsDiffer,
  collectDoctorIssues,
  countBySeverity,
  doctorChecklist,
  doctorReport,
  EDITED_FIX,
  formatDoctorReport,
  issuesFoundMessage,
  notInitializedIssue,
  type DoctorCliVersions,
  type DriftChange,
} from '../../src/doctor/checks.js';

const FIX = 'npx @agentinit/cli init';

const SAME_VERSIONS: DoctorCliVersions = { running: '0.1.0', manifest: '0.1.0' };

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
        cliVersions: SAME_VERSIONS,
      }),
    ).toEqual([
      { kind: 'not-initialized', severity: 'error', message: 'Not initialized', fix: FIX },
    ]);
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
        cliVersions: SAME_VERSIONS,
      }),
    ).toEqual([]);
  });
});

describe('checkChanges', () => {
  it.each<[string, DriftChange, { kind: string; severity: string; path: string; message: string; fix: string }]>([
    [
      'missing file',
      { kind: 'create', path: '.cursor/rules/agentinit-zustand.mdc' },
      {
        kind: 'missing',
        severity: 'error',
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
        severity: 'error',
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
        severity: 'error',
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
        severity: 'error',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc was edited by hand.',
        fix: EDITED_FIX,
      },
    ],
    [
      'block edited by hand',
      { kind: 'conflict-edited', path: 'AGENTS.md', blockId: 'core' },
      {
        kind: 'edited',
        severity: 'error',
        path: 'AGENTS.md#core',
        message: 'AGENTS.md managed block "core" was edited by hand.',
        fix: EDITED_FIX,
      },
    ],
    [
      'generated content out of date',
      { kind: 'update', path: 'AGENTS.md', blockId: 'core' },
      {
        kind: 'outdated',
        severity: 'error',
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
        severity: 'error',
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
        severity: 'error',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc is no longer generated.',
        fix: FIX,
      },
    ],
  ])('%s', (_name, change, expected) => {
    expect(checkChanges([change], SAME_VERSIONS)).toEqual([expected]);
  });

  it('skips unchanged files', () => {
    expect(checkChanges([{ kind: 'unchanged', path: 'AGENTS.md', blockId: 'core' }], SAME_VERSIONS)).toEqual(
      [],
    );
  });

  it('reports rules-update when the running CLI is newer than the manifest', () => {
    expect(
      checkChanges([{ kind: 'update', path: 'AGENTS.md', blockId: 'core' }], {
        running: '0.1.1',
        manifest: '0.1.0',
      }),
    ).toEqual([
      {
        kind: 'rules-update',
        severity: 'warning',
        path: 'AGENTS.md#core',
        message:
          'AGENTS.md managed block "core" was generated by agentinit 0.1.0. agentinit 0.1.1 generates different rules.',
        fix: 'npx @agentinit/cli@0.1.1 init',
      },
    ]);
  });

  it('reports rules-update when the running CLI is older than the manifest', () => {
    expect(
      checkChanges([{ kind: 'update', path: '.cursor/rules/agentinit-zustand.mdc' }], {
        running: '0.1.1',
        manifest: '0.2.0',
      }),
    ).toEqual([
      {
        kind: 'rules-update',
        severity: 'warning',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc was generated by a newer agentinit (0.2.0).',
        fix: 'Run doctor with `@agentinit/cli@0.2.0` or newer.',
      },
    ]);
  });

  it('treats an invalid manifest cliVersion as a rules-update', () => {
    expect(
      checkChanges([{ kind: 'update', path: 'ARCHITECTURE.md' }], {
        running: '0.1.0',
        manifest: 'not-a-version',
      }),
    ).toEqual([
      {
        kind: 'rules-update',
        severity: 'warning',
        path: 'ARCHITECTURE.md',
        message:
          'ARCHITECTURE.md was generated by agentinit not-a-version. agentinit 0.1.0 generates different rules.',
        fix: 'npx @agentinit/cli@0.1.0 init',
      },
    ]);
  });

  it('keeps edited as an error when cli versions differ', () => {
    expect(
      checkChanges([{ kind: 'conflict-edited', path: '.cursor/rules/agentinit-zustand.mdc' }], {
        running: '0.1.1',
        manifest: '0.1.0',
      }),
    ).toEqual([
      {
        kind: 'edited',
        severity: 'error',
        path: '.cursor/rules/agentinit-zustand.mdc',
        message: '.cursor/rules/agentinit-zustand.mdc was edited by hand.',
        fix: EDITED_FIX,
      },
    ]);
  });
});

describe('cliVersionsDiffer', () => {
  it.each<[string, DoctorCliVersions, boolean]>([
    ['equal versions', { running: '0.1.0', manifest: '0.1.0' }, false],
    ['running newer', { running: '0.1.1', manifest: '0.1.0' }, true],
    ['running older', { running: '0.1.0', manifest: '0.2.0' }, true],
    ['invalid manifest', { running: '0.1.0', manifest: 'latest' }, true],
    ['invalid running', { running: 'dev', manifest: '0.1.0' }, true],
  ])('%s', (_name, versions, expected) => {
    expect(cliVersionsDiffer(versions)).toBe(expected);
  });
});

describe('checkUnselected', () => {
  it('names the matching fragment and points at init', () => {
    expect(checkUnselected([{ id: 'zustand', name: 'Zustand' }])).toEqual([
      {
        kind: 'unselected',
        severity: 'error',
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
        severity: 'error',
        message: 'Zustand (zustand) is selected, but zustand is not in the project.',
        fix: FIX,
      },
    ]);
  });

  it('reports a selected fragment whose version left appliesTo', () => {
    expect(checkFragmentPackages([zustand], { zustand: '4.5.0' })).toEqual([
      {
        kind: 'unsupported-version',
        severity: 'error',
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
        severity: 'error',
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
        severity: 'warning',
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
        severity: 'warning',
        path: filePath,
        message: `${filePath} still loads alongside the new rules.`,
        fix: `Remove ${filePath} if you no longer need it.`,
      },
    ]);
  });
});

describe('doctorReport', () => {
  it('is ok when there are only warnings', () => {
    const issues = checkLegacy(['.cursorrules']);
    expect(doctorReport(issues)).toEqual({ ok: true, issues });
  });

  it('is not ok when any issue is an error', () => {
    const issues = [...checkLegacy(['.cursorrules']), notInitializedIssue()];
    expect(doctorReport(issues).ok).toBe(false);
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

  it('lists only the failed manifest check when not initialized', () => {
    expect(doctorChecklist([notInitializedIssue()])).toEqual([
      {
        id: 'manifest',
        label: 'manifest',
        ok: false,
        issues: [notInitializedIssue()],
      },
    ]);
  });

  it('attaches failing issues under the matching check', () => {
    const missing = {
      kind: 'missing' as const,
      severity: 'error' as const,
      path: 'AGENTS.md',
      message: 'AGENTS.md is missing.',
      fix: FIX,
    };
    const checks = doctorChecklist([missing]);
    expect(checks.find((check) => check.id === 'managed-files')).toMatchObject({
      ok: false,
      issues: [missing],
    });
    expect(checks.filter((check) => check.ok)).toHaveLength(5);
  });
});

describe('issuesFoundMessage', () => {
  it.each([
    [1, 0, '1 error found.'],
    [2, 0, '2 errors found.'],
    [0, 1, '1 warning found.'],
    [0, 2, '2 warnings found.'],
    [1, 1, '1 error, 1 warning found.'],
    [2, 3, '2 errors, 3 warnings found.'],
    [0, 0, 'No issues found.'],
  ])('formats %i errors and %i warnings', (errors, warnings, message) => {
    expect(issuesFoundMessage(errors, warnings)).toBe(message);
  });
});

describe('countBySeverity', () => {
  it('counts errors and warnings separately', () => {
    expect(
      countBySeverity([
        notInitializedIssue(),
        ...checkLegacy(['.cursorrules']),
        ...checkAlwaysOn([{ kind: 'always-on-tokens', tokens: 1501, limit: 1500 }]),
      ]),
    ).toEqual({ errors: 1, warnings: 2 });
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
      cliVersions: SAME_VERSIONS,
    });
    expect(formatDoctorReport(issues)).toBe(`Missing
  AGENTS.md is missing.
    Fix: ${FIX}
  ARCHITECTURE.md is missing.
    Fix: ${FIX}

Edited
  .cursor/rules/agentinit-zustand.mdc was edited by hand.
    Fix: ${EDITED_FIX}`);
  });
});
