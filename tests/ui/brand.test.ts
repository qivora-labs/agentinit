import { describe, expect, it } from 'vitest';
import { formatBanner, formatClose } from '../../src/ui/brand.js';
import { createTheme } from '../../src/ui/theme.js';

const TAGLINE = 'rules for the agents in this repo';

describe('formatBanner', () => {
  it('prints the name and tagline with no color and no ASCII art', () => {
    const banner = formatBanner(createTheme(false, true));
    expect(banner).toBe(`┌  agentinit\n│  ${TAGLINE}`);
    expect(banner).not.toContain('\u001b[');
  });

  it('uses ASCII bars when Unicode is off', () => {
    expect(formatBanner(createTheme(false, false))).toBe(`+  agentinit\n|  ${TAGLINE}`);
  });

  it('colors the name when the terminal allows it', () => {
    const banner = formatBanner(createTheme(true, true, true));
    expect(banner).toContain('agentinit');
    expect(banner).toContain(TAGLINE);
    expect(banner).toContain('\u001b[');
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
