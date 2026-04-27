import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// vitest 2.x ships vite 5 plugin types but desktop uses vite 6 — types are
// structurally compatible at runtime; cast through `unknown` to bridge them.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
export default defineConfig({
  plugins: [react() as unknown as any],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/renderer/tests/**/*.test.{ts,tsx}',
      'src/main/**/*.test.ts',
      'src/preload/index.test.ts',
    ],
    setupFiles: ['src/renderer/tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
});
