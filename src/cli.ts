#!/usr/bin/env node
import { CANCELLED } from './exit-codes.js';
import { handleSigint, isInterrupted } from './interrupt.js';
import { run } from './main.js';

let atomicWrite = false;

// A listener replaces Node's default SIGINT exit, so exit explicitly.
// During the temp-file window, defer exit so the write can delete temps.
process.on('SIGINT', () => {
  process.exitCode = CANCELLED;
  handleSigint((code) => {
    process.exit(code);
  }, atomicWrite);
});

const code = await run(process.argv, undefined, {
  shouldStop: () => isInterrupted(),
  onAtomicWrite(active) {
    atomicWrite = active;
  },
});
process.exitCode = isInterrupted() ? CANCELLED : code;
