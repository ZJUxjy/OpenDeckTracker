import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'hearthmirror',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
