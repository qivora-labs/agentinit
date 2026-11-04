import { AgentInitError } from '../errors.js';
import { findPlaceholders, isKnownPlaceholder } from '../plan/placeholders.js';
import { getSections, type Fragment } from './parse.js';
import { PICKER_HINT_LIMIT } from './hint.js';

const LINE_LIMIT = 120;
const SUMMARY_LINE_LIMIT = 10;
const FRESHNESS_MONTHS = 6;
const HINT_CATEGORIES = new Set(['architecture', 'language', 'framework', 'library']);

const DIRECTIVE = /\b(?:ALWAYS|NEVER|PREFER|FORBID|DEFAULT)\b/u;
const PROHIBITION = /\b(?:NEVER|FORBID)\b/u;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const FRAGMENT_LINE = /^([^:\n]+\.md): (.*)$/u;

const WORKFLOW_SECTIONS = ['Purpose', 'Input', 'Steps', 'Output', 'Guardrails'] as const;

/**
 * Phrases that instruct an agent to fetch from the network, install packages,
 * read secrets, or move or rename files. Add a row to extend the check.
 * Patterns are not global; callers test one line at a time.
 *
 * `.env` includes `read`, `reads`, and `reading`. Move, rename, and `mv`
 * match the word `existing` or a path or filename within 80 characters.
 * A one-letter suffix (`e.g.`) is not a filename.
 */
export const FORBIDDEN_PHRASES: readonly { readonly phrase: string; readonly pattern: RegExp }[] = [
  { phrase: 'curl', pattern: /(?<![\w./-])curl(?![\w.-])/iu },
  { phrase: 'wget', pattern: /(?<![\w./-])wget(?![\w.-])/iu },
  { phrase: 'npm install', pattern: /\bnpm\s+install\b/iu },
  { phrase: 'pnpm add', pattern: /\bpnpm\s+add\b/iu },
  { phrase: 'yarn add', pattern: /\byarn\s+add\b/iu },
  { phrase: 'read .env', pattern: /\bread(?:s|ing)?\b[^\n]{0,80}\.env\b/iu },
  {
    phrase: 'move or rename existing files',
    pattern:
      /\b(?:move|rename|mv)\b[^\n]{0,80}?(?:\bexisting\b|\b[\w.-]+(?:\/[\w.-]+)+|\b[\w.-]+\.[A-Za-z]{2,8}\b)/iu,
  },
];

export type RegistryCheckSeverity = 'error' | 'warning';

export interface RegistryProblem {
  readonly path: string;
  readonly severity: RegistryCheckSeverity;
  readonly message: string;
}

/**
 * Content checks for fragments `loadRegistry` already accepted.
 * `today` is `YYYY-MM-DD` so freshness does not read the clock.
 */
export function checkFragments(fragments: readonly Fragment[], today: string): RegistryProblem[] {
  assertIsoDate(today, 'today');
  const problems: RegistryProblem[] = [];
  for (const fragment of fragments) {
    problems.push(...checkFragment(fragment, today));
  }
  return problems;
}

/** `loadRegistry` throws one message per line. Directory-level lines use path `.`. */
export function problemsFromLoadError(message: string): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  for (const raw of message.split('\n')) {
    const line = raw.replace(/\r$/u, '');
    if (line.length === 0) continue;
    const match = FRAGMENT_LINE.exec(line);
    const path = match?.[1];
    const detail = match?.[2];
    if (path !== undefined && detail !== undefined) {
      problems.push({ path, severity: 'error', message: detail });
      continue;
    }
    problems.push({ path: '.', severity: 'error', message: line });
  }
  return problems;
}

export function formatReport(problems: readonly RegistryProblem[]): string {
  const lines = problems.map((problem) => `${problem.path}: [${problem.severity}] ${problem.message}`);
  lines.push(summarize(problems));
  return `${lines.join('\n')}\n`;
}

export function reportStatus(problems: readonly RegistryProblem[]): 0 | 1 {
  return problems.some((problem) => problem.severity === 'error') ? 1 : 0;
}

