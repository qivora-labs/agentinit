import type { RunContext } from '../context.js';
import { ERROR } from '../exit-codes.js';
import type { Logger } from '../ui/logger.js';

export function list(_ctx: RunContext, logger: Logger): number {
  logger.error('not implemented yet');
  return ERROR;
}
