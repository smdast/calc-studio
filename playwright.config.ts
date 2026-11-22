import { defineConfig } from '@playwright/test';

const url = 'http://127.0.0.1:5173';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  use: {
    baseURL: url,
    channel: process.env.CALCULATOR_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
  },
  webServer: { command: 'npm run dev', url, reuseExistingServer: true, timeout: 30000 },
  reporter: 'list',
});