function checkFragment(fragment: Fragment, today: string): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  const lineCount = countLines(fragment.body);
  if (lineCount > LINE_LIMIT) {
    problems.push(problem(fragment, 'error', `body is ${String(lineCount)} lines; the limit is ${String(LINE_LIMIT)}`));
  }

  if (fragment.meta.category === 'workflow') {
    problems.push(...workflowSectionProblems(fragment));
  } else {
    problems.push(...ruleProblems(fragment));
    if (fragment.meta.category === 'architecture') {
      problems.push(...architectureProblems(fragment));
    }
  }

  problems.push(...placeholderProblems(fragment));
  problems.push(...hintProblems(fragment));
  const freshness = freshnessProblem(fragment, today);
  if (freshness !== undefined) problems.push(freshness);
  problems.push(...forbiddenPhraseProblems(fragment));
  return problems;
}

/** Picker `hint` is display-only; warn when missing or longer than the Clack line budget. */
function hintProblems(fragment: Fragment): RegistryProblem[] {
  if (!HINT_CATEGORIES.has(fragment.meta.category)) return [];
  const hint = fragment.meta.hint;
  if (hint === undefined) {
    return [problem(fragment, 'warning', 'missing hint; the picker will truncate description')];
  }
  if (hint.length > PICKER_HINT_LIMIT) {
    return [
      problem(
        fragment,
        'warning',
        `hint is ${String(hint.length)} characters; the limit is ${String(PICKER_HINT_LIMIT)}`,
      ),
    ];
  }
  return [];
}

function ruleProblems(fragment: Fragment): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  if (!DIRECTIVE.test(fragment.body)) {
    problems.push(
      problem(fragment, 'error', 'missing a directive keyword (ALWAYS, NEVER, PREFER, FORBID, DEFAULT)'),
    );
  }
  if (!hasFencedCodeBlock(fragment.body)) {
    problems.push(problem(fragment, 'error', 'missing a fenced code block'));
  }
  return problems;
}

function architectureProblems(fragment: Fragment): RegistryProblem[] {
  const sections = getSections(fragment.body);
  const problems: RegistryProblem[] = [];
  const summary = sections.get('Summary');
  if (summary === undefined) {
    problems.push(problem(fragment, 'error', 'missing "## Summary" section'));
  } else {
    const nonEmpty = summary.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
    if (nonEmpty > SUMMARY_LINE_LIMIT) {
      problems.push(
        problem(
          fragment,
          'error',
          `## Summary is ${String(nonEmpty)} non-empty lines; the limit is ${String(SUMMARY_LINE_LIMIT)}`,
        ),
      );
    }
  }
  if (!sections.has('Map')) {
    problems.push(problem(fragment, 'error', 'missing "## Map" section'));
  }
  return problems;
}

function workflowSectionProblems(fragment: Fragment): RegistryProblem[] {
  const sections = getSections(fragment.body);
  const problems: RegistryProblem[] = [];
  for (const name of WORKFLOW_SECTIONS) {
    if (!sections.has(name)) {
      problems.push(problem(fragment, 'error', `missing "## ${name}" section`));
    }
  }
  return problems;
}

function placeholderProblems(fragment: Fragment): RegistryProblem[] {
  const names = findPlaceholders(fragment.body);
  if (fragment.meta.category !== 'workflow') {
    for (const glob of fragment.meta.globs ?? []) names.push(...findPlaceholders(glob));
  }
  const problems: RegistryProblem[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (isKnownPlaceholder(name) || seen.has(name)) continue;
    seen.add(name);
    problems.push(problem(fragment, 'error', `unknown placeholder "{{${name}}}"`));
  }
  return problems;
}

function freshnessProblem(fragment: Fragment, today: string): RegistryProblem | undefined {
  const verifiedAt = fragment.meta.verifiedAt;
  if (addCalendarMonths(verifiedAt, FRESHNESS_MONTHS) < today) {
    return problem(fragment, 'warning', `verifiedAt ${verifiedAt} is older than 6 months`);
  }
  return undefined;
}

/**
 * A fenced block is skipped only when it is clearly an anti-pattern and does
 * not also show the good example. Mixed or unmarked blocks are scanned.
 * A NEVER or FORBID on the same line is a prohibition, not an instruction.
 */
function forbiddenPhraseProblems(fragment: Fragment): RegistryProblem[] {
  const text = scannableText(fragment.body);
  const problems: RegistryProblem[] = [];
  for (const { phrase, pattern } of FORBIDDEN_PHRASES) {
    if (lineMatches(text, pattern)) {
      problems.push(problem(fragment, 'error', `forbidden phrase "${phrase}"`));
    }
  }
  return problems;
}

function lineMatches(text: string, pattern: RegExp): boolean {
  for (const line of text.split(/\r?\n/u)) {
    if (PROHIBITION.test(line)) continue;
    if (pattern.test(line)) return true;
  }
  return false;
}

