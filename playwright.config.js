// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100, // Allow slight differences due to rendering
      threshold: 0.2, // Comparison threshold
    },
    timeout: 10000,
  },
  
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        screenshot: 'on',
      },
    },
    {
      name: 'desktop-large',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        screenshot: 'on',
      },
    },
    {
      name: 'tablet-portrait',
      use: {
        ...devices['iPad Mini'],
        viewport: { width: 768, height: 1024 },
        screenshot: 'on',
      },
    },
    {
      name: 'mobile-portrait',
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 },
        screenshot: 'on',
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
}); 