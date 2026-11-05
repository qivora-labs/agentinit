import { parse as parseYaml } from 'yaml';
import type { ZodError } from 'zod';
import { AgentInitError } from '../errors.js';
import { fragmentMetaSchema, type Fragment } from './schema.js';

const OPENING_FENCE = /^---\r?\n/;
const FRONTMATTER = /^(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)([\s\S]*)$/;
const SECTION_HEADING = /^## (?!#)(.*)$/;
const CODE_FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

export type { Fragment, FragmentMeta, RuleFragmentMeta, WorkflowFragmentMeta } from './schema.js';

/**
 * `##` headings inside a fence stay in the parent section. Duplicate headings
 * keep the later body.
 */
export function getSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let heading: string | undefined;
  let lines: string[] = [];
  let inFence = false;

  const flush = (): void => {
    if (heading === undefined) {
      return;
    }
    sections.set(heading, lines.join('\n').trim());
  };

  for (const line of body.split(/\r?\n/)) {
    if (CODE_FENCE.test(line)) {
      inFence = !inFence;
      if (heading !== undefined) {
        lines.push(line);
      }
      continue;
    }
    if (!inFence) {
      const match = SECTION_HEADING.exec(line);
      if (match !== null) {
        const title = (match[1] ?? '').trim();
        if (title.length > 0) {
          flush();
          heading = title;
          lines = [];
          continue;
        }
      }
    }
    if (heading !== undefined) {
      lines.push(line);
    }
  }

  flush();
  return sections;
}

/**
 * Drop a `##` section (heading and body). Headings inside fences stay. Other
 * sections and any preamble keep their relative order.
 */
export function omitSection(body: string, title: string): string {
  const kept: string[] = [];
  let skipping = false;
  let inFence = false;

  for (const line of body.split(/\r?\n/u)) {
    if (CODE_FENCE.test(line)) {
      inFence = !inFence;
      if (!skipping) kept.push(line);
      continue;
    }
    if (!inFence) {
      const match = SECTION_HEADING.exec(line);
      if (match !== null) {
        const name = (match[1] ?? '').trim();
        if (name.length > 0) {
          skipping = name === title;
          if (!skipping) kept.push(line);
          continue;
        }
      }
    }
    if (!skipping) kept.push(line);
  }

  return kept.join('\n').trim();
}

export function parseFragment(text: string, sourcePath: string): Fragment {
  const normalized = text.replace(/^\uFEFF/, '');
  const split = splitFrontmatter(normalized, sourcePath);
  const data = readFrontmatter(split.raw, sourcePath);
  const result = fragmentMetaSchema.safeParse(data);
  if (!result.success) {
    throw new AgentInitError(formatIssues(sourcePath, result.error));
  }
  return { meta: result.data, body: split.body, sourcePath };
}

function splitFrontmatter(text: string, sourcePath: string): { raw: string; body: string } {
  if (!text.startsWith('---')) {
    throw new AgentInitError(`${sourcePath}: missing frontmatter block`);
  }
  const opening = OPENING_FENCE.exec(text);
  if (opening === null) {
    throw new AgentInitError(`${sourcePath}: unterminated frontmatter block`);
  }
  // An empty block is `---\n---`, so the closer is the first line of the
  // remainder. A non-empty block has YAML, a newline, then the closer.
  const match = FRONTMATTER.exec(text.slice(opening[0].length));
  if (match === null) {
    throw new AgentInitError(`${sourcePath}: unterminated frontmatter block`);
  }
  return {
    raw: match[1] ?? '',
    body: (match[2] ?? '').trim(),
  };
}

function readFrontmatter(raw: string, sourcePath: string): unknown {
  if (raw.trim().length === 0) {
    return {};
  }
  let data: unknown;
  try {
    data = parseYaml(raw) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? (error.message.split('\n')[0] ?? 'invalid YAML') : 'invalid YAML';
    throw new AgentInitError(`${sourcePath}: frontmatter: ${detail}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AgentInitError(`${sourcePath}: frontmatter must be a mapping`);
  }
  return data;
}

function formatIssues(sourcePath: string, error: ZodError): string {
  const lines: string[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        lines.push(formatIssueLine(sourcePath, [...issue.path, key], 'unknown key'));
      }
      continue;
    }
    lines.push(formatIssueLine(sourcePath, issue.path, issue.message));
  }
  return lines.length > 0 ? lines.join('\n') : `${sourcePath}: invalid frontmatter`;
}

function formatIssueLine(sourcePath: string, path: readonly PropertyKey[], message: string): string {
  const formatted = formatPath(path);
  const detail = formatted.length > 0 ? `${formatted}: ${message}` : message;
  return `${sourcePath}: ${detail}`;
}

function formatPath(path: readonly PropertyKey[]): string {
  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formatted += `[${String(segment)}]`;
      continue;
    }
    if (typeof segment !== 'string') {
      continue;
    }
    formatted = formatted.length === 0 ? segment : `${formatted}.${segment}`;
  }
  return formatted;
}
