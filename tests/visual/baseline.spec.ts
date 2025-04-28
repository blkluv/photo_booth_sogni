import { test, expect } from '@playwright/test';
import { waitForStableState, waitForCamera, mockCameraPermissions, TEST_SERVER_URL } from '../helpers/test-utils';

// IMPORTANT: Always use the dedicated test server (port 5176)
// Main dev server runs on port 5175 and should not be used for tests
test.describe('Baseline UI State', () => {
  test.beforeEach(async ({ page }) => {
    // Mock camera permissions before navigating to prevent permission dialogs
    await mockCameraPermissions(page);
    // Use the dedicated test server
    await page.goto(TEST_SERVER_URL);
    // Increase timeout for camera initialization
    await waitForCamera(page);
    // Ensure camera is fully visible and stabilized
    await page.waitForSelector('video#webcam', { state: 'visible', timeout: 15000 });
    // Wait for UI to stabilize
    await waitForStableState(page);
    // Additional wait to ensure camera feed is stable
    await page.waitForTimeout(1000);
  });

  test('capture main UI sections', async ({ page }) => {
    // First verify the camera container is present
    const cameraContainer = page.locator('.camera-container');
    await expect(cameraContainer).toBeVisible({ timeout: 10000 });
    
    // Mask the actual camera feed since it changes
    await expect(page).toHaveScreenshot('baseline-full-view.png', {
      mask: [page.locator('video#webcam')],
      maxDiffPixelRatio: 0.01,
      timeout: 15000
    });

    // Capture style selector and controls
    await expect(page.locator('.bottom-controls')).toHaveScreenshot('baseline-controls.png', {
      maxDiffPixelRatio: 0.01,
      timeout: 15000
    });

    // Open and capture style dropdown
    await page.click('[class*="styleButton"]');
    await waitForStableState(page);
    await expect(page.locator('[class*="styleDropdown"]')).toHaveScreenshot('baseline-style-dropdown.png', {
      maxDiffPixelRatio: 0.01,
      timeout: 15000
    });

    // Open and capture settings panel
    await page.click('[class*="configButton"]');
    await waitForStableState(page);
    await expect(page.locator('.control-overlay.visible')).toHaveScreenshot('baseline-settings-panel.png', {
      maxDiffPixelRatio: 0.01,
      timeout: 15000
    });

    // Take a photo and capture photo grid
    await page.click('[class*="shutterButton"]');
    await page.waitForTimeout(4000); // Wait for countdown and capture
    await waitForStableState(page);
    await expect(page.locator('.film-strip-container')).toHaveScreenshot('baseline-photo-grid.png', {
      maxDiffPixelRatio: 0.01,
      timeout: 15000
    });

    // Test responsive layouts
    for (const viewport of [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1280, height: 720, name: 'desktop' }
    ]) {
      await page.setViewportSize(viewport);
      await waitForStableState(page);
      await expect(page).toHaveScreenshot(`baseline-full-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        timeout: 15000,
        mask: [page.locator('video#webcam')] // Mask camera feed in all screenshots
      });
    }
  });
}); 