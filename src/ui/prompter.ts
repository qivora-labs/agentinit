import {
  CANCEL_SYMBOL,
  confirm as clackConfirm,
  isCancel,
  multiselect as clackMultiselect,
  note as clackNote,
  select as clackSelect,
  spinner as clackSpinner,
  type Option,
} from '@clack/prompts';
import { CANCELLED } from '../exit-codes.js';
import { AgentInitError } from '../errors.js';

export interface PromptOption<Value> {
  value: Value;
  label: string;
  hint?: string;
  /**
   * Visual group from PRD §3.2. Clack has no option groups, so the adapter
   * prefixes this onto the label the user sees.
   */
  group?: string;
}

export interface PromptSpinner {
  start: (message?: string) => void;
  stop: (message?: string) => void;
  message: (message?: string) => void;
  error: (message?: string) => void;
  cancel: (message?: string) => void;
}

export interface SelectPrompt<Value> {
  message: string;
  options: readonly PromptOption<Value>[];
  initialValue?: Value;
}

export interface MultiSelectPrompt<Value> {
  message: string;
  options: readonly PromptOption<Value>[];
  initialValues?: readonly Value[];
  required?: boolean;
}

export interface ConfirmPrompt {
  message: string;
  initialValue?: boolean;
}

export interface Prompter {
  select: <Value>(prompt: SelectPrompt<Value>) => Promise<Value>;
  multiselect: <Value>(prompt: MultiSelectPrompt<Value>) => Promise<Value[]>;
  confirm: (prompt: ConfirmPrompt) => Promise<boolean>;
  note: (message?: string, title?: string) => void;
  spinner: () => PromptSpinner;
}

export type FakeAnswer =
  | { readonly type: 'select'; readonly value: unknown }
  | { readonly type: 'multiselect'; readonly value: readonly unknown[] }
  | { readonly type: 'confirm'; readonly value: boolean }
  | { readonly type: 'cancel' };

const CANCEL_MESSAGE = 'Cancelled.';

export function createClackPrompter(): Prompter {
  return {
    async select(prompt) {
      const result = await clackSelect({
        message: prompt.message,
        options: toClackOptions(prompt.options),
        ...(prompt.initialValue === undefined ? {} : { initialValue: prompt.initialValue }),
      });
      return unwrap(result);
    },
    async multiselect(prompt) {
      const result = await clackMultiselect({
        message: prompt.message,
        options: toClackOptions(prompt.options),
        ...(prompt.initialValues === undefined ? {} : { initialValues: [...prompt.initialValues] }),
        ...(prompt.required === undefined ? {} : { required: prompt.required }),
      });
      return unwrap(result);
    },
    async confirm(prompt) {
      const result = await clackConfirm({
        message: prompt.message,
        ...(prompt.initialValue === undefined ? {} : { initialValue: prompt.initialValue }),
      });
      return unwrap(result);
    },
    note(message, title) {
      clackNote(message, title);
    },
    spinner() {
      return clackSpinner();
    },
  };
}

/**
 * Answers are tagged by prompt type so a scripted confirm cannot be consumed
 * as a select. `{ type: 'cancel' }` maps to the same exit code as clack's `isCancel`.
 */
export function createFakePrompter(answers: readonly FakeAnswer[]): Prompter {
  const queue = [...answers];

  const take = (expected: 'select' | 'multiselect' | 'confirm'): unknown => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`No scripted answer left for ${expected}.`);
    }
    if (next.type === 'cancel') {
      throw cancelled();
    }
    if (next.type !== expected) {
      throw new Error(`Expected a scripted ${expected} answer, received ${next.type}.`);
    }
    return next.value;
  };

  return {
    select: <Value>() => asPromise(() => take('select') as Value),
    multiselect: <Value>() => asPromise(() => take('multiselect') as Value[]),
    confirm: () => asPromise(() => take('confirm') as boolean),
    note() {
      // Notes are not answers.
    },
    spinner() {
      return {
        start() {
          // Scripted prompts do not render a spinner.
        },
        stop() {
          // Scripted prompts do not render a spinner.
        },
        message() {
          // Scripted prompts do not render a spinner.
        },
        error() {
          // Scripted prompts do not render a spinner.
        },
        cancel() {
          // Scripted prompts do not render a spinner.
        },
      };
    },
  };
}

function toClackOptions<Value>(options: readonly PromptOption<Value>[]): Option<Value>[] {
  // Option<Value> is a conditional on primitive values, so a generic Value
  // cannot be checked against it under exactOptionalPropertyTypes.
  return options.map((option) => {
    const label = option.group === undefined ? option.label : `${option.group} · ${option.label}`;
    if (option.hint === undefined) {
      return { value: option.value, label };
    }
    return { value: option.value, label, hint: option.hint };
  }) as Option<Value>[];
}

// Scripted cancel throws immediately. The prompt methods still return a promise, like clack.
function asPromise<T>(read: () => T): Promise<T> {
  try {
    return Promise.resolve(read());
  } catch (error) {
    const reason = error instanceof Error ? error : new Error('Unexpected failure');
    return Promise.reject(reason);
  }
}

function unwrap<T>(result: T | typeof CANCEL_SYMBOL): T {
  if (isCancel(result)) throw cancelled();
  return result;
}

function cancelled(): AgentInitError {
  return new AgentInitError(CANCEL_MESSAGE, { exitCode: CANCELLED });
}
