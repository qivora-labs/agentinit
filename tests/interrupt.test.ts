import { afterEach, describe, expect, it } from 'vitest';
import { handleSigint, isInterrupted, resetInterruptState } from '../src/interrupt.js';

afterEach(() => {
  resetInterruptState();
});

describe('handleSigint', () => {
  it('exits when no atomic write is open', () => {
    const exit = viExit();
    handleSigint(exit.fn, false);
    expect(isInterrupted()).toBe(true);
    expect(exit.codes).toEqual([130]);
  });

  it('defers exit while an atomic write can still remove temp files', () => {
    const exit = viExit();
    handleSigint(exit.fn, true);
    expect(isInterrupted()).toBe(true);
    expect(exit.codes).toEqual([]);
  });
});

function viExit(): { fn: (code: number) => void; codes: number[] } {
  const codes: number[] = [];
  return {
    codes,
    fn(code: number) {
      codes.push(code);
    },
  };
}
