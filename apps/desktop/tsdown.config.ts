import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['./main.ts'],
    format: 'esm',
    outDir: 'dist/main',
    deps: {
      neverBundle: ['electron'],
    },
  },
  {
    entry: ['./preload.ts'],
    format: 'cjs',
    outDir: 'dist/main',
    clean: false,
    deps: {
      neverBundle: ['electron'],
    },
  },
])
