import { describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import { createWithBlock, findBlocks, removeBlock, upsertBlock } from '../../src/io/managed-block.js';

const FILE = 'AGENTS.md';

function block(id: string, inner: string, ending: '\n' | '\r\n' = '\n'): string {
  const body = inner.length === 0 || inner.endsWith(ending) ? inner : `${inner}${ending}`;
  return `<!-- agentinit:begin id=${id} -->${ending}${body}<!-- agentinit:end id=${id} -->${ending}`;
}

function assertOutsideUnchanged(before: string, after: string, original: string, next: string): void {
  expect(next.startsWith(before)).toBe(true);
  expect(next.endsWith(after)).toBe(true);
  expect(next.slice(0, before.length)).toBe(before);
  expect(next.slice(next.length - after.length)).toBe(after);
  expect(before + after).not.toBe(original);
}

describe('findBlocks', () => {
  it('returns positions and inner content', () => {
    const text = `notes\n${block('core', 'generated\n')}`;
    const blocks = findBlocks(text, FILE);
    expect(blocks).toHaveLength(1);
    const found = blocks[0];
    if (found === undefined) return;
    expect(found.id).toBe('core');
    expect(found.inner).toBe('generated\n');
    expect(text.slice(found.start, found.end)).toBe(block('core', 'generated\n'));
    expect(text.slice(found.innerStart, found.innerEnd)).toBe('generated\n');
  });
});

describe('upsertBlock', () => {
  it.each([
    {
      name: 'prose around the block',
      before: '# Notes\n\nKeep this.\n',
      after: '\n# More\nStill here.\n',
    },
    {
      name: 'unicode and punctuation',
      before: 'café — "quotes" `code`\n',
      after: '\nline two\t\n',
    },
    {
      name: 'inline marker text is user content',
      before: 'see <!-- agentinit:begin id=core --> inline\n',
      after: '\nend <!-- agentinit:end id=core --> trailing\n',
    },
    {
      name: 'blank lines the user wrote',
      before: '\n\n',
      after: '\n\n\n',
    },
  ])('leaves surrounding user content byte-for-byte identical ($name)', ({ before, after }) => {
    const original = `${before}${block('core', 'old inner\n')}${after}`;
    const next = upsertBlock(original, 'core', 'new inner\n', FILE);
    assertOutsideUnchanged(before, after, original, next);
    const found = findBlocks(next, FILE)[0];
    expect(found?.inner).toBe('new inner\n');
    expect(next.slice(0, before.length)).toBe(original.slice(0, before.length));
    expect(next.slice(next.length - after.length)).toBe(original.slice(original.length - after.length));
  });

  it('keeps every byte outside the inner span, including the markers', () => {
    const original = `user\n${block('core', 'old\n')}tail\n`;
    const blocks = findBlocks(original, FILE);
    const existing = blocks[0];
    if (existing === undefined) throw new Error('expected a block');
    const next = upsertBlock(original, 'core', 'replaced\n', FILE);
    expect(next.slice(0, existing.innerStart)).toBe(original.slice(0, existing.innerStart));
    expect(next.slice(next.length - (original.length - existing.innerEnd))).toBe(original.slice(existing.innerEnd));
  });

  it('appends a missing block after one blank line without rewriting the prefix', () => {
    const user = 'user line\n';
    const next = upsertBlock(user, 'core', 'generated\n', FILE);
    expect(next.startsWith(user)).toBe(true);
    expect(next).toBe(`${user}\n${block('core', 'generated\n')}`);
  });

  it('does not add a second blank line when the file already ends with one', () => {
    const user = 'user line\n\n';
    expect(upsertBlock(user, 'core', 'generated\n', FILE)).toBe(`${user}${block('core', 'generated\n')}`);
  });

  it('keeps CRLF everywhere after an upsert', () => {
    const user = 'user line\r\n';
    const appended = upsertBlock(user, 'core', 'generated\n', FILE);
    expect(appended.startsWith(user)).toBe(true);
    expect(appended.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(appended).toBe(`${user}\r\n${block('core', 'generated\r\n', '\r\n')}`);

    const existing = `${user}\r\n${block('core', 'old\r\n', '\r\n')}tail\r\n`;
    const replaced = upsertBlock(existing, 'core', 'new\n', FILE);
    expect(replaced.startsWith(`${user}\r\n`)).toBe(true);
    expect(replaced.endsWith('tail\r\n')).toBe(true);
    expect(replaced.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(findBlocks(replaced, FILE)[0]?.inner).toBe('new\r\n');
  });

  it('matches createWithBlock for an empty file', () => {
    expect(upsertBlock('', 'core', 'generated\n', FILE)).toBe(createWithBlock('core', 'generated\n'));
  });
});

describe('createWithBlock', () => {
  it('writes an LF block for a new file', () => {
    expect(createWithBlock('core', 'hello')).toBe(block('core', 'hello\n'));
    expect(createWithBlock('core', 'a\r\nb\r\n')).toBe(block('core', 'a\nb\n'));
  });
});

describe('malformed markers', () => {
  it.each([
    ['begin without end', '<!-- agentinit:begin id=core -->\ncontent\n', 'missing its end marker'],
    ['end without begin', '<!-- agentinit:end id=core -->\n', 'without a begin marker'],
    [
      'nested',
      '<!-- agentinit:begin id=core -->\n<!-- agentinit:begin id=other -->\n<!-- agentinit:end id=other -->\n<!-- agentinit:end id=core -->\n',
      'nested inside',
    ],
    [
      'duplicate ids',
      `${block('core', 'one\n')}${block('core', 'two\n')}`,
      'more than once',
    ],
    [
      'mismatched ids',
      '<!-- agentinit:begin id=core -->\n<!-- agentinit:end id=other -->\n',
      'ends with marker id "other"',
    ],
  ])('throws a readable error for %s', (_name, text, detail) => {
    expect(() => findBlocks(text, FILE)).toThrow(AgentInitError);
    expect(() => upsertBlock(text, 'core', 'x\n', FILE)).toThrow(AgentInitError);
    try {
      findBlocks(text, FILE);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return;
      expect(error.message).toContain(FILE);
      expect(error.message).toContain(detail);
      expect(error.hint).toContain('begin marker');
    }
  });
});

describe('removeBlock', () => {
  it('leaves no leftover blank-line growth after repeated add/remove cycles', () => {
    const originals = ['user line\n', '', 'user line\r\n'];
    for (const original of originals) {
      let text = original;
      for (let cycle = 0; cycle < 5; cycle += 1) {
        text = upsertBlock(text, 'core', `generated ${String(cycle)}\n`, FILE);
        expect(text.startsWith(original)).toBe(true);
        text = removeBlock(text, 'core', FILE);
        expect(text).toBe(original);
      }
    }
  });

  it('keeps user content on both sides when the block is not at the end', () => {
    const before = '# Notes\n\n';
    const after = '\n# More\n';
    const text = `${before}${block('core', 'generated\n')}${after}`;
    expect(removeBlock(text, 'core', FILE)).toBe(`${before}${after}`);
  });

  it('drops one pre-existing trailing blank line when the removed block is at the end', () => {
    const text = `user line\n\n${block('core', 'generated\n')}`;
    expect(removeBlock(text, 'core', FILE)).toBe('user line\n');
  });

  it('gives a file with no trailing newline a single trailing newline after an add/remove cycle', () => {
    const removed = removeBlock(upsertBlock('user line', 'core', 'generated\n', FILE), 'core', FILE);
    expect(removed).toBe('user line\n');
  });

  it('throws when the id is not in the file', () => {
    expect(() => removeBlock('user\n', 'core', FILE)).toThrow(AgentInitError);
    try {
      removeBlock('user\n', 'core', FILE);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return;
      expect(error.message).toContain(FILE);
      expect(error.message).toContain('was not found');
    }
  });
});
