import { describe, expect, it } from 'vitest';
import { countSetupSteps, withStep } from '../../src/ui/steps.js';

describe('withStep', () => {
  it('prefixes the message with current/total', () => {
    expect(withStep(2, 5, 'Which libraries should we include?')).toBe(
      '2/5 Which libraries should we include?',
    );
  });
});

describe('countSetupSteps', () => {
  it('counts the three core steps plus optional libraries, agents, and workflows', () => {
    expect(countSetupSteps({ libraries: true, agents: true })).toBe(5);
    expect(countSetupSteps({ libraries: true, agents: false })).toBe(4);
    expect(countSetupSteps({ libraries: false, agents: true })).toBe(4);
    expect(countSetupSteps({ libraries: false, agents: false })).toBe(3);
    expect(countSetupSteps({ libraries: true, agents: true, workflows: true })).toBe(6);
    expect(countSetupSteps({ libraries: false, agents: false, workflows: true })).toBe(4);
  });
});
