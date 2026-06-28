import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// In the sandboxed dev environment a chromium build is preinstalled at a fixed
// path (a different revision than this @playwright/test version manages), so we
// point at it directly. In CI the path is absent and Playwright uses the browser
// installed via `npx playwright install chromium`.
const localChromium = '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(localChromium) ? localChromium : undefined;

/**
 * E2E config. Tests drive the built renderer (served by `vite preview`) with a
 * mocked `window.api`, so they exercise real cross-component React flows — like
 * the visual workflow editor — without needing a full Electron + Windows runtime.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
