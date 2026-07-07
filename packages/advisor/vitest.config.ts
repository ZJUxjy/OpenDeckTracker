import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'advisor',
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
