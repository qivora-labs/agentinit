import { eq, major, minor, patch, valid } from 'semver';

/**
 * How the running CLI relates to `manifest.cliVersion` (PRD §3.4 / §6.6).
 * Invalid semver never blocks writes; older major/minor does unless `--force`.
 */
export type CliCompat =
  | { readonly kind: 'same' }
  | { readonly kind: 'newer'; readonly notice: string }
  | { readonly kind: 'patch-behind'; readonly notice: string }
  | { readonly kind: 'behind'; readonly notice: string; readonly message: string }
  | { readonly kind: 'unknown'; readonly notice: string };

/** Compare the running CLI version to the version recorded in the manifest. */
export function assessCliCompat(running: string, manifestVersion: string): CliCompat {
  const notice = formatCliVersionNotice(manifestVersion, running);
  if (valid(running) === null || valid(manifestVersion) === null) {
    return { kind: 'unknown', notice };
  }
  if (eq(running, manifestVersion)) return { kind: 'same' };

  if (!isRunningOlder(running, manifestVersion)) {
    return { kind: 'newer', notice };
  }

  if (major(running) === major(manifestVersion) && minor(running) === minor(manifestVersion)) {
    return { kind: 'patch-behind', notice };
  }

  return {
    kind: 'behind',
    notice,
    message: olderCliMessage(manifestVersion),
  };
}

/** One-line status when the versions differ (TTY header / `--json` notices). */
export function formatCliVersionNotice(manifestVersion: string, running: string): string {
  return `Set up with agentinit ${manifestVersion} · running ${running}`;
}

/** Exit-1 message when an older major/minor tries to rewrite a newer project. */
export function olderCliMessage(manifestVersion: string): string {
  return (
    `This project was set up with agentinit ${manifestVersion}. ` +
    `Run \`npx @agentinit/cli@${manifestVersion}\` or newer.`
  );
}

/** Notice string for every non-`same` result; `undefined` when versions match. */
export function cliCompatNotice(compat: CliCompat): string | undefined {
  switch (compat.kind) {
    case 'same':
      return undefined;
    case 'newer':
    case 'patch-behind':
    case 'behind':
    case 'unknown':
      return compat.notice;
    default: {
      const unexpected: never = compat;
      throw new Error(`Unhandled cli compat: ${String(unexpected)}`);
    }
  }
}

function isRunningOlder(running: string, manifestVersion: string): boolean {
  const runningMajor = major(running);
  const manifestMajor = major(manifestVersion);
  if (runningMajor !== manifestMajor) return runningMajor < manifestMajor;

  const runningMinor = minor(running);
  const manifestMinor = minor(manifestVersion);
  if (runningMinor !== manifestMinor) return runningMinor < manifestMinor;

  return patch(running) < patch(manifestVersion);
}
