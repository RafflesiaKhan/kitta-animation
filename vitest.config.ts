import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Token telemetry stays in memory; tests never open the real VoiceStudio app.
    env: { KITTA_USAGE_FILE: 'off', VOICESTUDIO_APP: '/nonexistent/VoiceStudio.app' },
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
