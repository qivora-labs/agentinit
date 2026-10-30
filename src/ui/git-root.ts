import { sanitizeDisplayText } from './display-text.js';
import type { Prompter } from './prompter.js';

export type GitRootChoice = 'stay' | 'use-git-root';

export interface GitRootDirectories {
  readonly cwd: string;
  readonly gitRoot: string;
}

/**
 * Asked only when the working directory is below the git root.
 * No is the default, so `--yes` and Enter both stay put (PRD §3.5).
 */
export async function confirmGitRoot(
  prompter: Prompter,
  directories: GitRootDirectories,
): Promise<GitRootChoice> {
  const gitRoot = sanitizeDisplayText(directories.gitRoot);
  const cwd = sanitizeDisplayText(directories.cwd);
  const useRoot = await prompter.confirm({
    message: `This directory is inside ${gitRoot}. Use the git root instead of ${cwd}?`,
    initialValue: false,
  });
  return useRoot ? 'use-git-root' : 'stay';
}
