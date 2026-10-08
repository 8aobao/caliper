import { defineConfig } from 'tsup';
import pkg from './package.json';

const define = { __CALIPER_VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  // React component + mount(): ESM and CJS with types, marked as a client component.
  {
    entry: { index: 'src/index.tsx' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['react', 'react-dom'],
    banner: { js: '"use client";' },
    define,
  },
  // Script-tag build, served by caliper-mcp at /caliper.js.
  {
    entry: { caliper: 'src/global.js' },
    format: ['iife'],
    minify: true,
    define,
  },
]);
