import { describe, expect, it } from 'vitest';
import { AGENT_TARGETS } from '../../src/context.js';
import { ERROR } from '../../src/exit-codes.js';
import { AgentInitError, UnsupportedProjectError } from '../../src/errors.js';
import {
  FILE_DEFAULTS,
  isNonInteractiveSetup,
  nonInteractiveSelection,
  type NonInteractiveOptions,
  type NonInteractiveSetup,
} from '../../src/ui/defaults.js';
import type { ProjectDraft } from '../../src/detect/index.js';
import { sampleDraft } from './draft.js';

function existing(
  draft: ProjectDraft = sampleDraft(),
  belowGitRoot = false,
  options: NonInteractiveOptions = {},
): NonInteractiveSetup {
  const result = nonInteractiveSelection({ kind: 'existing', draft, belowGitRoot }, options);
  if (!isNonInteractiveSetup(result)) throw result;
  return result;
}

describe('nonInteractiveSelection', () => {
  it('rejects an empty project with exit code 1', () => {
    const result = nonInteractiveSelection({ kind: 'greenfield' });
    expect(result).toBeInstanceOf(AgentInitError);
    expect(result).toMatchObject({
      exitCode: ERROR,
      message: 'An empty project needs interactive choices.',
      hint: 'Run again without --yes.',
    });
  });

  it('rejects a JavaScript project with exit code 1', () => {
    const result = nonInteractiveSelection({ kind: 'javascript' });
    expect(result).toBeInstanceOf(UnsupportedProjectError);
    expect(result).toMatchObject({
      exitCode: ERROR,
      message: "JavaScript projects aren't supported yet",
    });
  });

  it('rejects a monorepo root with exit code 1', () => {
    const result = nonInteractiveSelection({ kind: 'monorepo', tool: 'pnpm' });
    expect(result).toBeInstanceOf(AgentInitError);
    expect(result).toMatchObject({
      exitCode: ERROR,
      message: 'This directory is a monorepo root (pnpm). Run inside a single package.',
    });
  });

  it('stays in the current directory when the project is below the git root', () => {
    const result = existing(sampleDraft(), true);
    expect(result.useGitRoot).toBe(false);
  });

  it('uses the detected configuration', () => {
    const draft = sampleDraft();
    expect(existing(draft).selection).toEqual({
      language: 'typescript-strict',
      architecture: 'feature-based',
      frameworks: ['nextjs-app-router'],
      libraries: ['vitest'],
      origin: {
        'typescript-strict': 'detected',
        'feature-based': 'detected',
        'nextjs-app-router': 'detected',
        vitest: 'detected',
      },
    });
    expect(existing(draft).notices).toEqual([]);
  });

  it('uses flat and records a notice when architecture confidence is below 0.7', () => {
    const result = existing(sampleDraft({ architecture: { id: 'feature-based', confidence: 0.5 } }));
    expect(result.selection.architecture).toBe('flat');
    expect(result.selection.origin.flat).toBe('manual');
    expect(result.selection.origin['feature-based']).toBeUndefined();
    expect(result.notices).toEqual([{ kind: 'low-confidence-architecture', confidence: 0.5 }]);
  });

  it('keeps the detected architecture when confidence is 0.7', () => {
    const result = existing(sampleDraft({ architecture: { id: 'layered', confidence: 0.7 } }));
    expect(result.selection.architecture).toBe('layered');
    expect(result.selection.origin.layered).toBe('detected');
    expect(result.notices).toEqual([]);
  });

  it('selects agents whose config already exists', () => {
    const result = existing(sampleDraft({ suggestedAgents: ['claude', 'cursor'] }));
    expect(result.agents).toEqual(['claude', 'cursor']);
  });

  it('selects all four agents when none are preselected', () => {
    expect(existing().agents).toEqual([...AGENT_TARGETS]);
  });

  it('lets --agents replace preselection', () => {
    const result = existing(sampleDraft({ suggestedAgents: ['claude'] }), false, {
      agents: ['copilot'],
    });
    expect(result.agents).toEqual(['copilot']);
  });

  it.each([
    { row: 'existing unmanaged shared file', key: 'unmanagedShared', value: 'adopt' },
    { row: 'existing unmanaged non-shared file', key: 'unmanagedNonShared', value: 'skip' },
    { row: 'managed content edited by hand', key: 'managedEdited', value: 'skip' },
  ] as const)('$row defaults to $value', ({ key, value }) => {
    expect(existing().files[key]).toBe(value);
    expect(FILE_DEFAULTS[key]).toBe(value);
  });
});
