import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const EXPECTED_FORMS = {
  'bug.yml': 'bug',
  'wrong-rule.yml': 'wrong-rule',
  'fragment-request.yml': 'coverage',
  'data-loss.yml': 'data-loss',
} as const satisfies Record<string, string>;

const templateDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'ISSUE_TEMPLATE',
);

interface IssueForm {
  name?: unknown;
  description?: unknown;
  labels?: unknown;
  body?: unknown;
}

interface FormField {
  id?: unknown;
}

describe('issue templates', () => {
  it('parses every form with name, description, body, unique field ids, and allowed labels only', async () => {
    const entries = await readdir(templateDir);
    const formFiles = entries
      .filter((name) => name.endsWith('.yml') && name !== 'config.yml')
      .sort();
    expect(formFiles).toEqual(Object.keys(EXPECTED_FORMS).sort());

    for (const file of formFiles) {
      const expectedLabel = EXPECTED_FORMS[file as keyof typeof EXPECTED_FORMS];
      const raw = await readFile(path.join(templateDir, file), 'utf8');
      const parsed: unknown = parseYaml(raw);
      expect(parsed, file).toBeTypeOf('object');
      expect(parsed, file).not.toBeNull();

      const form = parsed as IssueForm;
      expect(typeof form.name, file).toBe('string');
      expect((form.name as string).length, file).toBeGreaterThan(0);
      expect(typeof form.description, file).toBe('string');
      expect((form.description as string).length, file).toBeGreaterThan(0);
      expect(Array.isArray(form.body), file).toBe(true);
      expect((form.body as unknown[]).length, file).toBeGreaterThan(0);

      expect(normalizeLabels(form.labels), file).toEqual([expectedLabel]);

      const ids = (form.body as FormField[])
        .map((field) => field.id)
        .filter((id): id is string => typeof id === 'string');
      expect(ids.length, file).toBeGreaterThan(0);
      expect(new Set(ids).size, file).toBe(ids.length);
    }
  });

  it('keeps blank issues enabled and points security reports at the advisory form', async () => {
    const raw = await readFile(path.join(templateDir, 'config.yml'), 'utf8');
    const parsed: unknown = parseYaml(raw);
    expect(parsed).toBeTypeOf('object');
    expect(parsed).not.toBeNull();

    const config = parsed as {
      blank_issues_enabled?: unknown;
      contact_links?: unknown;
    };
    expect(config.blank_issues_enabled).toBe(true);
    expect(Array.isArray(config.contact_links)).toBe(true);

    const links = config.contact_links as { url?: unknown }[];
    expect(
      links.some(
        (link) =>
          typeof link.url === 'string' &&
          link.url === 'https://github.com/qivora-labs/agentinit/security/advisories/new',
      ),
    ).toBe(true);
  });
});

function normalizeLabels(labels: unknown): string[] {
  if (typeof labels === 'string') {
    return [labels];
  }
  if (Array.isArray(labels)) {
    return labels.filter((label): label is string => typeof label === 'string');
  }
  return [];
}
