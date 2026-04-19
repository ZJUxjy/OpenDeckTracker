import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'hearthdb',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
