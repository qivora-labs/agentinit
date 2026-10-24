#!/usr/bin/env node
import { CANCELLED } from './exit-codes.js';
import { run } from './main.js';

// A listener replaces Node's default SIGINT exit, so exit explicitly.
process.on('SIGINT', () => {
  process.exitCode = CANCELLED;
  process.exit();
});

process.exitCode = await run(process.argv);
