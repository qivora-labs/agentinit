import {
  CANCEL_SYMBOL,
  confirm as clackConfirm,
  groupMultiselect as clackGroupMultiselect,
  isCancel,
  log as clackLog,
  multiselect as clackMultiselect,
  note as clackNote,
  select as clackSelect,
  spinner as clackSpinner,
  type Option,
} from '@clack/prompts';
import pc from 'picocolors';
import { CANCELLED } from '../exit-codes.js';
import { AgentInitError } from '../errors.js';
import { sanitizeDisplayText, sanitizeMultilineDisplayText } from './display-text.js';

/** Same sentinel as `OTHER_TYPESCRIPT_PROJECT` in catalog.ts (avoid a cycle). */
const OTHER_TYPESCRIPT_PROJECT = 'other-typescript-project';

export interface PromptOption<Value> {
  value: Value;
  label: string;
  hint?: string;
  /**
   * Visual group from PRD §3.2. `groupMultiselect` uses this as a header;
   * single-select shows it as a gray prefix on the first option of each group.
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
  groupMultiselect: <Value>(prompt: MultiSelectPrompt<Value>) => Promise<Value[]>;
  confirm: (prompt: ConfirmPrompt) => Promise<boolean>;
  /** One rail line (Clack `log.info`), used for the greenfield intro. */
  info: (message: string) => void;
  note: (message?: string, title?: string) => void;
  spinner: () => PromptSpinner;
}

export type FakeAnswer =
  | { readonly type: 'select'; readonly value: unknown }
  | { readonly type: 'multiselect'; readonly value: readonly unknown[] }
  | { readonly type: 'groupMultiselect'; readonly value: readonly unknown[] }
  | { readonly type: 'confirm'; readonly value: boolean }
  | { readonly type: 'cancel' };

const CANCEL_MESSAGE = 'Cancelled.';
const GROUP_JOIN = ' · ';

export function createClackPrompter(): Prompter {
  return {
    async select(prompt) {
      const result = await clackSelect({
        message: paintPromptMessage(prompt.message),
        options: toSelectOptions(prompt.options),
        ...(prompt.initialValue === undefined ? {} : { initialValue: prompt.initialValue }),
      });
      return unwrap(result);
    },
    async multiselect(prompt) {
      const result = await clackMultiselect({
        message: paintPromptMessage(prompt.message),
        options: toClackOptions(prompt.options),
        ...(prompt.initialValues === undefined ? {} : { initialValues: [...prompt.initialValues] }),
        ...(prompt.required === undefined ? {} : { required: prompt.required }),
      });
      return unwrap(result);
    },
    async groupMultiselect(prompt) {
      const result = await clackGroupMultiselect({
        message: paintPromptMessage(prompt.message),
        options: toGroupedOptions(prompt.options),
        selectableGroups: false,
        ...(prompt.initialValues === undefined ? {} : { initialValues: [...prompt.initialValues] }),
        ...(prompt.required === undefined ? {} : { required: prompt.required }),
      });
      return unwrap(result);
    },
    async confirm(prompt) {
      const result = await clackConfirm({
        message: paintPromptMessage(prompt.message),
        ...(prompt.initialValue === undefined ? {} : { initialValue: prompt.initialValue }),
      });
      return unwrap(result);
    },
    info(message) {
      clackLog.info(sanitizeDisplayText(message));
    },
    note(message, title) {
      clackNote(
        message === undefined ? undefined : sanitizeMultilineDisplayText(message),
        title === undefined ? undefined : sanitizeDisplayText(title),
      );
    },
    spinner() {
      const spin = clackSpinner();
      return {
        start(message) {
          spin.start(shown(message));
        },
        stop(message) {
          spin.stop(shown(message));
        },
        message(message) {
          spin.message(shown(message));
        },
        error(message) {
          spin.error(shown(message));
        },
        cancel(message) {
          spin.cancel(shown(message));
        },
      };
    },
  };
}

/**
 * Answers are tagged by prompt type so a scripted confirm cannot be consumed
 * as a select. `{ type: 'cancel' }` maps to the same exit code as clack's `isCancel`.
 */
