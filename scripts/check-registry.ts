import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AgentInitError } from '../src/errors.js';
import {
  checkFragments,
  formatReport,
  problemsFromLoadError,
  reportStatus,
  type RegistryProblem,
} from '../src/registry/check.js';
import { defaultRegistryDir } from '../src/registry/locate.js';
import { loadRegistry } from '../src/registry/load.js';

export async function runRegistryCheck(
  dir: string,
  today: string,
  stdout: { write(chunk: string): void },
): Promise<0 | 1> {
  let problems: RegistryProblem[];
  try {
    const registry = await loadRegistry(dir);
    problems = checkFragments(registry.fragments, today);
  } catch (error) {
    if (!(error instanceof AgentInitError)) throw error;
    problems = problemsFromLoadError(error.message);
  }
  stdout.write(formatReport(problems));
  return reportStatus(problems);
}

function localIsoDate(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const dir = process.argv[2] ?? defaultRegistryDir();
  const code = await runRegistryCheck(dir, localIsoDate(new Date()), process.stdout);
  process.exitCode = code;
}
