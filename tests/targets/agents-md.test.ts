import { describe, expect, it } from 'vitest';
import { renderTargetContext } from '../../src/plan/render.js';
import { agentsMdAdapter } from '../../src/targets/agents-md.js';
import { layeredFragment, profile, resolved, ruleFragment } from '../plan/helpers.js';

describe('agentsMdAdapter', () => {
  it('keeps a fragment name from opening a link or another heading', () => {
    const ctx = renderTargetContext(
      profile({ scripts: {} }),
      resolved([
        layeredFragment(),
        ruleFragment({
          id: 'hostile',
          name: 'Click](http://evil.test)\u2028## Injected',
          category: 'language',
          scope: 'always',
          order: 20,
          body: 'RULE',
        }),
      ]),
    );
    const op = agentsMdAdapter(ctx)[0];
    if (op === undefined) throw new Error('missing agents op');

    expect(op.content).toContain('- [Click\\](http://evil.test) ## Injected](#clickhttpeviltest--injected)');
    expect(op.content).toContain('## Click\\](http://evil.test) ## Injected');
    expect(op.content).toContain('RULE');
    expect(op.content).not.toContain('](http://evil.test)](#');
    expect(op.content).not.toContain('\n## Injected');
  });

  it('omits the block H1 when the existing file already has one', () => {
    const base = renderTargetContext(profile({ scripts: {} }), resolved([layeredFragment()]));
    const withH1 = agentsMdAdapter(base)[0];
    const withoutH1 = agentsMdAdapter({ ...base, omitBlockH1: new Set(['AGENTS.md']) })[0];
    if (withH1 === undefined || withoutH1 === undefined) throw new Error('missing agents op');

    expect(withH1.content.startsWith('# AGENTS.md\n')).toBe(true);
    expect(withoutH1.content.startsWith('# AGENTS.md\n')).toBe(false);
    expect(withoutH1.content.startsWith('Always-on rules')).toBe(true);
    expect(withoutH1.content).toContain('## Contents');
    expect(withoutH1.content).toBe(withH1.content.replace(/^# AGENTS\.md\n\n/u, ''));
  });
});
