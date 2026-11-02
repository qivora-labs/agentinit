import { describe, expect, it } from 'vitest';
import { draftWithSavedSelections, formatSelectionChanges } from '../../src/ui/saved-selection.js';
import { sampleDraft } from './draft.js';
import { registryOf, ruleFragment } from './stub-registry.js';

const registry = registryOf([
  ruleFragment('nextjs-app-router', 'framework'),
  ruleFragment('zustand', 'library'),
  ruleFragment('vitest', 'library'),
  ruleFragment('playwright', 'library'),
]);

const saved = {
  language: 'typescript' as const,
  frameworks: ['nextjs-app-router'],
  libraries: ['vitest', 'playwright'],
  architecture: 'layered',
  agents: ['cursor' as const],
};

describe('draftWithSavedSelections', () => {
  it('keeps saved language, architecture, and agents, and leaves detected packages', () => {
    const draft = sampleDraft({ libraries: ['zustand', 'vitest'] });
    const next = draftWithSavedSelections(draft, saved);
    expect(next.language).toBe('typescript');
    expect(next.architecture).toEqual({ id: 'layered', confidence: 1 });
    expect(next.suggestedAgents).toEqual(['cursor']);
    expect(next.frameworks).toEqual(['nextjs-app-router']);
    expect(next.libraries).toEqual(['zustand', 'vitest']);
  });
});

describe('formatSelectionChanges', () => {
  it('lists packages detection added or dropped', () => {
    const draft = sampleDraft({ libraries: ['zustand', 'vitest'] });
    const text = formatSelectionChanges({ saved, draft, registry, fromGreenfield: false });
    expect(text).toContain('Added:');
    expect(text).toContain('zustand');
    expect(text).toContain('Removed:');
    expect(text).toContain('playwright');
    expect(text).not.toContain('Layout:');
  });

  it('says when nothing about the packages changed', () => {
    const draft = sampleDraft({ libraries: ['vitest', 'playwright'] });
    const text = formatSelectionChanges({ saved, draft, registry, fromGreenfield: false });
    expect(text).toBe('No package changes since the last run.');
  });

  it('keeps architecture and agents when a greenfield project gains package.json', () => {
    const draft = sampleDraft({ srcDir: '', libraries: ['vitest'] });
    const text = formatSelectionChanges({
      saved: { ...saved, libraries: ['vitest'], frameworks: [] },
      draft,
      registry,
      fromGreenfield: true,
    });
    expect(text).toContain('Keeping the saved architecture and agents.');
    expect(text).toContain('Added:');
    expect(text).toContain('nextjs-app-router');
    expect(text).toContain('Layout: project root');
  });
});
