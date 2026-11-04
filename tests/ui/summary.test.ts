import { describe, expect, it } from 'vitest';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import type { ProjectDraft } from '../../src/detect/index.js';
import { NO_FRAMEWORK_NOTICE, NO_FRAMEWORK_SUMMARY, formatSummary } from '../../src/ui/format.js';
import { changeExistingSetup, confirmDetected } from '../../src/ui/summary.js';
import type { FakeAnswer } from '../../src/ui/prompter.js';
import { choicePrompt, recordingPrompter, type RecordedCall } from './recording-prompter.js';
import { sampleDraft } from './draft.js';

let registry: Registry | undefined;

async function bundledRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

function choiceCalls(calls: readonly RecordedCall[], method: 'select' | 'multiselect'): RecordedCall[] {
  return calls.filter((call) => call.method === method);
}

describe('confirmDetected', () => {
  it('returns the draft unchanged when the user accepts it', async () => {
    const draft = sampleDraft();
    const bundled = await bundledRegistry();
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'multiselect', value: ['cursor', 'windsurf'] },
    ]);

    const result = await confirmDetected(prompter, draft, bundled);

    expect(result.selection).toEqual({
      language: draft.language,
      architecture: draft.architecture.id,
      frameworks: [...draft.frameworks],
      libraries: [...draft.libraries],
      origin: {
        'typescript-strict': 'detected',
        'feature-based': 'detected',
        'nextjs-app-router': 'detected',
        vitest: 'detected',
      },
    });
    expect(result.agents).toEqual(['cursor', 'windsurf']);
    expect(calls[0]).toMatchObject({
      method: 'note',
      title: 'Detected project',
      message: formatSummary({ draft, registry: bundled, notices: [], warnings: [] }),
    });
    expect(choiceCalls(calls, 'select')).toHaveLength(1);
  });

  it('applies customize answers', async () => {
    const draft = sampleDraft();
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'customize' },
      { type: 'select', value: 'typescript' },
      { type: 'multiselect', value: ['express'] },
      { type: 'multiselect', value: ['playwright'] },
      { type: 'select', value: 'flat' },
      { type: 'multiselect', value: ['claude'] },
    ]);

    const result = await confirmDetected(prompter, draft, await bundledRegistry());
    const frameworks = calls.find(
      (call) => call.method === 'multiselect' && choicePrompt(call).message.includes('frameworks'),
    );
    const libraries = calls.find(
      (call) => call.method === 'multiselect' && choicePrompt(call).message.includes('libraries'),
    );

    expect(result.selection).toEqual({
      language: 'typescript',
      architecture: 'flat',
      frameworks: ['express'],
      libraries: ['playwright'],
      origin: {
        typescript: 'manual',
        flat: 'manual',
        express: 'manual',
        playwright: 'manual',
      },
    });
    expect(result.agents).toEqual(['claude']);
    expect(choicePrompt(frameworks).required).toBe(false);
    expect(choicePrompt(libraries).required).toBe(false);
    expect(choicePrompt(libraries).options.map((option) => option.value)).toEqual([
      'vitest',
      'playwright',
    ]);
  });

  it('asks for architecture when confidence is low even if the user accepts the rest', async () => {
    const draft = sampleDraft({ architecture: { id: 'feature-based', confidence: 0.5 } });
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'select', value: 'layered' },
      { type: 'multiselect', value: ['cursor'] },
    ]);

    const result = await confirmDetected(prompter, draft, await bundledRegistry());
    const architecture = choiceCalls(calls, 'select')[1];

    expect(result.selection.architecture).toBe('layered');
    expect(result.selection.language).toBe(draft.language);
    expect(result.selection.frameworks).toEqual(draft.frameworks);
    expect(result.selection.libraries).toEqual(draft.libraries);
    expect(result.selection.origin.layered).toBe('manual');
    expect(result.selection.origin['feature-based']).toBeUndefined();
    expect(choicePrompt(architecture).initialValue).toBe('flat');
    expect(choicePrompt(architecture).message).toBe(
      'Architecture confidence is 0.5, below 0.7. Which architecture should we use?',
    );
  });

  it('shows Framework: none detected for a project without a framework', async () => {
    const draft = sampleDraft({
      frameworks: [],
      libraries: ['vitest'],
      packages: { typescript: '5.9.2' },
    });
    const bundled = await bundledRegistry();
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'multiselect', value: ['cursor'] },
    ]);

    await confirmDetected(prompter, draft, bundled);
    const note = calls[0];
    if (note?.method !== 'note') throw new Error('expected a summary note');
    expect(note.message).toContain(NO_FRAMEWORK_SUMMARY);
    expect(note.message).toContain(NO_FRAMEWORK_NOTICE);
    expect(note.message).toBe(formatSummary({
      draft,
      registry: bundled,
      notices: [],
      warnings: [],
    }));
  });

  it('does not add a second architecture prompt when customizing a low-confidence project', async () => {
    const draft = sampleDraft({ architecture: { id: 'feature-based', confidence: 0.25 } });
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'customize' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'multiselect', value: ['nextjs-app-router'] },
      { type: 'multiselect', value: ['vitest'] },
      { type: 'select', value: 'flat' },
      { type: 'multiselect', value: ['cursor'] },
    ]);

    const result = await confirmDetected(prompter, draft, await bundledRegistry());
    const architecture = choiceCalls(calls, 'select').at(-1);

    expect(result.selection.architecture).toBe('flat');
    expect(choiceCalls(calls, 'select')).toHaveLength(3);
    expect(choicePrompt(architecture).message).toBe('Which architecture should we follow?');
    expect(choicePrompt(architecture).initialValue).toBe('flat');
  });

  it('appends detection notices to a re-run summary', async () => {
    const draft = sampleDraft();
    const bundled = await bundledRegistry();
    const { prompter, calls } = recordingPrompter([{ type: 'select', value: 'use' }]);

    await confirmDetected(prompter, draft, bundled, {
      summary: 'No package changes since the last run.',
      title: 'What changed',
      agents: ['cursor'],
      notices: [
        { kind: 'unsupported-version', package: 'tailwindcss', version: '3.4.0', fragmentId: 'tailwind' },
      ],
      warnings: [{ kind: 'legacy-agent-file', path: '.cursorrules' }],
    });

    const note = calls[0];
    expect(note).toMatchObject({ method: 'note', title: 'What changed' });
    if (note?.method !== 'note') throw new Error('expected a summary note');
    expect(note.message).toContain('No package changes since the last run.');
    expect(note.message).toContain('tailwindcss@3.4.0 detected — no matching rules yet.');
    expect(note.message).toContain('.cursorrules still loads alongside the new rules and will not be modified.');
    expect(note.message).not.toContain('Package manager:');
  });

  it('preselects detected agents and lets --agents skip the prompt', async () => {
    const draft = sampleDraft({ suggestedAgents: ['claude'] });
    const detected = recordingPrompter([
      { type: 'select', value: 'use' },
      { type: 'multiselect', value: ['claude'] },
    ]);
    await confirmDetected(detected.prompter, draft, await bundledRegistry());
    expect(choicePrompt(choiceCalls(detected.calls, 'multiselect')[0]).initialValues).toEqual(['claude']);

    const overridden = recordingPrompter([{ type: 'select', value: 'use' }]);
    const result = await confirmDetected(overridden.prompter, draft, await bundledRegistry(), {
      agents: ['copilot'],
    });
    expect(result.agents).toEqual(['copilot']);
    expect(choiceCalls(overridden.calls, 'multiselect')).toHaveLength(0);
  });

  it.each([
    { name: 'configuration', answers: [{ type: 'cancel' }] },
    {
      name: 'low-confidence architecture',
      draft: sampleDraft({ architecture: { id: 'feature-based', confidence: 0.5 } }),
      answers: [{ type: 'select', value: 'use' }, { type: 'cancel' }],
    },
    {
      name: 'agents',
      answers: [{ type: 'select', value: 'use' }, { type: 'cancel' }],
    },
  ] satisfies { name: string; answers: FakeAnswer[]; draft?: ProjectDraft }[])(
    'cancel at the $name prompt exits 130',
    async ({ answers, draft }) => {
      const { prompter } = recordingPrompter(answers);
      const pending = confirmDetected(prompter, draft ?? sampleDraft(), await bundledRegistry());
      await expect(pending).rejects.toBeInstanceOf(AgentInitError);
      await expect(pending).rejects.toMatchObject({ exitCode: CANCELLED });
    },
  );
});

