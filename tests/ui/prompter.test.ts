import { describe, expect, it } from 'vitest';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { stripAnsi } from '../../src/ui/align.js';
import {
  createFakePrompter,
  paintPromptMessage,
  toClackOptions,
  toGroupedOptions,
  toSelectOptions,
  type FakeAnswer,
} from '../../src/ui/prompter.js';

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

describe('toClackOptions', () => {
  it('leaves labels unprefixed and strips terminal controls', () => {
    expect(
      toClackOptions([
        { value: 'react-vite', label: 'React + Vite', hint: 'Vite', group: 'Web frontend' },
        { value: 'typescript', label: 'TypeScript' },
      ]),
    ).toEqual([
      { value: 'react-vite', label: 'React + Vite', hint: 'Vite' },
      { value: 'typescript', label: 'TypeScript' },
    ]);
  });

  it('strips terminal controls from the label and hint, and leaves the value unchanged', () => {
    expect(
      toClackOptions([{ value: 'a\u001b[31m', label: 'A\u001b[31m', hint: 'h\n', group: 'G\u001b[0m' }]),
    ).toEqual([{ value: 'a\u001b[31m', label: 'A', hint: 'h' }]);
  });
});

describe('toSelectOptions', () => {
  it('prefixes the first option of each group and pads the rest; drops Other on the sentinel', () => {
    const options = toSelectOptions([
      { value: 'react-vite', label: 'React + Vite', group: 'Web frontend' },
      { value: 'nextjs-app-router', label: 'Next.js App Router', group: 'Full-stack web' },
      { value: 'nextjs-pages-router', label: 'Next.js Pages Router', group: 'Full-stack web' },
      { value: 'other-typescript-project', label: 'Other TypeScript project', group: 'Other' },
    ]);
    expect(options.map((option) => stripAnsi(option.label ?? ''))).toEqual([
      'Web frontend · React + Vite',
      'Full-stack web · Next.js App Router',
      '                 Next.js Pages Router',
      'Other TypeScript project',
    ]);
  });
});

describe('toGroupedOptions', () => {
  it('groups options under sanitized headers', () => {
    expect(
      toGroupedOptions([
        { value: 'zustand', label: 'Zustand', hint: 'store', group: 'State & Data' },
        { value: 'vitest', label: 'Vitest', group: 'Testing' },
        { value: 'playwright', label: 'Playwright', group: 'Testing' },
      ]),
    ).toEqual({
      'State & Data': [{ value: 'zustand', label: 'Zustand', hint: 'store' }],
      Testing: [
        { value: 'vitest', label: 'Vitest' },
        { value: 'playwright', label: 'Playwright' },
      ],
    });
  });
});

describe('paintPromptMessage', () => {
  it('keeps the step prefix and AGENTS.md line after painting', () => {
    const painted = paintPromptMessage('2/5 Which agents?\nAGENTS.md is always written.');
    expect(stripAnsi(painted)).toBe('2/5 Which agents?\nAGENTS.md is always written.');
  });
});

describe('createFakePrompter', () => {
  it('returns scripted answers in order', async () => {
    const answers: FakeAnswer[] = [
      { type: 'select', value: 'vite' },
      { type: 'multiselect', value: ['vitest', 'playwright'] },
      { type: 'groupMultiselect', value: ['zustand'] },
      { type: 'confirm', value: false },
    ];
    const prompter = createFakePrompter(answers);

    await expect(prompter.select(selectPrompt)).resolves.toBe('vite');
    await expect(prompter.multiselect(multiPrompt)).resolves.toEqual(['vitest', 'playwright']);
    await expect(prompter.groupMultiselect(multiPrompt)).resolves.toEqual(['zustand']);
    await expect(prompter.confirm(confirmPrompt)).resolves.toBe(false);
  });

  it('throws the cancel error when scripted to cancel on groupMultiselect', async () => {
    const prompter = createFakePrompter([{ type: 'cancel' }]);
    const pending = prompter.groupMultiselect(multiPrompt);
    await expect(pending).rejects.toBeInstanceOf(AgentInitError);
    await expect(pending).rejects.toMatchObject({
      message: 'Cancelled.',
      exitCode: CANCELLED,
    });
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

  it('does not consume an answer for notes, info, or the spinner', async () => {
    const prompter = createFakePrompter([{ type: 'confirm', value: true }]);
    prompter.note('hello', 'title');
    prompter.info('intro');
    const spinner = prompter.spinner();
    spinner.start('working');
    spinner.message('still working');
    spinner.stop('done');
    await expect(prompter.confirm(confirmPrompt)).resolves.toBe(true);
  });
});
