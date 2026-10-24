import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/ui/logger.js';
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
    const stderr = captureStream();
    const logger = createLogger({ stdout: stdout.stream, stderr: stderr.stream }, false);
    logger.info('hello');
    expect(stdout.text()).toContain('\u001b[');
    expect(stdout.text()).toContain('hello');
  });
});
