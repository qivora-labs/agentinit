import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  dts: false,
  // platform: node would otherwise emit dist/cli.mjs; bin points at dist/cli.js.
  fixedExtension: false,
});