function scannableText(body: string): string {
  const lines = body.split(/\r?\n/u);
  const kept: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const open = openingFence(line);
    if (open === null) {
      kept.push(line);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < lines.length && !isClosingFence(lines[end] ?? '', open)) end += 1;
    const closed = end < lines.length;
    const block = lines.slice(index, closed ? end + 1 : lines.length);
    if (closed && isClearlyAntiPatternBlock(lines, index, open.info, block)) {
      index = end + 1;
      continue;
    }
    kept.push(...block);
    index = closed ? end + 1 : lines.length;
  }
  return kept.join('\n');
}

function isClearlyAntiPatternBlock(
  lines: readonly string[],
  fenceIndex: number,
  info: string,
  block: readonly string[],
): boolean {
  const content = block.slice(1, -1).join('\n');
  const previous = precedingNonEmpty(lines, fenceIndex);
  if (hasGoodMarker(info) || hasGoodMarker(previous) || hasGoodMarker(content)) return false;
  if (mentionsAntiPattern(info) || startsWithAntiPattern(previous)) return true;
  return startsWithAntiPattern(firstNonEmpty(content));
}

function precedingNonEmpty(lines: readonly string[], index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor]?.trim() ?? '';
    if (line.length > 0) return line;
  }
  return '';
}

function firstNonEmpty(text: string): string {
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim().length > 0) return line;
  }
  return '';
}

function hasGoodMarker(text: string): boolean {
  return text.includes('✅') || /\bgood\b/iu.test(text);
}

function mentionsAntiPattern(text: string): boolean {
  return /\banti[-\s]?pattern\b/iu.test(text);
}

function startsWithAntiPattern(text: string): boolean {
  const stripped = text.trim().replace(/^[^A-Za-z]+/u, '');
  return /^anti[-\s]?pattern\b/iu.test(stripped);
}

function hasFencedCodeBlock(body: string): boolean {
  const lines = body.split(/\r?\n/u);
  let open: { char: '`' | '~'; length: number } | null = null;
  for (const line of lines) {
    if (open === null) {
      const marker = openingFence(line);
      if (marker !== null) open = marker;
      continue;
    }
    if (isClosingFence(line, open)) return true;
  }
  return false;
}

function openingFence(line: string): { char: '`' | '~'; length: number; info: string } | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  const marker = match?.[1];
  if (marker === undefined) return null;
  const info = (match?.[2] ?? '').trim();
  if (marker.startsWith('`')) {
    if (info.includes('`')) return null;
    return { char: '`', length: marker.length, info };
  }
  return { char: '~', length: marker.length, info };
}

function isClosingFence(line: string, open: { char: '`' | '~'; length: number }): boolean {
  const pattern = open.char === '`' ? /^ {0,3}(`+)\s*$/u : /^ {0,3}(~+)\s*$/u;
  const marker = pattern.exec(line)?.[1];
  return marker !== undefined && marker.length >= open.length;
}

function countLines(body: string): number {
  if (body.length === 0) return 0;
  return body.split(/\r?\n/u).length;
}

/**
 * Calendar months, clamped to the last day of the target month.
 * The result is older than `months` when it is strictly before `today`.
 */
function addCalendarMonths(isoDate: string, months: number): string {
  const year = Number(isoDate.slice(0, 4));
  const monthIndex = Number(isoDate.slice(5, 7)) - 1;
  const day = Number(isoDate.slice(8, 10));
  const target = new Date(Date.UTC(year, monthIndex + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  const month = String(targetMonth + 1).padStart(2, '0');
  const date = String(targetDay).padStart(2, '0');
  return `${String(targetYear).padStart(4, '0')}-${month}-${date}`;
}

function assertIsoDate(value: string, label: string): void {
  const match = ISO_DATE.exec(value);
  if (match === null) throw new AgentInitError(`${label} must be YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AgentInitError(`${label} must be YYYY-MM-DD.`);
  }
}

function problem(fragment: Fragment, severity: RegistryCheckSeverity, message: string): RegistryProblem {
  return { path: fragment.sourcePath, severity, message };
}

function summarize(problems: readonly RegistryProblem[]): string {
  let errors = 0;
  let warnings = 0;
  for (const item of problems) {
    if (item.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return `${countLabel(errors, 'error')}, ${countLabel(warnings, 'warning')}`;
}

function countLabel(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
