import { AgentInitError } from '../errors.js';
import { compareText, markdownDocument } from '../plan/markdown.js';
import { architectureFragment } from '../plan/render.js';
import type { TargetAdapter } from '../plan/types.js';
import { getSections } from '../registry/parse.js';
import type { ProjectProfile } from '../types.js';

interface MapRow {
  readonly path: string;
  readonly responsibility: string;
}

interface MatchedFolder {
  readonly folder: string;
  readonly responsibility: string;
}

/**
 * `<name>` matches one path segment. A longer pattern wins, so
 * `components/atoms` keeps the atoms row when `components/` also matches.
 * Folders that do not match are listed with no recommendation: this file
 * must not tell agents to move existing files (PRD §5.4).
 */
export const architectureMdAdapter: TargetAdapter = (ctx) => {
  const fragment = architectureFragment(ctx);
  const sections = getSections(fragment.body);
  const map = sections.get('Map')?.trim() ?? '';
  if (map.length === 0) {
    throw new AgentInitError(`Fragment "${fragment.id}" is missing a "## Map" section.`);
  }
  const directives = sections.get('Directives')?.trim() ?? '';
  const rows = parseMapRows(map);
  const content =
    ctx.profile.mode === 'greenfield'
      ? greenfieldDocument(map, rows, directives)
      : existingDocument(ctx.profile, rows, directives);

  return [
    {
      path: 'ARCHITECTURE.md',
      kind: 'managed-block',
      blockId: 'architecture',
      content,
      target: 'shared',
    },
  ];
};

function existingDocument(profile: ProjectProfile, rows: readonly MapRow[], directives: string): string {
  const folders = uniqueFolders(profile.folders);
  const matched: MatchedFolder[] = [];
  const unmatched: string[] = [];
  for (const folder of folders) {
    const responsibility = matchResponsibility(folder, rows, profile.srcDir);
    if (responsibility === undefined) unmatched.push(projectPath(folder, profile.srcDir));
    else matched.push({ folder: projectPath(folder, profile.srcDir), responsibility });
  }
  matched.sort((left, right) => compareText(left.folder, right.folder));
  unmatched.sort(compareText);

  const layout =
    matched.length === 0
      ? 'No folders were detected under the source root.'
      : markdownTable(
          ['Folder', 'Responsibility'],
          matched.map((entry) => [`\`${entry.folder}\``, entry.responsibility]),
        );

  const blocks = [
    '# ARCHITECTURE.md',
    'Describes the folders that exist today and the conventions for new code. Existing files stay where they are.',
    `## Layout\n\n${layout}`,
  ];
  if (unmatched.length > 0) {
    const listed = unmatched.map((folder) => `- \`${folder}\``).join('\n');
    blocks.push(`## Other existing folders\n\nThese folders are already in the project:\n\n${listed}`);
  }
  if (directives.length > 0) {
    blocks.push(`## Conventions for new code\n\n${directives}`);
  }
  return markdownDocument(blocks);
}

function greenfieldDocument(map: string, rows: readonly MapRow[], directives: string): string {
  const layout =
    rows.length > 0
      ? markdownTable(
          ['Path', 'Responsibility'],
          rows.map((row) => [`\`${row.path}\``, row.responsibility]),
        )
      : map;
  const blocks = [
    '# ARCHITECTURE.md',
    'Describes the planned layout and the conventions for new code.',
    `## Planned layout\n\n${layout}`,
  ];
  if (directives.length > 0) {
    blocks.push(`## Conventions for new code\n\n${directives}`);
  }
  return markdownDocument(blocks);
}

function matchResponsibility(folder: string, rows: readonly MapRow[], srcDir: '' | 'src'): string | undefined {
  const segments = pathSegments(folder);
  let best: { readonly responsibility: string; readonly length: number } | undefined;
  for (const row of rows) {
    const pattern = mapSegments(row.path, srcDir);
    if (!sameShape(segments, pattern)) continue;
    if (best !== undefined && pattern.length <= best.length) continue;
    best = { responsibility: row.responsibility, length: pattern.length };
  }
  return best?.responsibility;
}

function mapSegments(mapPath: string, srcDir: '' | 'src'): readonly string[] {
  let path = mapPath.trim().replace(/^\.\//u, '').replace(/\/+$/u, '');
  if (srcDir === 'src' && (path === 'src' || path.startsWith('src/'))) {
    path = path === 'src' ? '' : path.slice('src/'.length);
  }
  return pathSegments(path);
}

function pathSegments(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function sameShape(segments: readonly string[], pattern: readonly string[]): boolean {
  if (segments.length !== pattern.length) return false;
  for (let index = 0; index < segments.length; index += 1) {
    const expected = pattern[index];
    const actual = segments[index];
    if (expected === undefined || actual === undefined) return false;
    if (isWildcard(expected)) continue;
    if (expected !== actual) return false;
  }
  return true;
}

function isWildcard(segment: string): boolean {
  return /^<[^>]+>$/u.test(segment);
}

function projectPath(folder: string, srcDir: '' | 'src'): string {
  return srcDir === 'src' ? `src/${folder}` : folder;
}

function uniqueFolders(folders: readonly string[]): string[] {
  return [...new Set(folders.map((folder) => folder.trim()).filter((folder) => folder.length > 0))].sort(compareText);
}

function parseMapRows(map: string): MapRow[] {
  const rows: MapRow[] = [];
  for (const line of map.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cleanCell(cell));
    const path = cells[0];
    if (path === undefined || cells.length < 2) continue;
    if (isSeparator(path) || path.toLowerCase() === 'path') continue;
    const responsibility = cells.slice(1).join(' ').trim();
    if (path.length === 0 || responsibility.length === 0) continue;
    rows.push({ path, responsibility });
  }
  return rows;
}

function cleanCell(cell: string): string {
  const trimmed = cell.replace(/\*\*/gu, '').trim();
  const wrapped = /^`([^`]+)`$/u.exec(trimmed);
  return (wrapped?.[1] ?? trimmed).trim();
}

function isSeparator(cell: string): boolean {
  return /^:?-{3,}:?$/u.test(cell);
}

function markdownTable(headers: readonly [string, string], rows: readonly (readonly [string, string])[]): string {
  const lines = [`| ${headers[0]} | ${headers[1]} |`, '| :--- | :--- |'];
  for (const [left, right] of rows) {
    lines.push(`| ${left} | ${right} |`);
  }
  return lines.join('\n');
}
