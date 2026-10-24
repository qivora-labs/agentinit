import { describe, expect, it } from 'vitest';
import { AgentInitError, NotInteractiveError, UnsupportedProjectError } from '../src/errors.js';
import { CANCELLED, DOCTOR_ISSUES, ERROR, SUCCESS } from '../src/exit-codes.js';

describe('exit codes', () => {
  it('matches PRD §3.1', () => {
    expect(SUCCESS).toBe(0);
    expect(ERROR).toBe(1);
    expect(DOCTOR_ISSUES).toBe(2);
    expect(CANCELLED).toBe(130);
  });
});

describe('errors', () => {
  it('defaults AgentInitError to exit code 1 and keeps an optional hint', () => {
    const error = new AgentInitError('nope', { hint: 'try again' });
    expect(error).toBeInstanceOf(Error);
    expect(error.exitCode).toBe(ERROR);
    expect(error.hint).toBe('try again');
    expect(error.message).toBe('nope');
  });

  it('uses the given exit code', () => {
    expect(new AgentInitError('stop', { exitCode: CANCELLED }).exitCode).toBe(CANCELLED);
  });

  it('marks unsupported projects as user errors', () => {
    const error = new UnsupportedProjectError('JavaScript projects are not supported yet');
    expect(error).toBeInstanceOf(AgentInitError);
    expect(error.exitCode).toBe(ERROR);
    expect(error.hint).toBeUndefined();
  });

  it('tells non-interactive runs to pass --yes', () => {
    const error = new NotInteractiveError();
    expect(error).toBeInstanceOf(AgentInitError);
    expect(error.exitCode).toBe(ERROR);
    expect(error.hint).toContain('--yes');
  });
});
