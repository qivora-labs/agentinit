import { describe, expect, it } from 'vitest';
import { greenfieldNextSteps } from '../../src/ui/next-steps.js';

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
