import { compareText } from '../compare-text.js';
import { AgentInitError } from '../errors.js';
import { headingSlug, markdownDocument, nestHeadings } from '../plan/markdown.js';
import { renderBody, scriptCommand, type PlaceholderContext } from '../plan/placeholders.js';
import { architectureFragment, nonArchitectureAlways } from '../plan/render.js';
import type { RenderedFragment, TargetAdapter } from '../plan/types.js';
import { getSections } from '../registry/parse.js';

const INTRO =
  "Always-on rules for this project. Scoped rules and workflows stay in each agent's own files.";

interface Section {
  readonly title: string;
  readonly body: string;
}

/**
 * Always-on text lives only in this block (PRD §5.1). Scoped fragments and
 * workflows stay on the target context for agent adapters. Markers are added
 * by the IO layer, so this op is the inner content only.
 */
export const agentsMdAdapter: TargetAdapter = (ctx) => {
  const sections: Section[] = [];
  const commands = projectCommands(ctx.profile.mode, ctx.placeholders);
  if (commands !== undefined) {
    sections.push({ title: 'Project commands', body: commands });
  }
  sections.push({
    title: 'Architecture',
    body: architectureSection(architectureFragment(ctx)),
  });
  for (const fragment of nonArchitectureAlways(ctx)) {
    const body = fragment.body.trim();
    if (body.length === 0) continue;
    sections.push({ title: fragment.name, body: nestHeadings(body) });
  }

  return [
    {
      path: 'AGENTS.md',
      kind: 'managed-block',
      blockId: 'core',
      content: agentsDocument(sections),
      target: 'shared',
    },
  ];
};

function architectureSection(fragment: RenderedFragment): string {
  const summary = getSections(fragment.body).get('Summary')?.trim() ?? '';
  if (summary.length === 0) {
    throw new AgentInitError(`Fragment "${fragment.id}" is missing a "## Summary" section.`);
  }
  return `${summary}\n\nSee [ARCHITECTURE.md](ARCHITECTURE.md) for the folder map and conventions for new code.`;
}

/**
 * Existing projects list every package script, expanded the same way as
 * `{{scripts.*}}`. Greenfield has no package manager, so the section is omitted.
 */
function projectCommands(mode: 'existing' | 'greenfield', placeholders: PlaceholderContext): string | undefined {
  if (mode !== 'existing' || placeholders.pm === null) return undefined;
  const lines: string[] = [];
  for (const name of Object.keys(placeholders.scripts).sort(compareText)) {
    const command = renderScript(name, placeholders);
    if (command === undefined) continue;
    lines.push(`- \`${command}\``);
  }
  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

function renderScript(name: string, placeholders: PlaceholderContext): string | undefined {
  if (placeholders.pm === null) return undefined;
  if (/^\S+$/u.test(name) && !name.includes('{') && !name.includes('}')) {
    const rendered = renderBody(`{{scripts.${name}}}`, placeholders).trim();
    if (rendered.length > 0) return rendered;
  }
  if (!Object.hasOwn(placeholders.scripts, name)) return undefined;
  return scriptCommand(placeholders.pm, name);
}

function agentsDocument(sections: readonly Section[]): string {
  const contents = sections.map((section) => `- [${section.title}](#${headingSlug(section.title)})`).join('\n');
  return markdownDocument([
    '# AGENTS.md',
    INTRO,
    `## Contents\n\n${contents}`,
    ...sections.map((section) => `## ${section.title}\n\n${section.body.trim()}`),
  ]);
}
