import { describe, expect, it } from 'vitest';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { createFakePrompter, type FakeAnswer } from '../../src/ui/prompter.js';

const selectPrompt = {
  message: 'Pick one',
  options: [{ value: 'a', label: 'A' }],
};

const multiPrompt = {
  message: 'Pick many',
  options: [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ],
};

const confirmPrompt = { message: 'Continue?' };

describe('createFakePrompter', () => {
  it('returns scripted answers in order', async () => {
    const answers: FakeAnswer[] = [
      { type: 'select', value: 'vite' },
      { type: 'multiselect', value: ['vitest', 'playwright'] },
      { type: 'confirm', value: false },
    ];
    const prompter = createFakePrompter(answers);

    await expect(prompter.select(selectPrompt)).resolves.toBe('vite');
    await expect(prompter.multiselect(multiPrompt)).resolves.toEqual(['vitest', 'playwright']);
    await expect(prompter.confirm(confirmPrompt)).resolves.toBe(false);
  });

  it('throws the cancel error when scripted to cancel', async () => {
    const prompter = createFakePrompter([{ type: 'cancel' }]);
    const pending = prompter.confirm(confirmPrompt);
    await expect(pending).rejects.toBeInstanceOf(AgentInitError);
    await expect(pending).rejects.toMatchObject({
      message: 'Cancelled.',
      exitCode: CANCELLED,
    });
  });

  it('does not consume an answer for notes or the spinner', async () => {
    const prompter = createFakePrompter([{ type: 'confirm', value: true }]);
    prompter.note('hello', 'title');
    const spinner = prompter.spinner();
    spinner.start('working');
    spinner.message('still working');
    spinner.stop('done');
    await expect(prompter.confirm(confirmPrompt)).resolves.toBe(true);
  });
});