export function createFakePrompter(answers: readonly FakeAnswer[]): Prompter {
  const queue = [...answers];

  const take = (expected: 'select' | 'multiselect' | 'groupMultiselect' | 'confirm'): unknown => {
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
    groupMultiselect: <Value>() => asPromise(() => take('groupMultiselect') as Value[]),
    confirm: () => asPromise(() => take('confirm') as boolean),
    info() {
      // Scripted prompts do not print rail lines.
    },
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

/**
 * Flat options for plain multiselect. Groups are not prefixed here; use
 * {@link toSelectOptions} or {@link toGroupedOptions} when groups matter.
 */
export function toClackOptions<Value>(options: readonly PromptOption<Value>[]): Option<Value>[] {
  return options.map((option) => plainOption(option)) as Option<Value>[];
}

/**
 * Single-select list with a gray group prefix on the first option of each
 * group and padding so labels line up. "Other TypeScript project" has no prefix.
 */
export function toSelectOptions<Value>(options: readonly PromptOption<Value>[]): Option<Value>[] {
  const gray = pc.gray;
  let previousGroup: string | undefined;
  return options.map((option) => {
    const label = sanitizeDisplayText(option.label);
    const group = option.group === undefined ? undefined : sanitizeDisplayText(option.group);
    const showGroup =
      group !== undefined
      && group.length > 0
      && !(option.value === OTHER_TYPESCRIPT_PROJECT && group === 'Other');

    let visible = label;
    if (showGroup) {
      const firstOfGroup = previousGroup !== group;
      previousGroup = group;
      if (firstOfGroup) {
        visible = `${gray(group)}${GROUP_JOIN}${label}`;
      } else {
        visible = `${' '.repeat(group.length + GROUP_JOIN.length)}${label}`;
      }
    } else {
      previousGroup = group;
    }

    return withHint({ value: option.value, label: visible }, option.hint) as Option<Value>;
  });
}

/** Clack `groupMultiselect` options: each `group` becomes a header key. */
export function toGroupedOptions<Value>(
  options: readonly PromptOption<Value>[],
): Record<string, Option<Value>[]> {
  const grouped: Record<string, Option<Value>[]> = {};
  for (const option of options) {
    const group =
      option.group === undefined || sanitizeDisplayText(option.group).length === 0
        ? 'Other'
        : sanitizeDisplayText(option.group);
    const list = grouped[group] ?? [];
    list.push(plainOption(option) as Option<Value>);
    grouped[group] = list;
  }
  return grouped;
}

/**
 * Gray step prefix (`2/5`) and gray lines under the question (agent note).
 * Applied after sanitize so fragment text cannot inject styles.
 */
export function paintPromptMessage(message: string): string {
  const cleaned = sanitizeMultilineDisplayText(message);
  const lines = cleaned.split('\n');
  const first = lines[0] ?? '';
  const paintedFirst = paintStepPrefix(first);
  if (lines.length === 1) return paintedFirst;
  return [paintedFirst, ...lines.slice(1).map((line) => pc.gray(line))].join('\n');
}

function paintStepPrefix(message: string): string {
  const match = /^(\d+\/\d+)(\s)(.*)$/u.exec(message);
  if (match === null) return message;
  const prefix = match[1];
  const gap = match[2];
  const rest = match[3];
  if (prefix === undefined || gap === undefined || rest === undefined) return message;
  return `${pc.gray(prefix)}${gap}${rest}`;
}

function plainOption<Value>(option: PromptOption<Value>): {
  value: Value;
  label: string;
  hint?: string;
} {
  const label = sanitizeDisplayText(option.label);
  return withHint({ value: option.value, label }, option.hint);
}

function withHint<T extends { value: unknown; label: string }>(
  option: T,
  hint: string | undefined,
): T | (T & { hint: string }) {
  const cleaned = hint === undefined ? undefined : sanitizeDisplayText(hint);
  if (cleaned === undefined || cleaned.length === 0) return option;
  return { ...option, hint: cleaned };
}

function shown(message: string | undefined): string | undefined {
  return message === undefined ? undefined : sanitizeDisplayText(message);
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
