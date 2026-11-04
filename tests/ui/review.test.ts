import { describe, expect, it } from 'vitest';
import {
  countConflicts,
  reviewEntries,
  reviewPlan,
  type ReviewChange,
  type ReviewPlanView,
} from '../../src/ui/review.js';
import { createTheme } from '../../src/ui/theme.js';
import { choicePrompt, recordingPrompter } from './recording-prompter.js';

const theme = createTheme(true, true, false);
const tokenLimit = 1500;

function planWith(paths: readonly { path: string; target: 'shared' | 'cursor' | 'claude' }[]): ReviewPlanView {
  return {
    ops: paths.map((entry) => ({
      path: entry.path,
      target: entry.target,
    })),
    alwaysOnTokens: 100,
    warnings: [],
  };
}

describe('reviewPlan', () => {
  it('shows the ready card then returns the chosen action', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'preview' }]);
    const changes: ReviewChange[] = [
      { kind: 'create', path: 'AGENTS.md', target: 'shared' },
      { kind: 'create', path: '.cursor/rules/a.mdc', target: 'cursor' },
      { kind: 'conflict-unmanaged', path: 'CLAUDE.md', target: 'claude' },
    ];
    const choice = await reviewPlan(prompter, {
      plan: planWith([
        { path: 'AGENTS.md', target: 'shared' },
        { path: '.cursor/rules/a.mdc', target: 'cursor' },
        { path: 'CLAUDE.md', target: 'claude' },
      ]),
      changes,
      theme,
      tokenLimit,
    });

    expect(choice).toBe('preview');
    const note = calls.find((call) => call.method === 'note');
    expect(note).toMatchObject({ method: 'note', title: 'Ready to write 3 files' });
    if (note?.method !== 'note') throw new Error('expected a review note');
    expect(note.message).toContain('Cursor');
    expect(note.message).toContain('Claude Code');
    expect(note.message).toContain('Shared');
    expect(note.message).toContain('Context cost');
    expect(note.message).toContain('1 existing file needs your decision');
    expect(choicePrompt(calls.find((call) => call.method === 'select')).initialValue).toBe('write');
  });

  it('omits the conflict line when nothing needs a decision', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'write' }]);
    await reviewPlan(prompter, {
      plan: planWith([{ path: 'AGENTS.md', target: 'shared' }]),
      changes: [{ kind: 'create', path: 'AGENTS.md', target: 'shared' }],
      theme,
      tokenLimit,
    });
    const note = calls.find((call) => call.method === 'note');
    if (note?.method !== 'note') throw new Error('expected a review note');
    expect(note.message).not.toContain('your decision');
  });
});

describe('reviewEntries and countConflicts', () => {
  it('maps change kinds and counts conflict prompts', () => {
    const changes: ReviewChange[] = [
      { kind: 'create', path: 'a.md', target: 'cursor' },
      { kind: 'update', path: 'b.md', target: 'shared' },
      { kind: 'conflict-unmanaged', path: 'c.md', target: 'shared' },
      { kind: 'conflict-edited', path: 'd.md', target: 'claude' },
      { kind: 'unchanged', path: 'e.md', target: 'cursor' },
    ];
    const entries = reviewEntries(
      changes,
      planWith([
        { path: 'a.md', target: 'cursor' },
        { path: 'b.md', target: 'shared' },
        { path: 'c.md', target: 'shared' },
        { path: 'd.md', target: 'claude' },
        { path: 'e.md', target: 'cursor' },
      ]),
    );
    expect(entries.map((entry) => entry.action)).toEqual([
      'created',
      'updated',
      'pending',
      'pending',
      'unchanged',
    ]);
    expect(countConflicts(changes)).toBe(2);
  });
});
