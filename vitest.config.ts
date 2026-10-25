import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    env: { KITTA_USAGE_FILE: 'off' }, // token telemetry stays in memory during tests
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/shared/**/*.test.{ts,tsx}', 'tests/server/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: { name: 'ui', environment: 'jsdom', include: ['tests/ui/**/*.test.tsx'] },
      },
    ],
  },
});
