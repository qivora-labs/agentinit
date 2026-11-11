import { describe, expect, it } from 'vitest';
import { AgentInitError } from '../../src/errors.js';
import {
  createWithBlock,
  findBlocks,
  hasOutsideAtxH1,
  removeBlock,
  upsertBlock,
} from '../../src/io/managed-block.js';

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

  it.each([
    {
      name: 'backtick fence',
      fence: '```markdown\n<!-- agentinit:begin id=example -->\ninner\n<!-- agentinit:end id=example -->\n```\n',
    },
    {
      name: 'tilde fence',
      fence: '~~~\n<!-- agentinit:begin id=example -->\n<!-- agentinit:end id=example -->\n~~~\n',
    },
    {
      name: 'longer closing fence',
      fence: '````md\n<!-- agentinit:begin id=example -->\n<!-- agentinit:end id=example -->\n`````\n',
    },
  ])('ignores marker lines inside a $name', ({ fence }) => {
    const before = `# Docs\n\n${fence}\n`;
    const after = '\n# More\n';
    const text = `${before}${block('core', 'generated\n')}${after}`;
    const blocks = findBlocks(text, FILE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe('core');
    const next = upsertBlock(text, 'core', 'updated\n', FILE);
    expect(next.startsWith(before)).toBe(true);
    expect(next.endsWith(after)).toBe(true);
    expect(next.slice(0, before.length)).toBe(before);
    expect(findBlocks(next, FILE)[0]?.inner).toBe('updated\n');
  });

  it('still finds managed blocks after an unclosed fence opener', () => {
    const before = '# Docs\n\n```\norphan fence line\n\n';
    const after = '\n# More\n';
    const text = `${before}${block('core', 'generated\n')}${after}`;
    const blocks = findBlocks(text, FILE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe('core');
    const next = upsertBlock(text, 'core', 'updated\n', FILE);
    expect(next.startsWith(before)).toBe(true);
    expect(next.endsWith(after)).toBe(true);
    expect(findBlocks(next, FILE)).toHaveLength(1);
    expect(findBlocks(next, FILE)[0]?.inner).toBe('updated\n');
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

  it('keeps a pre-existing trailing blank line and inserts its own separator', () => {
    const user = 'user line\n\n';
    expect(upsertBlock(user, 'core', 'generated\n', FILE)).toBe(`${user}\n${block('core', 'generated\n')}`);
  });

  it('puts the marker on the next line when the file has no trailing newline', () => {
    const user = 'user line';
    expect(upsertBlock(user, 'core', 'generated\n', FILE)).toBe(`${user}\n${block('core', 'generated\n')}`);
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
    expect(() => removeBlock(text, 'core', FILE)).toThrow(AgentInitError);
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

describe('block ids', () => {
  it.each([
    ['a hash', 'core#x'],
    ['a backslash', 'core\\x'],
  ])('rejects a block id with %s', (_name, id) => {
    expect(() => createWithBlock(id, 'x\n')).toThrow(AgentInitError);
    expect(() => upsertBlock('user\n', id, 'x\n', FILE)).toThrow(AgentInitError);
    try {
      upsertBlock('user\n', id, 'x\n', FILE);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return;
      expect(error.message).toContain(FILE);
      expect(error.message).toContain(id);
      expect(error.hint).toContain('#');
    }
  });

  it('treats a marker whose id contains # as user content', () => {
    const text = '<!-- agentinit:begin id=core#x -->\ninner\n<!-- agentinit:end id=core#x -->\n';
    expect(findBlocks(text, FILE)).toEqual([]);
  });
});

describe('removeBlock', () => {
  it.each([
    ['a trailing newline', 'user line\n'],
    ['an empty file', ''],
    ['CRLF', 'user line\r\n'],
    ['a trailing blank line', 'user line\n\n'],
    ['CRLF and a trailing blank line', 'user line\r\n\r\n'],
    ['no trailing newline', 'user line'],
  ])('leaves no leftover blank-line growth for a file with %s', (_name, original) => {
    let text = original;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      text = upsertBlock(text, 'core', `generated ${String(cycle)}\n`, FILE);
      expect(text.startsWith(original)).toBe(true);
      text = removeBlock(text, 'core', FILE);
      expect(text).toBe(original);
    }
  });

  it.each([
    ['front to back', ['core', 'claude']],
    ['back to front', ['claude', 'core']],
  ])('restores the file when two appended blocks are removed %s', (_name, order) => {
    const originals = ['user line\n', 'user line\n\n', 'user line', 'user line\r\n'];
    for (const original of originals) {
      let text = upsertBlock(original, 'core', 'A\n', FILE);
      text = upsertBlock(text, 'claude', 'B\n', FILE);
      for (const id of order) text = removeBlock(text, id, FILE);
      expect(text).toBe(original);
    }
  });

  it('keeps user content on both sides when the block is not at the end', () => {
    const before = '# Notes\n\n';
    const after = '\n# More\n';
    const text = `${before}${block('core', 'generated\n')}${after}`;
    expect(removeBlock(text, 'core', FILE)).toBe(`${before}${after}`);
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

  it('keeps a marker-like user line and the blank line in front of it', () => {
    const before = '# User doc\n\n';
    const after = '\n<!-- agentinit:begin id=example --> still notes\n';
    const text = `${before}${block('core', 'generated\n')}${after}`;
    expect(removeBlock(text, 'core', FILE)).toBe(`${before}${after}`);
  });

  it('does not leave a leading blank line when the first of two blocks is removed', () => {
    const text = upsertBlock(createWithBlock('core', 'A\n'), 'claude', 'B\n', FILE);
    expect(removeBlock(text, 'core', FILE)).toBe(createWithBlock('claude', 'B\n'));
  });

  it('does not leave a leading CRLF when the first of two blocks is removed', () => {
    const text = upsertBlock(block('core', 'A\r\n', '\r\n'), 'claude', 'B\n', FILE);
    expect(removeBlock(text, 'core', FILE)).toBe(block('claude', 'B\r\n', '\r\n'));
  });

  it('keeps the blank line before user text when the only block is removed', () => {
    const after = '\n# More\n';
    const text = `${block('core', 'generated\n')}${after}`;
    expect(removeBlock(text, 'core', FILE)).toBe(after);
  });
});

describe('hasOutsideAtxH1', () => {
  it.each([
    {
      name: 'user H1 before an empty file',
      text: '# AGENTS.md — my-app\n\nNotes.\n',
      expected: true,
    },
    {
      name: 'user H1 outside a managed block that also has an H1',
      text: `# Title\n\n${block('core', '# AGENTS.md\n\n## Contents\n')}`,
      expected: true,
    },
    {
      name: 'only the managed block H1',
      text: block('core', '# AGENTS.md\n\n## Contents\n'),
      expected: false,
    },
    {
      name: 'H1 only inside a fenced code block',
      text: 'Intro.\n\n```md\n# Not a heading\n```\n',
      expected: false,
    },
    {
      name: 'no H1 at all',
      text: 'Just prose.\n\n## Section\n',
      expected: false,
    },
  ])('detects $name', ({ text, expected }) => {
    expect(hasOutsideAtxH1(text, FILE)).toBe(expected);
  });
});

describe('block content', () => {
  it.each([
    ['a begin marker', '<!-- agentinit:begin id=other -->\n'],
    ['an end marker', '<!-- agentinit:end id=other -->\n'],
    ['an indented marker', '  <!-- agentinit:begin id=other -->\n'],
    ['a CRLF marker line', '<!-- agentinit:end id=other -->\r\nrest\n'],
  ])('rejects inner content that contains %s', (_name, inner) => {
    expect(() => upsertBlock('user\n', 'core', inner, FILE)).toThrow(AgentInitError);
    expect(() => createWithBlock('core', inner)).toThrow(AgentInitError);
    expect(() => upsertBlock(block('core', 'old\n'), 'core', inner, FILE)).toThrow(AgentInitError);
    try {
      upsertBlock('user\n', 'core', inner, FILE);
    } catch (error) {
      expect(error).toBeInstanceOf(AgentInitError);
      if (!(error instanceof AgentInitError)) return;
      expect(error.message).toContain(FILE);
      expect(error.message).toContain('marker line');
      expect(error.hint).toContain('own line');
    }
  });

  it('allows marker text that is not on its own line', () => {
    const inner = 'see <!-- agentinit:begin id=other --> inline\n';
    const next = upsertBlock('user\n', 'core', inner, FILE);
    expect(findBlocks(next, FILE)[0]?.inner).toBe(inner);
  });
});
