import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  entry: { cli: 'src/cli.js' },
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  clean: true,
  // Ship the toolbar's script-tag build alongside, served at /caliper.js.
  onSuccess: async () => {
    mkdirSync('dist', { recursive: true });
    copyFileSync('../caliper-dev/dist/caliper.global.js', 'dist/caliper.global.js');
  },
});
