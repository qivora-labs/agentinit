import { describe, expect, it } from 'vitest';
import { CANCELLED } from '../../src/exit-codes.js';
import { AgentInitError } from '../../src/errors.js';
import { confirmGitRoot } from '../../src/ui/git-root.js';
import { confirmPrompt, recordingPrompter } from './recording-prompter.js';

const directories = { cwd: '/repo/packages/app', gitRoot: '/repo' };

describe('confirmGitRoot', () => {
  it('stays by default', async () => {
    const { prompter, calls } = recordingPrompter([{ type: 'confirm', value: false }]);
    await expect(confirmGitRoot(prompter, directories)).resolves.toBe('stay');
    expect(confirmPrompt(calls[0])).toEqual({
      message: 'This directory is inside /repo. Use the git root instead of /repo/packages/app?',
      initialValue: false,
    });
  });

  it('uses the git root when confirmed', async () => {
    const { prompter } = recordingPrompter([{ type: 'confirm', value: true }]);
    await expect(confirmGitRoot(prompter, directories)).resolves.toBe('use-git-root');
  });

  it('cancel exits 130', async () => {
    const { prompter } = recordingPrompter([{ type: 'cancel' }]);
    const pending = confirmGitRoot(prompter, directories);
    await expect(pending).rejects.toBeInstanceOf(AgentInitError);
    await expect(pending).rejects.toMatchObject({ exitCode: CANCELLED });
  });
});
