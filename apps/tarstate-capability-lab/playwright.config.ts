import { existsSync } from 'node:fs';
import { defineConfig, devices } from 'playwright/test';

const port = 4387;
const selectedBrowsers = process.env.CAPABILITY_LAB_E2E_BROWSERS ?? 'chromium';
const chromiumExecutablePath = process.env.CAPABILITY_LAB_CHROMIUM_PATH
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const browserProjects = [
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(chromiumExecutablePath === undefined
        ? {}
        : { launchOptions: { executablePath: chromiumExecutablePath } })
    }
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] }
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] }
  }
] as const;

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry'
  },
  projects: selectedBrowsers === 'all'
    ? [...browserProjects]
    : browserProjects.filter((project) => project.name === selectedBrowsers),
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
