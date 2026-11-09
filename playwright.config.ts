import { defineConfig, devices } from '@playwright/test';

// The browser tests use the developer tools (skip years, end a life), so they run against
// their own dev server built with the explicit flag, on a separate port from everyday dev.
const PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_ENABLE_DEV_TOOLS: 'true' },
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } },
  ],
});
