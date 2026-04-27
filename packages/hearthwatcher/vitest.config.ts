import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'hearthwatcher',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
