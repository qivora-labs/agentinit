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
});
