import { describe, expect, it } from 'vitest';
import {
  TYPESCRIPT_ONLY_MARKER,
  applyLanguageExamples,
  exampleLanguageFamily,
  hasJavaScriptContractFence,
  hasTypeScriptContractFence,
  hasTypescriptOnlyMarker,
} from '../../src/plan/language-examples.js';

const TS_FENCE = ['```ts', 'const typed: number = 1;', '```'].join('\n');
const JS_FENCE = ['```js', 'const plain = 1;', '```'].join('\n');

describe('exampleLanguageFamily', () => {
  it.each([
    ['typescript-strict', 'typescript'],
    ['typescript', 'typescript'],
    ['javascript', 'javascript'],
    ['javascript-jsdoc', 'javascript'],
  ] as const)('%s → %s', (language, family) => {
    expect(exampleLanguageFamily(language)).toBe(family);
  });
});

describe('applyLanguageExamples', () => {
  it('keeps the TypeScript Contract fence and drops the JavaScript fence', () => {
    const body = ['## Contract', TS_FENCE, '', JS_FENCE].join('\n');
    expect(applyLanguageExamples(body, 'typescript')).toBe(['## Contract', TS_FENCE].join('\n'));
  });

  it('keeps the JavaScript Contract fence and drops the TypeScript fence', () => {
    const body = ['## Contract', TS_FENCE, '', JS_FENCE].join('\n');
    expect(applyLanguageExamples(body, 'javascript')).toBe(['## Contract', JS_FENCE].join('\n'));
  });

  it('matches previous single-fence TypeScript content when the TS fence is unchanged', () => {
    const single = ['## Contract', TS_FENCE].join('\n');
    const dual = ['## Contract', TS_FENCE, '', JS_FENCE].join('\n');
    expect(applyLanguageExamples(dual, 'typescript')).toBe(single);
  });

  it('strips a fragment-level TypeScript-only marker for both families', () => {
    const body = [TYPESCRIPT_ONLY_MARKER, '## Directives', '- **ALWAYS** keep the boundary.', '', '## Contract', TS_FENCE].join(
      '\n',
    );
    const expected = ['## Directives', '- **ALWAYS** keep the boundary.', '', '## Contract', TS_FENCE].join('\n');
    expect(applyLanguageExamples(body, 'typescript')).toBe(expected);
    expect(applyLanguageExamples(body, 'javascript')).toBe(
      ['## Directives', '- **ALWAYS** keep the boundary.'].join('\n'),
    );
  });

  it('drops a TypeScript-only directive line for JavaScript and strips the marker for TypeScript', () => {
    const directive = `- **ALWAYS** use \`z.infer\`. ${TYPESCRIPT_ONLY_MARKER}`;
    const body = ['## Directives', directive, '- **ALWAYS** set defaultValues.', '', '## Contract', TS_FENCE].join('\n');
    expect(applyLanguageExamples(body, 'typescript')).toBe(
      [
        '## Directives',
        '- **ALWAYS** use `z.infer`.',
        '- **ALWAYS** set defaultValues.',
        '',
        '## Contract',
        TS_FENCE,
      ].join('\n'),
    );
    expect(applyLanguageExamples(body, 'javascript')).toBe(
      ['## Directives', '- **ALWAYS** set defaultValues.'].join('\n'),
    );
  });

  it('keeps non-language fences for both families', () => {
    const json = ['```json', '{ "ok": true }', '```'].join('\n');
    const body = ['## Notes', json].join('\n');
    expect(applyLanguageExamples(body, 'typescript')).toBe(body);
    expect(applyLanguageExamples(body, 'javascript')).toBe(body);
  });

  it('resolves prose extensions only after placeholders run (body still has {{ext}})', () => {
    const body = ['Export from `index.{{ext}}`.', '', '## Contract', TS_FENCE].join('\n');
    expect(applyLanguageExamples(body, 'typescript')).toContain('index.{{ext}}');
  });
});

describe('hasJavaScriptContractFence / hasTypeScriptContractFence / hasTypescriptOnlyMarker', () => {
  it('detects a JavaScript Contract fence', () => {
    expect(hasJavaScriptContractFence(['## Contract', JS_FENCE].join('\n'))).toBe(true);
    expect(hasJavaScriptContractFence(['## Contract', TS_FENCE].join('\n'))).toBe(false);
    expect(hasJavaScriptContractFence(['## Other', JS_FENCE].join('\n'))).toBe(false);
  });

  it('detects a TypeScript Contract fence', () => {
    expect(hasTypeScriptContractFence(['## Contract', TS_FENCE].join('\n'))).toBe(true);
    expect(hasTypeScriptContractFence(['## Contract', JS_FENCE].join('\n'))).toBe(false);
    expect(hasTypeScriptContractFence(['## Other', TS_FENCE].join('\n'))).toBe(false);
  });

  it('detects a fragment-level TypeScript-only marker', () => {
    expect(hasTypescriptOnlyMarker(`${TYPESCRIPT_ONLY_MARKER}\n## Contract\n${TS_FENCE}`)).toBe(true);
    expect(hasTypescriptOnlyMarker(['## Contract', TS_FENCE].join('\n'))).toBe(false);
  });

  it('ignores a TypeScript-only marker that trails a directive line', () => {
    const body = [
      `- **ALWAYS** use \`z.infer\`. ${TYPESCRIPT_ONLY_MARKER}`,
      '',
      '## Contract',
      TS_FENCE,
    ].join('\n');
    expect(hasTypescriptOnlyMarker(body)).toBe(false);
  });
});
