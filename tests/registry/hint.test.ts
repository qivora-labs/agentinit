import { describe, expect, it } from 'vitest';
import { PICKER_HINT_LIMIT, pickerHint, truncateHint } from '../../src/registry/hint.js';

describe('pickerHint', () => {
  it('prefers hint when present', () => {
    expect(pickerHint('Short hint', 'A much longer description that would wrap')).toBe('Short hint');
  });

  it('falls back to a truncated description', () => {
    const description = 'React 19 actions and use, public Vite env vars, and lazy-loaded components.';
    expect(pickerHint(undefined, description)).toBe('React 19 actions and use, public Vite env…');
  });
});

describe('truncateHint', () => {
  it('leaves text within the limit unchanged', () => {
    expect(truncateHint('Exactly forty-eight characters of hint!!')).toHaveLength(40);
    expect(truncateHint('x'.repeat(PICKER_HINT_LIMIT))).toHaveLength(PICKER_HINT_LIMIT);
  });

  it('cuts at a word boundary and appends an ellipsis', () => {
    expect(truncateHint('one two three four five six seven eight nine ten eleven')).toMatch(/…$/u);
    expect(truncateHint('one two three four five six seven eight nine ten eleven').length).toBeLessThanOrEqual(
      PICKER_HINT_LIMIT,
    );
  });
});
