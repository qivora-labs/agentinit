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
  readonly required?: boolean;
}

export interface RecordedConfirm {
  readonly message: string;
  readonly initialValue?: boolean;
}

export type RecordedCall =
  | { readonly method: 'select' | 'multiselect' | 'groupMultiselect'; readonly prompt: unknown }
  | { readonly method: 'confirm'; readonly prompt: unknown }
  | { readonly method: 'info'; readonly message: string }
  | { readonly method: 'note'; readonly message: string | undefined; readonly title: string | undefined }
  | { readonly method: 'diff'; readonly unified: string; readonly title: string | undefined };

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
      async groupMultiselect(prompt) {
        calls.push({ method: 'groupMultiselect', prompt });
        return inner.groupMultiselect(prompt);
      },
      async confirm(prompt) {
        calls.push({ method: 'confirm', prompt });
        return inner.confirm(prompt);
      },
      info(message) {
        calls.push({ method: 'info', message });
        inner.info(message);
      },
      note(message, title) {
        calls.push({ method: 'note', message, title });
        inner.note(message, title);
      },
      diff(unified, title) {
        calls.push({ method: 'diff', unified, title });
        inner.diff(unified, title);
      },
      spinner() {
        return inner.spinner();
      },
    },
  };
}

export function choicePrompt(call: RecordedCall | undefined): ChoicePrompt {
  if (
    call === undefined
    || (call.method !== 'select' && call.method !== 'multiselect' && call.method !== 'groupMultiselect')
  ) {
    throw new Error('expected a choice prompt');
  }
  return call.prompt as ChoicePrompt;
}

export function confirmPrompt(call: RecordedCall | undefined): RecordedConfirm {
  if (call?.method !== 'confirm') throw new Error('expected a confirm prompt');
  return call.prompt as RecordedConfirm;
}
