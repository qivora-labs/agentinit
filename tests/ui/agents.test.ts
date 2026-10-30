import { describe, expect, it } from 'vitest';
import { AGENT_TARGETS } from '../../src/context.js';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { resolvedAgents, selectAgents } from '../../src/ui/agents.js';
import { choicePrompt, recordingPrompter } from './recording-prompter.js';

describe('resolvedAgents', () => {
  it('uses every agent when nothing is preselected', () => {
    expect(resolvedAgents([])).toEqual([...AGENT_TARGETS]);
  });

  it('keeps agents whose config already exists', () => {
    expect(resolvedAgents(['claude', 'windsurf'])).toEqual(['claude', 'windsurf']);
  });

  it('lets --agents replace preselection, including an empty list', () => {
    expect(resolvedAgents(['claude'], ['copilot'])).toEqual(['copilot']);
    expect(resolvedAgents(['claude'], [])).toEqual([]);
  });
});

describe('selectAgents', () => {
  it('preselects all four and shows the PRD labels', async () => {
    const { prompter, calls } = recordingPrompter([
      { type: 'multiselect', value: [...AGENT_TARGETS] },
    ]);
    const selected = await selectAgents(prompter, { preselected: [] });
    const prompt = choicePrompt(calls[0]);
    expect(selected).toEqual([...AGENT_TARGETS]);
    expect(prompt.initialValues).toEqual([...AGENT_TARGETS]);
    expect(prompt.options.map((option) => option.label)).toEqual([
      'Cursor',
      'Claude Code',
      'Windsurf',
      'GitHub Copilot',
    ]);
  });

  it('preselects only the detected agents', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'multiselect', value: ['windsurf'] }]);
    await selectAgents(prompter, { preselected: ['windsurf'] });
    expect(choicePrompt(calls[0]).initialValues).toEqual(['windsurf']);
  });

  it('skips the prompt when --agents is set', async () => {
    const { prompter, calls } = recordingPrompter([]);
    await expect(selectAgents(prompter, { preselected: ['cursor'], override: ['copilot'] })).resolves.toEqual([
      'copilot',
    ]);
    expect(calls).toEqual([]);
  });

  it('cancel exits 130', async () => {
    const { prompter } = recordingPrompter([{ type: 'cancel' }]);
    const pending = selectAgents(prompter, { preselected: [] });
    await expect(pending).rejects.toBeInstanceOf(AgentInitError);
    await expect(pending).rejects.toMatchObject({ exitCode: CANCELLED });
  });
});
