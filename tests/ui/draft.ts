import type { ProjectDraft } from '../../src/detect/index.js';

export function sampleDraft(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  return {
    root: '/repo/app',
    mode: 'existing',
    packageManager: 'pnpm',
    srcDir: 'src',
    language: 'typescript-strict',
    packages: { next: '16.3.0', react: '19.0.0' },
    scripts: { dev: 'next dev' },
    frameworks: ['nextjs-app-router'],
    libraries: ['vitest'],
    architecture: { id: 'feature-based', confidence: 0.875 },
    folders: ['features'],
    existingAgentFiles: [],
    suggestedAgents: [],
    isMonorepo: false,
    ...overrides,
  };
}
