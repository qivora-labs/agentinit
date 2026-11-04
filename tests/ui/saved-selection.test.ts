import { describe, expect, it } from 'vitest';
import { draftWithSavedSelections, formatSelectionChanges } from '../../src/ui/saved-selection.js';
import { createTheme } from '../../src/ui/theme.js';
import { sampleDraft } from './draft.js';
import { registryOf, ruleFragment } from './stub-registry.js';

const registry = registryOf([
  ruleFragment('nextjs-app-router', 'framework', 'detect:\n  packages: ["next"]\n'),
  ruleFragment('zustand', 'library', 'detect:\n  packages: ["zustand"]\n'),
  ruleFragment('vitest', 'library'),
  ruleFragment('playwright', 'library'),
]);

const theme = createTheme(false, true);

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
  it('lists packages detection added or dropped with aligned labels', () => {
    const draft = sampleDraft({
      libraries: ['zustand', 'vitest'],
      packages: { next: '16.3.0', zustand: '5.0.0' },
    });
    const text = formatSelectionChanges({ saved, draft, registry, fromGreenfield: false, theme });
    expect(text).toBe(
      [
        'Added    zustand  zustand 5.0',
        'Removed  playwright',
      ].join('\n'),
    );
  });

  it('says when nothing about the packages changed', () => {
    const draft = sampleDraft({ libraries: ['vitest', 'playwright'] });
    const text = formatSelectionChanges({ saved, draft, registry, fromGreenfield: false, theme });
    expect(text).toBe('No package changes since the last run.');
  });

  it('keeps architecture and agents when a greenfield project gains package.json', () => {
    const draft = sampleDraft({ srcDir: '', libraries: ['vitest'], packages: { next: '16.3.0' } });
    const text = formatSelectionChanges({
      saved: { ...saved, libraries: ['vitest'], frameworks: [] },
      draft,
      registry,
      fromGreenfield: true,
      theme,
    });
    expect(text).toContain('Keeping the saved architecture and agents.');
    expect(text).toContain('Added');
    expect(text).toContain('nextjs-app-router  next 16.3');
    expect(text).toContain('Layout  project root');
  });
});
