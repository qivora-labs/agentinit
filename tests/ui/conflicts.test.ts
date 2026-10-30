import { describe, expect, it } from 'vitest';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import type { Selection } from '../../src/registry/resolve.js';
import { applyConflictDecisions, promptConflicts } from '../../src/ui/conflicts.js';
import { choicePrompt, recordingPrompter } from './recording-prompter.js';

let registry: Registry | undefined;

async function bundledRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

function selection(): Selection {
  return {
    language: 'typescript',
    architecture: 'flat',
    frameworks: [],
    libraries: ['vitest', 'zustand'],
    origin: {
      typescript: 'manual',
      flat: 'manual',
      vitest: 'manual',
      zustand: 'manual',
    },
  };
}

describe('promptConflicts', () => {
  it('asks nothing when there are no conflicts', async () => {
    const { prompter, calls } = recordingPrompter([]);
    await expect(promptConflicts(prompter, [], await bundledRegistry())).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it('keeps both fragments', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'keep-both' }]);
    const current = selection();
    const decisions = await promptConflicts(
      prompter,
      [{ a: 'vitest', b: 'zustand' }],
      await bundledRegistry(),
    );
    expect(choicePrompt(calls[0]).message).toBe(
      '"Vitest" and "Zustand" conflict. Keep one, or keep both?',
    );
    expect(decisions).toEqual([{ a: 'vitest', b: 'zustand', choice: 'keep-both' }]);
    expect(applyConflictDecisions(current, decisions)).toBe(current);
  });

  it('drops the fragment the user does not keep', async () => {
    const { prompter } = recordingPrompter([
      { type: 'select', value: 'keep-one' },
      { type: 'select', value: 'vitest' },
    ]);
    const decisions = await promptConflicts(
      prompter,
      [{ a: 'vitest', b: 'zustand' }],
      await bundledRegistry(),
    );
    expect(decisions).toEqual([
      { a: 'vitest', b: 'zustand', choice: 'keep-one', keep: 'vitest' },
    ]);
    expect(applyConflictDecisions(selection(), decisions).libraries).toEqual(['vitest']);
  });

  it.each([
    { name: 'the pair', answers: [{ type: 'cancel' as const }] },
    {
      name: 'which fragment to keep',
      answers: [{ type: 'select' as const, value: 'keep-one' }, { type: 'cancel' as const }],
    },
  ])('cancel at $name exits 130', async ({ answers }) => {
    const { prompter } = recordingPrompter(answers);
    const pending = promptConflicts(prompter, [{ a: 'vitest', b: 'zustand' }], await bundledRegistry());
    await expect(pending).rejects.toBeInstanceOf(AgentInitError);
    await expect(pending).rejects.toMatchObject({ exitCode: CANCELLED });
  });
});

describe('applyConflictDecisions', () => {
  it('rejects a keep id that is not in the pair', () => {
    expect(() =>
      applyConflictDecisions(selection(), [
        { a: 'vitest', b: 'zustand', choice: 'keep-one', keep: 'tailwind' },
      ]),
    ).toThrow(AgentInitError);
  });

  it('rejects dropping the only language', () => {
    expect(() =>
      applyConflictDecisions(selection(), [
        { a: 'flat', b: 'typescript', choice: 'keep-one', keep: 'flat' },
      ]),
    ).toThrow(/Cannot drop language "typescript"/);
  });
});
