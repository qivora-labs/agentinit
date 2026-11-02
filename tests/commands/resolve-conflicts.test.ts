import { describe, expect, it } from 'vitest';
import { resolveWithConflicts } from '../../src/commands/resolve-conflicts.js';
import type { Selection } from '../../src/registry/resolve.js';
import { recordingPrompter } from '../ui/recording-prompter.js';
import { registryOf, ruleFragment } from '../ui/stub-registry.js';

const registry = registryOf([
  ruleFragment('typescript', 'language'),
  ruleFragment('flat', 'architecture'),
  ruleFragment('vitest', 'library', 'conflictsWith:\n  - zustand\n'),
  ruleFragment('zustand', 'library'),
]);

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

function fragmentIds(ids: readonly { meta: { id: string } }[]): string[] {
  return ids.map((fragment) => fragment.meta.id);
}

describe('resolveWithConflicts', () => {
  it('asks once when the user keeps both fragments', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'keep-both' }]);
    const resolved = await resolveWithConflicts(
      registry,
      selection(),
      { packages: {}, files: [] },
      true,
      () => prompter,
    );

    expect(fragmentIds(resolved.fragments)).toEqual(['flat', 'typescript', 'vitest', 'zustand']);
    expect(calls.filter((call) => call.method === 'select')).toHaveLength(1);
  });

  it('drops the fragment the user does not keep', async () => {
    const { prompter } = recordingPrompter([
      { type: 'select', value: 'keep-one' },
      { type: 'select', value: 'vitest' },
    ]);
    const resolved = await resolveWithConflicts(
      registry,
      selection(),
      { packages: {}, files: [] },
      true,
      () => prompter,
    );

    expect(fragmentIds(resolved.fragments)).toEqual(['flat', 'typescript', 'vitest']);
    expect(resolved.conflicts).toEqual([]);
  });

  it('keeps both fragments without prompting when the run is not interactive', async () => {
    const { prompter, calls } = recordingPrompter([]);
    const resolved = await resolveWithConflicts(
      registry,
      selection(),
      { packages: {}, files: [] },
      false,
      () => prompter,
    );

    expect(fragmentIds(resolved.fragments)).toEqual(['flat', 'typescript', 'vitest', 'zustand']);
    expect(resolved.conflicts).toEqual([{ a: 'vitest', b: 'zustand' }]);
    expect(calls).toEqual([]);
  });
});
