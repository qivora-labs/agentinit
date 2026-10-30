import { describe, expect, it } from 'vitest';
import { loadRegistry, type Registry } from '../../src/registry/load.js';
import {
  architectureOptions,
  frameworkOptions,
  languageOptions,
  libraryOptions,
  OTHER_TYPESCRIPT_LABEL,
  OTHER_TYPESCRIPT_PROJECT,
} from '../../src/ui/catalog.js';
import { registryOf, ruleFragment } from './stub-registry.js';

let registry: Registry | undefined;

async function bundledRegistry(): Promise<Registry> {
  registry ??= await loadRegistry();
  return registry;
}

describe('frameworkOptions', () => {
  it('groups bundled frameworks by the PRD types and appends Other', async () => {
    const options = frameworkOptions(await bundledRegistry(), true);
    expect(options.map((option) => [option.group, option.value, option.label])).toEqual([
      ['Web frontend', 'react-vite', 'React + Vite'],
      ['Full-stack web', 'nextjs-app-router', 'Next.js App Router'],
      ['Full-stack web', 'nextjs-pages-router', 'Next.js Pages Router'],
      ['Backend / API', 'express', 'Express'],
      ['Backend / API', 'fastify', 'Fastify'],
      ['Other', OTHER_TYPESCRIPT_PROJECT, OTHER_TYPESCRIPT_LABEL],
    ]);
  });

  it('strips terminal controls from names and descriptions', () => {
    const fragment = ruleFragment('hono', 'framework');
    const registry = registryOf([
      {
        ...fragment,
        meta: { ...fragment.meta, name: 'Hono\u001b[31m', description: 'fast\u001b[0m' },
      },
    ]);
    expect(frameworkOptions(registry, false)).toEqual([
      { value: 'hono', label: 'Hono', hint: 'fast', group: 'Other' },
    ]);
  });

  it('puts a framework id that has no group under Other, before the sentinel', () => {
    const options = frameworkOptions(
      registryOf([ruleFragment('react-vite', 'framework'), ruleFragment('hono', 'framework')]),
      true,
    );
    expect(options.map((option) => [option.group, option.value])).toEqual([
      ['Web frontend', 'react-vite'],
      ['Other', 'hono'],
      ['Other', OTHER_TYPESCRIPT_PROJECT],
    ]);
  });
});

describe('libraryOptions', () => {
  it('keeps a library only when it is agnostic or lists a selected framework', () => {
    const bundled = registryOf([
      ruleFragment('zustand', 'library', 'compatibleWith:\n  - react-vite\n'),
      ruleFragment('vitest', 'library'),
    ]);
    expect(libraryOptions(bundled, []).map((option) => option.value)).toEqual(['vitest']);
    expect(libraryOptions(bundled, ['express']).map((option) => option.value)).toEqual(['vitest']);
    expect(libraryOptions(bundled, ['react-vite']).map((option) => option.value)).toEqual([
      'zustand',
      'vitest',
    ]);
  });

  it('filters the bundled registry the same way', async () => {
    const bundled = await bundledRegistry();
    expect(libraryOptions(bundled, []).map((option) => option.value)).toEqual(['vitest', 'playwright']);
    expect(libraryOptions(bundled, ['react-vite']).map((option) => option.value)).toEqual([
      'zustand',
      'tanstack-query',
      'tailwind',
      'shadcn',
      'react-hook-form-zod',
      'vitest',
      'playwright',
    ]);
  });
});

describe('language and architecture options', () => {
  it('marks strict TypeScript and feature-based as recommended', async () => {
    const bundled = await bundledRegistry();
    const languages = languageOptions(bundled);
    const architectures = architectureOptions(bundled);
    expect(languages.map((option) => option.value)).toEqual(['typescript-strict', 'typescript']);
    expect(languages[0]?.hint).toMatch(/^recommended · /);
    expect(architectures.map((option) => option.value)).toEqual([
      'feature-based',
      'layered',
      'atomic-design',
      'flat',
    ]);
    expect(architectures[0]?.hint).toBe('recommended · src/features/<domain>');
    expect(architectures[0]?.label).toBe('Feature-Based');
  });
});
