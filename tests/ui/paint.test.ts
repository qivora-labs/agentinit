import { describe, expect, it } from 'vitest';
import { paintDoctorReport, paintFileTree, paintGroupedList } from '../../src/ui/paint.js';
import { createTheme } from '../../src/ui/theme.js';

const plain = createTheme(false, true);
const color = createTheme(true, true, true);

describe('paintFileTree', () => {
  const tree = ['├── .cursor', '│   └── rules', '└── AGENTS.md (created)', 'notes.md (deleted)'].join('\n');

  it('leaves a pipe unchanged', () => {
    expect(paintFileTree(tree, plain)).toBe(tree);
    expect(paintFileTree('', plain)).toBe('');
  });

  it('colors the action and dims the branch', () => {
    const painted = paintFileTree(tree, color);
    expect(painted).toContain('\u001b[32mcreated');
    expect(painted).toContain('\u001b[31mdeleted');
    expect(painted).toContain('\u001b[2m├── ');
    expect(painted).toContain('AGENTS.md');
    expect(painted).toContain('.cursor');
  });
});

describe('paintGroupedList', () => {
  const list = 'library\n  vitest  Vitest\n\nworkflow\n  refactor  Refactor';

  it('leaves a pipe unchanged', () => {
    expect(paintGroupedList(list, plain)).toBe(list);
  });

  it('colors category titles and leaves rows plain', () => {
    const painted = paintGroupedList(list, color);
    const lines = painted.split('\n');
    expect(lines[0]).toContain('\u001b[36m');
    expect(lines[0]).toContain('library');
    expect(lines[1]).toBe('  vitest  Vitest');
    expect(lines[3]).toContain('workflow');
    expect(lines[4]).toBe('  refactor  Refactor');
  });
});

describe('paintDoctorReport', () => {
  const report = 'Missing\n  AGENTS.md is missing.\n    Fix: npx @agentinit/cli init';

  it('leaves a pipe unchanged', () => {
    expect(paintDoctorReport(report, plain)).toBe(report);
  });

  it('colors the group title and leaves the issue plain', () => {
    const lines = paintDoctorReport(report, color).split('\n');
    expect(lines[0]).toContain('\u001b[36m');
    expect(lines[0]).toContain('Missing');
    expect(lines[1]).toBe('  AGENTS.md is missing.');
    expect(lines[2]).toBe('    Fix: npx @agentinit/cli init');
  });
});
