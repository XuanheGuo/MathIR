import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
