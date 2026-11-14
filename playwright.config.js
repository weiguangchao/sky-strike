import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {}, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
