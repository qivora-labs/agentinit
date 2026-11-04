import { describe, expect, it } from 'vitest';
import type { Change } from '../../src/io/changes.js';
import type { Plan } from '../../src/plan/types.js';
import { countConflicts, reviewEntries, reviewPlan } from '../../src/ui/review.js';
import { createTheme } from '../../src/ui/theme.js';
import { choicePrompt, recordingPrompter } from './recording-prompter.js';

const theme = createTheme(true, true, false);

function planWith(paths: readonly { path: string; target: 'shared' | 'cursor' | 'claude' }[]): Plan {
  return {
    ops: paths.map((entry) => ({
      path: entry.path,
      kind: 'file' as const,
      content: 'x\n',
      target: entry.target,
    })),
    alwaysOnTokens: 100,
    warnings: [],
  };
}

describe('reviewPlan', () => {
  it('shows the ready card then returns the chosen action', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'preview' }]);
    const changes: Change[] = [
      { kind: 'create', path: 'AGENTS.md', opKind: 'managed-block', target: 'shared', content: 'a' },
      { kind: 'create', path: '.cursor/rules/a.mdc', opKind: 'file', target: 'cursor', content: 'b' },
      {
        kind: 'conflict-unmanaged',
        path: 'CLAUDE.md',
        opKind: 'managed-block',
        target: 'claude',
        content: 'c',
      },
    ];
    const choice = await reviewPlan(prompter, {
      plan: planWith([
        { path: 'AGENTS.md', target: 'shared' },
        { path: '.cursor/rules/a.mdc', target: 'cursor' },
        { path: 'CLAUDE.md', target: 'claude' },
      ]),
      changes,
      theme,
    });

    expect(choice).toBe('preview');
    const note = calls.find((call) => call.method === 'note');
    expect(note).toMatchObject({ method: 'note', title: 'Ready to write 3 files' });
    if (note?.method !== 'note') throw new Error('expected a review note');
    expect(note.message).toContain('Cursor');
    expect(note.message).toContain('Claude Code');
    expect(note.message).toContain('Shared');
    expect(note.message).toContain('Context cost');
    expect(note.message).toContain('1 existing file need your decision');
    expect(choicePrompt(calls.find((call) => call.method === 'select')).initialValue).toBe('write');
  });

  it('omits the conflict line when nothing needs a decision', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'write' }]);
    await reviewPlan(prompter, {
      plan: planWith([{ path: 'AGENTS.md', target: 'shared' }]),
      changes: [{ kind: 'create', path: 'AGENTS.md', opKind: 'managed-block', target: 'shared', content: 'a' }],
      theme,
    });
    const note = calls.find((call) => call.method === 'note');
    if (note?.method !== 'note') throw new Error('expected a review note');
    expect(note.message).not.toContain('need your decision');
  });
});

describe('reviewEntries and countConflicts', () => {
  it('maps change kinds and counts conflict prompts', () => {
    const changes: Change[] = [
      { kind: 'create', path: 'a.md', opKind: 'file', target: 'cursor', content: 'a' },
      { kind: 'update', path: 'b.md', opKind: 'file', target: 'shared', content: 'b' },
      { kind: 'conflict-unmanaged', path: 'c.md', opKind: 'managed-block', target: 'shared', content: 'c' },
      { kind: 'conflict-edited', path: 'd.md', opKind: 'file', target: 'claude', content: 'd' },
      { kind: 'unchanged', path: 'e.md', opKind: 'file', target: 'cursor', content: 'e' },
    ];
    const entries = reviewEntries(changes, planWith([
      { path: 'a.md', target: 'cursor' },
      { path: 'b.md', target: 'shared' },
      { path: 'c.md', target: 'shared' },
      { path: 'd.md', target: 'claude' },
      { path: 'e.md', target: 'cursor' },
    ]));
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
