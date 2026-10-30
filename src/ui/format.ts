import type { ProjectDraft, DetectionWarning } from '../detect/index.js';
import type { Registry } from '../registry/load.js';
import type { RegistryNotice } from '../registry/resolve.js';
import { fragmentName } from './catalog.js';
import { LOW_ARCHITECTURE_CONFIDENCE } from './confidence.js';

export const NO_FRAMEWORK_SUMMARY = 'Framework: none detected';

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
}

export function formatSummary(input: SummaryText): string {
  const { draft, registry } = input;
  const lines = [
    draft.frameworks.length === 0
      ? NO_FRAMEWORK_SUMMARY
      : `Framework: ${nameList(registry, draft.frameworks)}`,
    `Libraries: ${nameList(registry, draft.libraries)}`,
    `Language: ${fragmentName(registry, draft.language)}`,
    `Package manager: ${draft.packageManager ?? 'unknown'}`,
    `Layout: ${draft.srcDir === 'src' ? 'src/' : 'project root'}`,
    `Architecture: ${fragmentName(registry, draft.architecture.id)} (confidence ${formatConfidence(draft.architecture.confidence)})`,
    formatVersions(draft.packages),
  ];

  const notices = noticeLines(input);
  if (notices.length > 0) {
    lines.push('Notices:', ...notices.map((line) => `  ${line}`));
  }
  return lines.join('\n');
}

export function formatRegistryNotice(notice: RegistryNotice, registry: Registry): string {
  switch (notice.kind) {
    case 'unsupported-version':
      return `${notice.package}@${notice.version} detected — no matching rules yet.`;
    case 'unknown-version':
      return `${notice.package} version is unknown — included ${fragmentName(registry, notice.fragmentId)}.`;
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
      return warning.message;
    case 'legacy-agent-file':
      return `${warning.path} still loads alongside the new rules and will not be modified.`;
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

function nameList(registry: Registry, ids: readonly string[]): string {
  if (ids.length === 0) return 'none';
  return ids.map((id) => fragmentName(registry, id)).join(', ');
}

function formatVersions(packages: Readonly<Record<string, string>>): string {
  const entries = Object.entries(packages).sort((left, right) => compareText(left[0], right[0]));
  if (entries.length === 0) return 'Versions: none';
  const lines = entries.map(([name, version]) => `  ${name}@${version}`);
  return ['Versions:', ...lines].join('\n');
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

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
