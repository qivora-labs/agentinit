import { describe, expect, it } from 'vitest';
import { formatBanner, formatClose, TAGLINE } from '../../src/ui/brand.js';
import { createTheme } from '../../src/ui/theme.js';

const NEEDLE = [
  '  █     ████  █████  █   █  █████    █  █   █  █  █████',
  ' █ █   █      █      ██  █    █      █  ██  █  █    █  ',
  '█████  █ ███  ███    █ █ █    █      █  █ █ █  █    █  ',
  '█   █  █   █  █      █  ██    █      █  █  ██  █    █  ',
  '█   █   ████  █████  █   █    █      █  █   █  █    █  ',
  '                   ────────◆────────',
  `           ${TAGLINE}`,
].join('\n');

describe('formatBanner', () => {
  it('draws the Needle mark with AGENT and INIT separated', () => {
    const banner = formatBanner(createTheme(false, true));
    expect(banner).toBe(NEEDLE);
    expect(banner).not.toContain('\u001b[');
    expect(banner.split('█████    █')).toHaveLength(2);
  });

  it('prints AGENT and INIT in text when Unicode is off', () => {
    expect(formatBanner(createTheme(false, false))).toBe(`+  AGENT  INIT\n|  ${TAGLINE}`);
  });

  it('paints AGENT in the foreground and INIT in cyan', () => {
    const plain = formatBanner(createTheme(true, true, false));
    const banner = formatBanner(createTheme(true, true, true));
    expect(stripColor(banner)).toBe(plain);
    expect(banner).toContain('\u001b[1m█████\u001b[22m    \u001b[36m█');
    expect(banner).toContain('\u001b[36m◆');
    expect(banner).toContain(TAGLINE);
  });
});

function stripColor(text: string): string {
  let plain = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '\u001b') {
      plain += char ?? '';
      continue;
    }
    const end = text.indexOf('m', index);
    index = end === -1 ? text.length : end;
  }
  return plain;
}

describe('formatClose', () => {
  it('closes with the message once', () => {
    expect(formatClose(createTheme(false, true), 'Rules written.')).toBe('└  Rules written.');
    expect(formatClose(createTheme(false, false), 'Rules written.')).toBe('+  Rules written.');
  });

  it('paints an error close in red when color is on', () => {
    const line = formatClose(createTheme(true, true, true), 'Not a directory', 'error');
    expect(line).toContain('Not a directory');
    expect(line.split('Not a directory')).toHaveLength(2);
    expect(line).toContain('\u001b[31m');
  });
});
