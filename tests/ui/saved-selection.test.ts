import { describe, expect, it } from 'vitest';
import {
  draftWithSavedSelections,
  formatSelectionChanges,
  pruneExcluded,
  selectionsMatchDetection,
  updateExcluded,
} from '../../src/ui/saved-selection.js';
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
  excluded: [] as string[],
  workflows: true,
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

  it('keeps saved language when only strictness or JSDoc within a family changes', () => {
    const draft = sampleDraft({ language: 'typescript-strict' });
    expect(draftWithSavedSelections(draft, saved).language).toBe('typescript');
    const jsDraft = sampleDraft({ language: 'javascript-jsdoc' });
    expect(
      draftWithSavedSelections(jsDraft, { ...saved, language: 'javascript' }).language,
    ).toBe('javascript');
  });

  it('adopts detected language when the family changes', () => {
    const draft = sampleDraft({ language: 'typescript-strict' });
    expect(
      draftWithSavedSelections(draft, { ...saved, language: 'javascript' }).language,
    ).toBe('typescript-strict');
    const jsDraft = sampleDraft({ language: 'javascript-jsdoc' });
    expect(draftWithSavedSelections(jsDraft, saved).language).toBe('javascript-jsdoc');
  });

  it('omits excluded detected packages from the defaults', () => {
    const draft = sampleDraft({ libraries: ['zustand', 'vitest'] });
    const next = draftWithSavedSelections(draft, { ...saved, excluded: ['zustand'] });
    expect(next.libraries).toEqual(['vitest']);
  });
});

describe('selectionsMatchDetection', () => {
  it('ignores excluded detected packages when comparing', () => {
    const draft = sampleDraft({ libraries: ['zustand', 'vitest', 'playwright'] });
    expect(
      selectionsMatchDetection(
        { ...saved, libraries: ['vitest', 'playwright'], excluded: ['zustand'] },
        draft,
        false,
      ),
    ).toBe(true);
  });

  it('treats a language family change as a mismatch', () => {
    const draft = sampleDraft({ language: 'javascript' });
    expect(selectionsMatchDetection(saved, draft, false)).toBe(false);
  });

  it('ignores strictness flips within the TypeScript family', () => {
    const draft = sampleDraft({
      language: 'typescript-strict',
      libraries: ['vitest', 'playwright'],
    });
    expect(selectionsMatchDetection(saved, draft, false)).toBe(true);
  });
});

describe('updateExcluded', () => {
  it('adds a deselected detected id and removes a selected one', () => {
    expect(
      updateExcluded({
        previous: ['zustand'],
        detected: ['zustand', 'vitest'],
        selected: ['vitest', 'playwright'],
      }),
    ).toEqual(['zustand']);
    expect(
      updateExcluded({
        previous: ['zustand'],
        detected: ['zustand', 'vitest'],
        selected: ['zustand', 'vitest'],
      }),
    ).toEqual([]);
    expect(
      updateExcluded({
        previous: [],
        detected: ['zustand', 'vitest'],
        selected: ['vitest'],
      }),
    ).toEqual(['zustand']);
  });
});

describe('pruneExcluded', () => {
  it('drops ids that left the registry', () => {
    expect(pruneExcluded(['zustand', 'gone-lib'], registry)).toEqual({
      excluded: ['zustand'],
      dropped: ['gone-lib'],
    });
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

  it('lists a language family change without calling it a package change', () => {
    const draft = sampleDraft({
      language: 'javascript',
      libraries: ['vitest', 'playwright'],
    });
    const text = formatSelectionChanges({ saved, draft, registry, fromGreenfield: false, theme });
    expect(text).toBe('Language  TypeScript → JavaScript');
  });

  it('does not list a strictness-only language preference flip', () => {
    const draft = sampleDraft({
      language: 'typescript-strict',
      libraries: ['vitest', 'playwright'],
    });
    const text = formatSelectionChanges({ saved, draft, registry, fromGreenfield: false, theme });
    expect(text).toBe('No package changes since the last run.');
  });

  it('omits excluded ids from Added and shows an Excluded line', () => {
    const draft = sampleDraft({
      libraries: ['zustand', 'vitest', 'playwright'],
      packages: { next: '16.3.0', zustand: '5.0.0' },
    });
    const text = formatSelectionChanges({
      saved: { ...saved, excluded: ['zustand'] },
      draft,
      registry,
      fromGreenfield: false,
      theme,
    });
    // Stub registry fragments use the id as the display name.
    expect(text).toBe(
      ['No package changes since the last run.', 'Excluded: zustand'].join('\n'),
    );
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
