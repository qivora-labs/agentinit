import { describe, expect, it } from 'vitest';
import { formatBanner } from '../../src/ui/brand.js';
import { createLogger } from '../../src/ui/logger.js';
import { createTheme } from '../../src/ui/theme.js';
import { captureStream } from '../helpers/run.js';

describe('createLogger', () => {
  it('sends progress to stdout and warnings to stderr', () => {
    const stdout = captureStream();
    const stderr = captureStream();
    const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, false);
    logger.info('hello');
    logger.success('ok');
    logger.step('next');
    logger.warn('careful');
    logger.error('bad');

    expect(stdout.text()).toBe('hello\nok\nnext\n');
    expect(stderr.text()).toBe('careful\nbad\n');
  });

  it('keeps stdout empty in json mode', () => {
    const stdout = captureStream(true);
    const stderr = captureStream();
    const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, true);
    logger.info('hello');
    logger.success('ok');
    logger.step('next');
    logger.warn('careful');
    logger.error('bad');

    expect(stdout.text()).toBe('');
    expect(stderr.text()).toContain('hello');
    expect(stderr.text()).toContain('ok');
    expect(stderr.text()).toContain('next');
    expect(stderr.text()).toContain('careful');
    expect(stderr.text()).toContain('bad');
  });

  it('colors tty output with picocolors', () => {
    const stdout = captureStream(true);
    const stderr = captureStream(true);
    const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, false);
    logger.info('hello');
    logger.step('next');
    logger.warn('careful');
    expect(stdout.text()).toContain('\u001b[');
    expect(stdout.text()).toContain('●');
    expect(stdout.text()).toContain('hello');
    expect(stdout.text()).toContain('◇');
    expect(stdout.text()).not.toContain('\u001b[35m');
    expect(stderr.text()).toContain('▲');
    expect(stderr.text()).toContain('careful');
  });

  it('does not prefix a multiline block on a tty', () => {
    const stdout = captureStream(true);
    const logger = createLogger({ stdout: stdout.stream, stderr: captureStream().stream }, false);
    logger.info('├── AGENTS.md (created)\n└── ARCHITECTURE.md (updated)');
    expect(stdout.text()).toBe('├── AGENTS.md (created)\n└── ARCHITECTURE.md (updated)\n');
  });

  it('prints a pipe status line once and skips the wordmark', () => {
    const stdout = captureStream();
    const logger = createLogger({ stdout: stdout.stream, stderr: captureStream().stream }, false);
    logger.open();
    logger.close('Already up to date.');
    logger.close('Rules written.', { ttyOnly: true });
    expect(stdout.text()).toBe('Already up to date.\n');
  });

  it('opens the wordmark once and closes with the status once', () => {
    const stdout = captureStream(true);
    const logger = createLogger({ stdout: stdout.stream, stderr: captureStream().stream }, false, {
      unicode: true,
      color: false,
    });
    logger.open();
    logger.open();
    logger.close('Rules written.');
    const banner = formatBanner(createTheme(true, true, false));
    expect(stdout.text()).toBe(`${banner}\n\n└  Rules written.\n`);
    expect(stdout.text().split('rules for the agents in this repo')).toHaveLength(2);
  });

  it('uses ASCII bars when Unicode is off', () => {
    const stdout = captureStream(true);
    const logger = createLogger({ stdout: stdout.stream, stderr: captureStream().stream }, false, {
      unicode: false,
      color: false,
    });
    logger.open();
    logger.info('hello');
    expect(stdout.text()).toBe('+  AGENT  INIT\n|  rules for the agents in this repo\n\n*  hello\n');
  });

  it('leaves json mode plain on a tty', () => {
    const stdout = captureStream(true);
    const stderr = captureStream(true);
    const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, true);
    logger.open();
    logger.info('hello');
    logger.close('Rules written.');
    expect(stdout.text()).toBe('');
    expect(stderr.text()).toBe('hello\n');
    expect(stderr.text()).not.toContain('\u001b[');
  });

  it('closes an error on stderr once', () => {
    const stdout = captureStream(true);
    const stderr = captureStream(true);
    const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, false, { color: true });
    logger.open();
    logger.close('Not a directory', { stream: 'stderr', tone: 'error' });
    expect(stderr.text().split('Not a directory')).toHaveLength(2);
    expect(stderr.text()).toContain('\u001b[31m');
    expect(stdout.text()).not.toContain('Not a directory');
  });
});
