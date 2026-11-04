import { describe, expect, it } from 'vitest';
import { AGENT_TARGETS } from '../../src/context.js';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import { OTHER_TYPESCRIPT_PROJECT } from '../../src/ui/catalog.js';
import { runGreenfieldWizard } from '../../src/ui/wizard.js';
import type { FakeAnswer } from '../../src/ui/prompter.js';
import { choicePrompt, recordingPrompter } from './recording-prompter.js';
import { registryOf, ruleFragment } from './stub-registry.js';

let registry: Registry | undefined;

async function bundledRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

const WIZARD_KINDS = ['select', 'select', 'groupMultiselect', 'select', 'multiselect'] as const;
const SELECT_VALUES = ['react-vite', 'typescript-strict', 'feature-based'] as const;

function fillers(count: number): FakeAnswer[] {
  let selects = 0;
  const answers: FakeAnswer[] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = WIZARD_KINDS[index];
    if (kind === 'groupMultiselect') {
      answers.push({ type: 'groupMultiselect', value: ['vitest'] });
      continue;
    }
    if (kind === 'multiselect') {
      answers.push({ type: 'multiselect', value: ['vitest'] });
      continue;
    }
    answers.push({ type: 'select', value: SELECT_VALUES[selects] ?? 'react-vite' });
    selects += 1;
  }
  return answers;
}

