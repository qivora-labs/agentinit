import { compareText } from '../compare-text.js';
import type { AgentTarget } from '../types.js';
import { alignColumns } from './align.js';
import type { Theme } from './theme.js';

/**
 * Greenfield has no package manager yet. The commands use pnpm, matching the
 * example in PRD §3.2. Express publishes `express-generator` rather than a
 * `create-express` package.
 */
const GENERATORS: Readonly<Record<string, string>> = {
  'nextjs-app-router': 'pnpm create next-app@latest',
  'nextjs-pages-router': 'pnpm create next-app@latest',
  'react-vite': 'pnpm create vite@latest',
  express: 'npx express-generator',
  fastify: 'pnpm create fastify@latest',
};

const NONEMPTY_DIRECTORY =
  'Some generators refuse to run in a non-empty directory. Scaffold here if the generator allows it, or scaffold in a subfolder and move the files here.';

export interface NextStep {
  readonly label: string;
  readonly command?: string;
}

/**
 * PRD §3.2 step 7. "Other TypeScript project" has no generator: only the
 * reminder to come back after `package.json` exists.
 * Pipe and `--json` paths keep these plain strings.
 */
export function greenfieldNextSteps(frameworks: readonly string[]): string[] {
  if (frameworks.length === 0) {
    return ['Create a package.json, then run `npx @agentinit/cli` again.'];
  }

  const lines = ['Scaffold the project, then run `npx @agentinit/cli` again.'];
  for (const id of frameworks) {
    const command = GENERATORS[id];
    if (command !== undefined) lines.push(command);
  }
  if (frameworks.includes('nextjs-pages-router')) {
    lines.push('Choose the Pages Router when the Next.js generator asks.');
  }
  lines.push(NONEMPTY_DIRECTORY);
  return lines;
}

/**
 * PRD §3.3 step 8. Existing-project next steps are TTY chrome only.
 * `agents` is reserved for callers that already have the selection in hand.
 */
export function existingNextSteps(
  _agents: readonly AgentTarget[],
  workflows: readonly { readonly id: string; readonly order: number }[],
): NextStep[] {
  const steps: NextStep[] = [{ label: 'Review the changes', command: 'git diff' }];
  const workflow = firstWorkflow(workflows);
  if (workflow !== undefined) {
    steps.push({ label: 'Try a workflow', command: `/${workflow.id}` });
  }
  steps.push({ label: 'Check for drift', command: 'npx @agentinit/cli doctor' });
  return steps;
}

/** Numbered block with the command column in cyan. */
export function formatNextSteps(steps: readonly NextStep[], theme: Theme): string {
  if (steps.length === 0) return '';
  const rows = steps.map((step, index) => {
    const n = `${String(index + 1)}.`;
    const command = step.command === undefined ? '' : theme.accent(step.command);
    return [n, step.label, command];
  });
  return ['Next steps', ...alignColumns(rows)].join('\n');
}

/**
 * Greenfield lines as a numbered TTY block. Generator command lines are
 * highlighted; other lines stay plain labels.
 */
export function formatGreenfieldNextSteps(lines: readonly string[], theme: Theme): string {
  if (lines.length === 0) return '';
  const rows = lines.map((line, index) => {
    const n = `${String(index + 1)}.`;
    const body = isGeneratorCommand(line) ? theme.accent(line) : line;
    return [n, body];
  });
  return ['Next steps', ...alignColumns(rows)].join('\n');
}

function firstWorkflow(
  workflows: readonly { readonly id: string; readonly order: number }[],
): { readonly id: string; readonly order: number } | undefined {
  if (workflows.length === 0) return undefined;
  return [...workflows].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return compareText(left.id, right.id);
  })[0];
}

function isGeneratorCommand(line: string): boolean {
  for (const command of Object.values(GENERATORS)) {
    if (line === command) return true;
  }
  return false;
}
