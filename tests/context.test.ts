import { describe, expect, it } from 'vitest';
import { createRunContext, parseAgents, requireInteractiveOrYes } from '../src/context.js';
import { NotInteractiveError } from '../src/errors.js';
import type { RunContextInput } from '../src/context.js';

function context(overrides: Partial<RunContextInput> = {}) {
  return createRunContext({
    cwd: '/work',
    yes: false,
    dryRun: false,
    agents: undefined,
    force: false,
    json: false,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    ...overrides,
  });
}

describe('createRunContext', () => {
  it.each([
    { stdinIsTTY: true, stdoutIsTTY: true, yes: false, isInteractive: true },
    { stdinIsTTY: true, stdoutIsTTY: false, yes: false, isInteractive: false },
    { stdinIsTTY: false, stdoutIsTTY: true, yes: false, isInteractive: false },
    { stdinIsTTY: false, stdoutIsTTY: false, yes: false, isInteractive: false },
    { stdinIsTTY: true, stdoutIsTTY: true, yes: true, isInteractive: false },
  ])(
    'stdin $stdinIsTTY stdout $stdoutIsTTY yes $yes → interactive $isInteractive',
    ({ isInteractive, ...flags }) => {
      expect(context(flags).isInteractive).toBe(isInteractive);
    },
  );

  it('copies the flag values', () => {
    const ctx = context({
      cwd: '/project',
      yes: true,
      dryRun: true,
      agents: ['claude', 'cursor'],
      force: true,
      json: true,
    });
    expect(ctx).toMatchObject({
      cwd: '/project',
      yes: true,
      dryRun: true,
      agents: ['claude', 'cursor'],
      force: true,
      json: true,
    });
  });
});

describe('requireInteractiveOrYes', () => {
  it('throws NotInteractiveError when the process is not a terminal and --yes is absent', () => {
    const ctx = context({ stdinIsTTY: false, stdoutIsTTY: false, yes: false });
    expect(() => {
      requireInteractiveOrYes(ctx);
    }).toThrow(NotInteractiveError);
    try {
      requireInteractiveOrYes(ctx);
    } catch (error) {
      expect(error).toBeInstanceOf(NotInteractiveError);
      if (error instanceof NotInteractiveError) {
        expect(error.hint).toContain('--yes');
        expect(error.exitCode).toBe(1);
      }
    }
  });

  it('allows a terminal session without --yes', () => {
    expect(() => {
      requireInteractiveOrYes(context());
    }).not.toThrow();
  });

  it('allows --yes when the process is not a terminal', () => {
    const ctx = context({ stdinIsTTY: false, stdoutIsTTY: false, yes: true });
    expect(ctx.isInteractive).toBe(false);
    expect(() => {
      requireInteractiveOrYes(ctx);
    }).not.toThrow();
  });
});

describe('parseAgents', () => {
  it('deduplicates agents and keeps the first-seen order', () => {
    expect(parseAgents(' copilot, cursor, copilot,claude ')).toEqual(['copilot', 'cursor', 'claude']);
  });

  it('rejects unknown names and lists the valid agents', () => {
    expect(() => parseAgents('cursor,foo')).toThrow(/foo/);
    expect(() => parseAgents('cursor,foo')).toThrow(/cursor, claude, windsurf, copilot/);
  });

  it('rejects an empty list', () => {
    expect(() => parseAgents(' , ')).toThrow(/Valid values: cursor, claude, windsurf, copilot/);
  });
});