describe('runGreenfieldWizard', () => {
  it('returns the scripted selection and offers compatible libraries', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'react-vite' },
      { type: 'select', value: 'typescript-strict' },
      { type: 'groupMultiselect', value: ['zustand', 'vitest'] },
      { type: 'select', value: 'feature-based' },
      { type: 'multiselect', value: ['cursor', 'claude'] },
    ]);

    const result = await runGreenfieldWizard(prompter, await bundledRegistry());

    expect(result.selection).toEqual({
      language: 'typescript-strict',
      architecture: 'feature-based',
      frameworks: ['react-vite'],
      libraries: ['zustand', 'vitest'],
      origin: {
        'typescript-strict': 'manual',
        'feature-based': 'manual',
        'react-vite': 'manual',
        zustand: 'manual',
        vitest: 'manual',
      },
    });
    expect(result.agents).toEqual(['cursor', 'claude']);

    expect(calls.find((call) => call.method === 'info')).toEqual({
      method: 'info',
      message: 'No package.json found. Setting up a new project.',
    });
    const selects = calls.filter((call) => call.method === 'select');
    const groups = calls.filter((call) => call.method === 'groupMultiselect');
    const multis = calls.filter((call) => call.method === 'multiselect');
    expect(choicePrompt(selects[0]).message).toBe('1/5 Which framework are you using?');
    expect(choicePrompt(selects[1]).message).toBe('2/5 How strict should TypeScript be?');
    expect(choicePrompt(selects[1]).initialValue).toBe('typescript-strict');
    expect(choicePrompt(groups[0]).message).toBe('3/5 Which libraries should we include?');
    expect(choicePrompt(selects[2]).message).toBe('4/5 Which architecture should we follow?');
    expect(choicePrompt(selects[2]).initialValue).toBe('feature-based');
    expect(choicePrompt(groups[0]).required).toBe(false);
    expect(choicePrompt(groups[0]).options.map((option) => option.value)).toEqual([
      'zustand',
      'tanstack-query',
      'tailwind',
      'shadcn',
      'react-hook-form-zod',
      'vitest',
      'playwright',
    ]);
    expect(choicePrompt(multis[0]).message).toBe(
      '5/5 Which agents should we generate rules for?\nAGENTS.md is always written.',
    );
    expect(choicePrompt(multis[0]).initialValues).toEqual([...AGENT_TARGETS]);
  });

  it('maps Other TypeScript project to no frameworks and only agnostic libraries', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: OTHER_TYPESCRIPT_PROJECT },
      { type: 'select', value: 'typescript' },
      { type: 'groupMultiselect', value: ['vitest', 'playwright'] },
      { type: 'select', value: 'flat' },
      { type: 'multiselect', value: [...AGENT_TARGETS] },
    ]);

    const result = await runGreenfieldWizard(prompter, await bundledRegistry());
    const libraries = calls.find((call) => call.method === 'groupMultiselect');

    expect(result.selection.frameworks).toEqual([]);
    expect(result.selection.libraries).toEqual(['vitest', 'playwright']);
    expect(choicePrompt(libraries).options.map((option) => option.value)).toEqual([
      'vitest',
      'playwright',
    ]);
  });

  it('skips the library prompt when every library is incompatible', async () => {
    const stub = registryOf([
      ruleFragment('typescript-strict', 'language'),
      ruleFragment('feature-based', 'architecture'),
      ruleFragment('zustand', 'library', 'compatibleWith:\n  - react-vite\n'),
    ]);
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: OTHER_TYPESCRIPT_PROJECT },
      { type: 'select', value: 'typescript-strict' },
      { type: 'select', value: 'feature-based' },
      { type: 'multiselect', value: ['cursor'] },
    ]);

    const result = await runGreenfieldWizard(prompter, stub);

    expect(result.selection.frameworks).toEqual([]);
    expect(result.selection.libraries).toEqual([]);
    expect(calls.filter((call) => call.method === 'groupMultiselect')).toHaveLength(0);
    expect(calls.filter((call) => call.method === 'multiselect')).toHaveLength(1);
    expect(choicePrompt(calls.find((call) => call.method === 'select')).message).toMatch(/^1\/4 /);
    expect(choicePrompt(calls.find((call) => call.method === 'multiselect')).message).toMatch(
      /^4\/4 /,
    );
  });

  it('starts later prompts from a saved selection; agents override skips the prompt', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'fastify' },
      { type: 'select', value: 'typescript' },
      { type: 'groupMultiselect', value: ['vitest'] },
      { type: 'select', value: 'layered' },
    ]);

    const result = await runGreenfieldWizard(prompter, await bundledRegistry(), {
      agents: ['claude'],
      initial: {
        language: 'typescript',
        architecture: 'layered',
        frameworks: ['fastify'],
        libraries: ['vitest'],
        agents: ['claude'],
      },
    });

    const selects = calls.filter((call) => call.method === 'select');
    const groups = calls.filter((call) => call.method === 'groupMultiselect');
    expect(result.agents).toEqual(['claude']);
    expect(choicePrompt(selects[0]).message).toBe('1/4 Which framework are you using?');
    expect(choicePrompt(selects[0]).initialValue).toBe('fastify');
    expect(choicePrompt(selects[1]).initialValue).toBe('typescript');
    expect(choicePrompt(selects[2]).initialValue).toBe('layered');
    expect(choicePrompt(groups[0]).initialValues).toEqual(['vitest']);
    expect(groups).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'multiselect')).toHaveLength(0);
  });

  it('preselects saved agents without skipping the prompt', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'fastify' },
      { type: 'select', value: 'typescript' },
      { type: 'groupMultiselect', value: ['vitest'] },
      { type: 'select', value: 'layered' },
      { type: 'multiselect', value: ['windsurf'] },
    ]);

    const result = await runGreenfieldWizard(prompter, await bundledRegistry(), {
      initial: {
        language: 'typescript',
        architecture: 'layered',
        frameworks: ['fastify'],
        libraries: ['vitest'],
        agents: ['claude'],
      },
    });

    const multis = calls.filter((call) => call.method === 'multiselect');
    expect(result.agents).toEqual(['windsurf']);
    expect(multis).toHaveLength(1);
    expect(choicePrompt(multis[0]).initialValues).toEqual(['claude']);
  });

  it('lets --agents replace a saved agent list without asking', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'fastify' },
      { type: 'select', value: 'typescript' },
      { type: 'groupMultiselect', value: [] },
      { type: 'select', value: 'layered' },
    ]);

    const result = await runGreenfieldWizard(prompter, await bundledRegistry(), {
      agents: ['copilot'],
      initial: { agents: ['claude'] },
    });

    expect(result.agents).toEqual(['copilot']);
    expect(calls.filter((call) => call.method === 'groupMultiselect')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'multiselect')).toHaveLength(0);
  });

  it('uses --agents and does not ask', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'select', value: 'express' },
      { type: 'select', value: 'typescript' },
      { type: 'groupMultiselect', value: [] },
      { type: 'select', value: 'layered' },
    ]);

    const result = await runGreenfieldWizard(prompter, await bundledRegistry(), {
      agents: ['copilot'],
    });

    expect(result.agents).toEqual(['copilot']);
    expect(calls.filter((call) => call.method === 'groupMultiselect')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'multiselect')).toHaveLength(0);
  });

  it.each([0, 1, 2, 3, 4])('cancel at prompt %i exits 130', async (index) => {
    const { prompter } = recordingPrompter([...fillers(index), { type: 'cancel' }]);
    const pending = runGreenfieldWizard(prompter, await bundledRegistry());
    await expect(pending).rejects.toBeInstanceOf(AgentInitError);
    await expect(pending).rejects.toMatchObject({ exitCode: CANCELLED });
  });
});