describe('changeExistingSetup', () => {
  it('preselects the current answers and skips the use-or-customize card', async () => {
    const draft = sampleDraft({ libraries: ['vitest', 'zustand'] });
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'typescript' },
      { type: 'multiselect', value: ['nextjs-app-router'] },
      { type: 'multiselect', value: ['vitest'] },
      { type: 'select', value: 'layered' },
      { type: 'multiselect', value: ['claude'] },
    ]);

    const result = await changeExistingSetup(prompter, draft, await bundledRegistry(), {
      selection: {
        language: 'typescript-strict',
        architecture: 'feature-based',
        frameworks: ['nextjs-app-router'],
        libraries: ['vitest', 'zustand'],
        origin: {},
      },
      agents: ['cursor'],
    });

    expect(calls.some((call) => call.method === 'note')).toBe(false);
    expect(choicePrompt(choiceCalls(calls, 'select')[0]).initialValue).toBe('typescript-strict');
    expect(choicePrompt(choiceCalls(calls, 'multiselect')[1]).initialValues).toEqual(['vitest', 'zustand']);
    expect(choicePrompt(choiceCalls(calls, 'multiselect')[2]).initialValues).toEqual(['cursor']);
    expect(result.selection.libraries).toEqual(['vitest']);
    expect(result.agents).toEqual(['claude']);
  });
});
