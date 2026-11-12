import { ERROR } from './exit-codes.js';

export interface AgentInitErrorOptions {
  readonly exitCode?: number;
  readonly hint?: string;
}

export class AgentInitError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, options?: AgentInitErrorOptions) {
    super(message);
    this.name = 'AgentInitError';
    this.exitCode = options?.exitCode ?? ERROR;
    if (options?.hint !== undefined) {
      this.hint = options.hint;
    }
  }
}

/**
 * Schema failed, but `cliVersion` is valid semver newer than the running CLI.
 * Carries no recover-hint: the file is not corrupt; the user must upgrade.
 */
export class NewerUnreadableManifestError extends AgentInitError {
  readonly manifestVersion: string;

  constructor(message: string, manifestVersion: string) {
    super(message);
    this.name = 'NewerUnreadableManifestError';
    this.manifestVersion = manifestVersion;
  }
}

export class UnsupportedProjectError extends AgentInitError {
  constructor(message: string, hint?: string) {
    super(message, hint === undefined ? { exitCode: ERROR } : { exitCode: ERROR, hint });
    this.name = 'UnsupportedProjectError';
  }
}

export class NotInteractiveError extends AgentInitError {
  constructor(message = 'Interactive input is required.') {
    super(message, {
      exitCode: ERROR,
      hint: 'Pass --yes to run non-interactively.',
    });
    this.name = 'NotInteractiveError';
  }
}
