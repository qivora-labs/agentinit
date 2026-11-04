import { describe, expect, it } from 'vitest';
import { stripAnsi } from '../../src/ui/align.js';
import {
  existingNextSteps,
  formatGreenfieldNextSteps,
  formatNextSteps,
  greenfieldNextSteps,
} from '../../src/ui/next-steps.js';
import { createTheme } from '../../src/ui/theme.js';

const color = createTheme(true, true, true);

describe('greenfieldNextSteps', () => {
  it('prints the Next.js generator and tells the user to re-run', () => {
    const lines = greenfieldNextSteps(['nextjs-app-router']);
    expect(lines).toContain('pnpm create next-app@latest');
    expect(lines.join('\n')).toContain('npx @agentinit/cli');
    expect(lines.join('\n')).toContain('non-empty directory');
  });

  it('tells a Pages Router project to choose that router', () => {
    expect(greenfieldNextSteps(['nextjs-pages-router']).join('\n')).toContain('Pages Router');
  });

  it('only asks an Other TypeScript project to come back after package.json', () => {
    const lines = greenfieldNextSteps([]);
    expect(lines).toEqual(['Create a package.json, then run `npx @agentinit/cli` again.']);
  });
});

describe('existingNextSteps', () => {
  it('lists review, the first workflow by order then id, and doctor', () => {
    expect(
      existingNextSteps(['cursor'], [
        { id: 'write-tests', order: 50 },
        { id: 'new-feature', order: 50 },
        { id: 'refactor', order: 50 },
      ]),
    ).toEqual([
      { label: 'Review the changes', command: 'git diff' },
      { label: 'Try a workflow', command: '/new-feature' },
      { label: 'Check for drift', command: 'npx @agentinit/cli doctor' },
    ]);
  });

  it('omits the workflow step when none were resolved', () => {
    expect(existingNextSteps(['cursor'], [])).toEqual([
      { label: 'Review the changes', command: 'git diff' },
      { label: 'Check for drift', command: 'npx @agentinit/cli doctor' },
    ]);
  });
});

describe('formatNextSteps', () => {
  it('numbers steps and paints commands cyan', () => {
    const text = formatNextSteps(existingNextSteps(['cursor'], [{ id: 'new-feature', order: 50 }]), color);
    expect(stripAnsi(text)).toBe(
      [
        'Next steps',
        '1.  Review the changes  git diff',
        '2.  Try a workflow      /new-feature',
        '3.  Check for drift     npx @agentinit/cli doctor',
      ].join('\n'),
    );
    expect(text).toContain('\u001b[36m');
  });
});

describe('formatGreenfieldNextSteps', () => {
  it('highlights the generator command on a TTY', () => {
    const text = formatGreenfieldNextSteps(greenfieldNextSteps(['nextjs-app-router']), color);
    expect(stripAnsi(text)).toContain('1.  Scaffold the project');
    expect(stripAnsi(text)).toContain('pnpm create next-app@latest');
    expect(text).toContain('\u001b[36mpnpm create next-app@latest');
  });
});
