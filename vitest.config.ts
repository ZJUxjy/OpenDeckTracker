import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'root',
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
