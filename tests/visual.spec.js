import { test, expect } from '@playwright/test';

test.describe('Visual regression tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for any initial animations or loading states
    await page.waitForLoadState('networkidle');
  });

  test('initial overlay view', async ({ page }) => {
    // Wait for the initial overlay to be visible
    await page.waitForSelector('[data-testid="initial-overlay"]', { state: 'visible' });
    
    // Take a screenshot of the initial state
    await expect(page).toHaveScreenshot('initial-overlay.png', {
      mask: [page.locator('time'), page.locator('img[src*="data:"]')],
      maxDiffPixelRatio: 0.01
    });
  });

  test('camera view', async ({ page }) => {
    // Click the camera start button
    await page.click('[data-testid="start-camera-button"]');
    
    // Wait for camera permissions dialog and handle it
    await page.evaluate(() => {
      // Mock getUserMedia to avoid permission dialogs in tests
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      
      navigator.mediaDevices.getUserMedia = async () => {
        const mockStream = {
          getTracks: () => [{
            stop: () => {}
          }]
        };
        return mockStream;
      };
    });
    
    // Wait for camera view to be visible
    await page.waitForSelector('[data-testid="camera-view"]', { state: 'visible' });
    
    await expect(page).toHaveScreenshot('camera-view.png', {
      mask: [page.locator('video'), page.locator('img[src*="data:"]')],
      maxDiffPixelRatio: 0.01
    });
  });

  test('style dropdown', async ({ page }) => {
    // Open style dropdown
    await page.click('[data-testid="style-dropdown-button"]');
    
    // Wait for dropdown to be visible
    await page.waitForSelector('[data-testid="style-dropdown"]', { state: 'visible' });
    
    await expect(page).toHaveScreenshot('style-dropdown.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('settings panel', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    
    // Wait for settings panel
    await page.waitForSelector('[data-testid="settings-panel"]', { state: 'visible' });
    
    await expect(page).toHaveScreenshot('settings-panel.png', {
      maxDiffPixelRatio: 0.01
    });
  });
}); 