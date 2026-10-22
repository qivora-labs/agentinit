#!/usr/bin/env node
// Inlined by tsdown. Reading package.json from disk would miss the packed binary.
import pkg from '../package.json' with { type: 'json' };

if (process.argv.includes('--version')) {
  console.log(pkg.version);
}
