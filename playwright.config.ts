import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    browserName: 'chromium',
    headless: true,
    // Windows Headless Shell defaults to slow SwiftShader here. Use the GPU
    // through ANGLE without changing the game renderer or opening a window.
    launchOptions: {
      args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [],
    },
    screenshot: 'only-on-failure',
  },
  outputDir: 'artifacts/playwright',
  webServer: {
    command:
      'node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
