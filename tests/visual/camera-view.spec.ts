import { test, expect } from '@playwright/test';
import {
  waitForCamera,
  openSettings,
  openStyleSelector,
  waitForStableState,
  mockCameraPermissions,
  cleanup,
  TEST_SERVER_URL
} from '../helpers/test-utils';

// IMPORTANT: Always use the dedicated test server (port 5176)
// Main dev server runs on port 5175 and should not be used for tests
test.describe('Camera View Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockCameraPermissions(page);
    await page.goto(TEST_SERVER_URL);
    await waitForCamera(page);
    await waitForStableState(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  test('camera view initial state matches snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('camera-initial.png', {
      mask: [page.locator('video#webcam')], // Mask out camera feed which changes
      animations: 'disabled',
      timeout: 10000
    });
  });

  test('style selector dropdown matches snapshot', async ({ page }) => {
    await openStyleSelector(page);
    await waitForStableState(page);
    await expect(page).toHaveScreenshot('style-dropdown.png', {
      animations: 'disabled',
      timeout: 10000
    });
  });

  test('settings panel matches snapshot', async ({ page }) => {
    await openSettings(page);
    await waitForStableState(page);
    await expect(page).toHaveScreenshot('settings-panel.png', {
      animations: 'disabled',
      timeout: 10000
    });
  });

  test('countdown overlay matches snapshot', async ({ page }) => {
    await page.click('.camera-shutter-btn');
    await page.waitForSelector('.countdown-overlay', { state: 'visible' });
    await waitForStableState(page);
    await expect(page).toHaveScreenshot('countdown-overlay.png', {
      animations: 'disabled',
      timeout: 10000
    });
  });
}); 