import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
