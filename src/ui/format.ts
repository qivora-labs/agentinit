import type { ProjectDraft, DetectionWarning } from '../detect/index.js';
import type { Registry } from '../registry/load.js';
import type { RegistryNotice } from '../registry/resolve.js';
import { alignColumns } from './align.js';
import { fragmentName } from './catalog.js';
import { LOW_ARCHITECTURE_CONFIDENCE } from './confidence.js';
import { sanitizeDisplayText } from './display-text.js';
import type { Theme } from './theme.js';

export const NO_FRAMEWORK_SUMMARY = 'none detected';

export const NO_FRAMEWORK_NOTICE = 'No framework rules matched; generating base rules.';

export interface LowConfidenceNotice {
  readonly kind: 'low-confidence-architecture';
  readonly confidence: number;
}

export interface SummaryText {
  readonly draft: ProjectDraft;
  readonly registry: Registry;
  readonly notices: readonly RegistryNotice[];
  readonly warnings: readonly DetectionWarning[];
  readonly theme: Theme;
}

export function formatSummaryTitle(name: string | null): string {
  if (name === null || name.trim() === '') return 'Detected project';
  return `Detected ${sanitizeDisplayText(name)}`;
}

export function formatSummary(input: SummaryText): string {
  const { draft, registry, theme } = input;
  const rows: string[][] = [];

  rows.push([
    theme.muted('Framework'),
    draft.frameworks.length === 0
      ? NO_FRAMEWORK_SUMMARY
      : formatFragmentList(registry, draft.frameworks, draft.packages, theme),
  ]);

  if (draft.libraries.length > 0) {
    rows.push([
      theme.muted('Libraries'),
      formatFragmentList(registry, draft.libraries, draft.packages, theme),
    ]);
  }

  rows.push([theme.muted('Language'), formatLanguage(draft, theme)]);
  rows.push([
    theme.muted('Architecture'),
    formatArchitecture(registry, draft.architecture, theme),
  ]);
  rows.push([theme.muted('Tooling'), formatTooling(draft, theme)]);

  const notes = noticeLines(input);
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    if (note === undefined) continue;
    rows.push([
      index === 0 ? theme.muted('Notes') : '',
      `${theme.warn(theme.glyphs.warn)} ${note}`,
    ]);
  }

  return alignColumns(rows).join('\n');
}

export function formatRegistryNotice(notice: RegistryNotice, registry: Registry): string {
  switch (notice.kind) {
    case 'unsupported-version':
      return `${sanitizeDisplayText(notice.package)}@${sanitizeDisplayText(notice.version)} detected — no matching rules yet.`;
    case 'unknown-version':
      return `${sanitizeDisplayText(notice.package)} version is unknown — included ${fragmentName(registry, notice.fragmentId)}.`;
    case 'required-by':
      return `${fragmentName(registry, notice.fragmentId)} was added because ${fragmentName(registry, notice.requiredBy)} requires it.`;
    case 'incompatible':
      return `${fragmentName(registry, notice.fragmentId)} was skipped — it targets a different framework.`;
    case 'no-framework':
      return NO_FRAMEWORK_NOTICE;
  }
}

export function formatWarning(warning: DetectionWarning): string {
  switch (warning.kind) {
    case 'unresolved-tsconfig-extends':
      return sanitizeDisplayText(warning.message);
    case 'legacy-agent-file':
      return `${sanitizeDisplayText(warning.path)} still loads alongside the new rules and will not be modified.`;
  }
}

export function formatLowConfidence(notice: LowConfidenceNotice, registry: Registry): string {
  const name = fragmentName(registry, 'flat');
  const confidence = formatConfidence(notice.confidence);
  const limit = formatConfidence(LOW_ARCHITECTURE_CONFIDENCE);
  return `Architecture confidence is ${confidence}, below ${limit}. Using ${name}.`;
}

export function formatConfidence(confidence: number): string {
  return confidence.toFixed(3).replace(/\.?0+$/, '');
}

function formatFragmentList(
  registry: Registry,
  ids: readonly string[],
  packages: Readonly<Record<string, string>>,
  theme: Theme,
): string {
  return ids.map((id) => formatFragmentValue(registry, id, packages, theme)).join(', ');
}

/** Fragment display name, then detection package + major.minor in gray when known. */
export function formatFragmentValue(
  registry: Registry,
  id: string,
  packages: Readonly<Record<string, string>>,
  theme: Theme,
): string {
  const name = fragmentName(registry, id);
  const versionText = detectionPackageVersion(registry, id, packages);
  if (versionText === undefined) return name;
  return `${name}  ${theme.muted(versionText)}`;
}

function formatLanguage(draft: ProjectDraft, theme: Theme): string {
  const label = draft.language === 'typescript-strict' ? 'TypeScript · strict' : 'TypeScript';
  const version = draft.packages.typescript;
  if (version === undefined) return label;
  const short = majorMinor(version);
  if (short === undefined) return label;
  return `${label}  ${theme.muted(`typescript ${short}`)}`;
}

function formatArchitecture(
  registry: Registry,
  architecture: ProjectDraft['architecture'],
  theme: Theme,
): string {
  const name = fragmentName(registry, architecture.id);
  if (architecture.confidence >= LOW_ARCHITECTURE_CONFIDENCE) {
    return `${name}  ${theme.muted('likely')}`;
  }
  return `${name}  ${theme.warn(`unsure (${formatConfidence(architecture.confidence)})`)}`;
}

function formatTooling(draft: ProjectDraft, theme: Theme): string {
  const manager = sanitizeDisplayText(draft.packageManager ?? 'unknown');
  const layout = draft.srcDir === 'src' ? 'src/' : 'project root';
  return `${manager} ${theme.muted('·')} ${layout}`;
}

function detectionPackageVersion(
  registry: Registry,
  id: string,
  packages: Readonly<Record<string, string>>,
): string | undefined {
  const meta = registry.byId.get(id)?.meta;
  if (meta === undefined || meta.category === 'workflow') return undefined;
  const names = meta.detect?.packages;
  if (names === undefined) return undefined;
  for (const packageName of names) {
    const version = packages[packageName];
    if (version === undefined) continue;
    const short = majorMinor(version);
    if (short === undefined) continue;
    return `${sanitizeDisplayText(packageName)} ${short}`;
  }
  return undefined;
}

/** First two numeric segments (`16.3.0` → `16.3`). Non-semver-like strings are skipped. */
function majorMinor(version: string): string | undefined {
  const match = /^(\d+)\.(\d+)/.exec(sanitizeDisplayText(version));
  const major = match?.[1];
  const minor = match?.[2];
  if (major === undefined || minor === undefined) return undefined;
  return `${major}.${minor}`;
}

function noticeLines(input: SummaryText): string[] {
  const lines: string[] = [];
  const seenNoFramework = input.notices.some((notice) => notice.kind === 'no-framework');
  if (input.draft.frameworks.length === 0 && !seenNoFramework) {
    lines.push(NO_FRAMEWORK_NOTICE);
  }
  for (const notice of input.notices) {
    lines.push(formatRegistryNotice(notice, input.registry));
  }
  for (const warning of input.warnings) {
    lines.push(formatWarning(warning));
  }
  return lines;
}
