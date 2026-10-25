import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:8081', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHROME_CHANNEL },
    },
    {
      name: 'mobile-web',
      use: { ...devices['Pixel 7'], channel: process.env.PLAYWRIGHT_CHROME_CHANNEL },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @uniflow/server start',
      url: 'http://127.0.0.1:3000/api/v1/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'pnpm dev:web',
      url: 'http://localhost:8081',
      reuseExistingServer: !process.env.CI,
      timeout: 90000,
    },
  ],
});
