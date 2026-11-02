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

/**
 * PRD §3.2 step 7. "Other TypeScript project" has no generator: only the
 * reminder to come back after `package.json` exists.
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
