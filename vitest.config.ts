import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Minimal stub so route handlers can be tested without the Next.js runtime
      'next/server': path.resolve(__dirname, 'test/mocks/next-server.ts'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'app/api/**'],
      exclude: ['app/api/auth/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
