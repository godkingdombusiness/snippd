import { defineConfig } from '@playwright/test';

/**
 * Web smoke tests (Expo: `npx expo start --web --port 8082`).
 * Run: `PLAYWRIGHT_BASE_URL=http://localhost:8082 npx playwright test`
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8082',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
