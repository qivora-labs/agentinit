import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './helpers/run.js';

vi.mock('../src/commands/list.js', () => ({
  list: () => {
    throw new Error('kaboom');
  },
}));

const previousDebug = process.env.DEBUG;

afterEach(() => {
  if (previousDebug === undefined) delete process.env.DEBUG;
  else process.env.DEBUG = previousDebug;
});

describe('unexpected errors', () => {
  it('returns 1 without a stack trace', async () => {
    delete process.env.DEBUG;
    const result = await runCli(['list']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('kaboom');
    expect(result.stderr).toContain('This is a bug — please report it');
    expect(result.stderr).not.toContain('    at ');
  });

  it('prints the stack when DEBUG=agentinit', async () => {
    process.env.DEBUG = 'agentinit';
    const result = await runCli(['list']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('kaboom');
    expect(result.stderr).toContain('This is a bug — please report it');
    expect(result.stderr).toContain('    at ');
  });
});
