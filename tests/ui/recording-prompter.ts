import { createFakePrompter, type FakeAnswer, type Prompter } from '../../src/ui/prompter.js';

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly group?: string;
}

export interface ChoicePrompt {
  readonly message: string;
  readonly options: readonly ChoiceOption[];
  readonly initialValue?: string;
  readonly initialValues?: readonly string[];
}

export interface RecordedConfirm {
  readonly message: string;
  readonly initialValue?: boolean;
}

export type RecordedCall =
  | { readonly method: 'select' | 'multiselect'; readonly prompt: unknown }
  | { readonly method: 'confirm'; readonly prompt: unknown }
  | { readonly method: 'note'; readonly message: string | undefined; readonly title: string | undefined };

export interface Recording {
  readonly prompter: Prompter;
  readonly calls: readonly RecordedCall[];
}

export function recordingPrompter(answers: readonly FakeAnswer[]): Recording {
  const inner = createFakePrompter(answers);
  const calls: RecordedCall[] = [];
  return {
    calls,
    prompter: {
      async select(prompt) {
        calls.push({ method: 'select', prompt });
        return inner.select(prompt);
      },
      async multiselect(prompt) {
        calls.push({ method: 'multiselect', prompt });
        return inner.multiselect(prompt);
      },
      async confirm(prompt) {
        calls.push({ method: 'confirm', prompt });
        return inner.confirm(prompt);
      },
      note(message, title) {
        calls.push({ method: 'note', message, title });
        inner.note(message, title);
      },
      spinner() {
        return inner.spinner();
      },
    },
  };
}

export function choicePrompt(call: RecordedCall | undefined): ChoicePrompt {
  if (call === undefined || (call.method !== 'select' && call.method !== 'multiselect')) {
    throw new Error('expected a choice prompt');
  }
  return call.prompt as ChoicePrompt;
}

export function confirmPrompt(call: RecordedCall | undefined): RecordedConfirm {
  if (call?.method !== 'confirm') throw new Error('expected a confirm prompt');
  return call.prompt as RecordedConfirm;
}
