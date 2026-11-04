import { describe, expect, it } from 'vitest';
import { formatBanner, formatClose, formatHeader, underRail, PRODUCT_NAME, TAGLINE } from '../../src/ui/brand.js';
import { createTheme } from '../../src/ui/theme.js';

const NEEDLE = [
  '                 Q I V O R A   L A B S',
  '',
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
    expect(formatBanner(createTheme(false, false))).toBe(`Qivora Labs\n\n+  AGENT  INIT\n|  ${TAGLINE}`);
  });

  it('paints AGENT in the foreground and INIT in cyan', () => {
    const plain = formatBanner(createTheme(true, true, false));
    const banner = formatBanner(createTheme(true, true, true));
    expect(stripColor(banner)).toBe(plain);
    expect(banner).toContain('\u001b[1m█████\u001b[22m    \u001b[36m█');
    expect(banner).toContain('\u001b[90mQ I V O R A   L A B S');
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

describe('formatHeader', () => {
  it('prints the product name then the command on a rail', () => {
    expect(formatHeader(createTheme(false, true), 'doctor')).toBe(`┌  ${PRODUCT_NAME} doctor\n│`);
    expect(formatHeader(createTheme(false, false), 'list')).toBe(`+  ${PRODUCT_NAME} list\n|`);
  });

  it('paints the product name in the foreground and the command in gray', () => {
    const line = formatHeader(createTheme(true, true, true), 'doctor');
    expect(stripColor(line)).toBe(`┌  ${PRODUCT_NAME} doctor\n│`);
    expect(line).toContain('\u001b[1magentinit\u001b[22m');
    expect(line).toContain('\u001b[90mdoctor');
  });
});

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

describe('underRail', () => {
  it('prefixes every line with the Clack bar', () => {
    const theme = createTheme(false, true);
    expect(underRail('├── a\n└── b', theme)).toBe('│  ├── a\n│  └── b');
  });
});
