import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx', 'entrypoints/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});
