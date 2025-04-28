import { test, expect } from '@playwright/test';
import {
  waitForCamera,
  takePhotoAndWaitForGrid,
  waitForGeneratedPhoto,
  waitForStableState,
  verifyVisible,
  mockCameraPermissions,
  cleanup,
  TEST_SERVER_URL
} from '../helpers/test-utils';

// IMPORTANT: Always use the dedicated test server (port 5176)
// Main dev server runs on port 5175 and should not be used for tests
test.describe('Photo Grid Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockCameraPermissions(page);
    await page.goto(TEST_SERVER_URL);
    await waitForCamera(page);
    await takePhotoAndWaitForGrid(page);
    await waitForStableState(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  test('selecting a photo shows fullscreen view', async ({ page }) => {
    await waitForGeneratedPhoto(page);
    await page.click('.film-frame:not(.loading)');
    await waitForStableState(page);
    
    await verifyVisible(page, '.selected-photo-container');
    await verifyVisible(page, '.photo-label');
  });

  test('photo navigation works', async ({ page }) => {
    await waitForGeneratedPhoto(page);
    await page.click('.film-frame:not(.loading)');
    await waitForStableState(page);
    
    // Get initial photo number
    const initialLabel = await page.textContent('.photo-label');
    
    // Click next button
    await page.click('.photo-nav-btn.next');
    await waitForStableState(page);
    
    // Verify photo changed
    const newLabel = await page.textContent('.photo-label');
    expect(newLabel).not.toBe(initialLabel);
    
    // Test previous button
    await page.click('.photo-nav-btn.prev');
    await waitForStableState(page);
    
    // Verify we're back to initial photo
    const finalLabel = await page.textContent('.photo-label');
    expect(finalLabel).toBe(initialLabel);
  });

  test('keyboard navigation works', async ({ page }) => {
    await waitForGeneratedPhoto(page);
    await page.click('.film-frame:not(.loading)');
    await waitForStableState(page);
    
    const initialLabel = await page.textContent('.photo-label');
    
    // Test right arrow
    await page.keyboard.press('ArrowRight');
    await waitForStableState(page);
    
    const afterRightLabel = await page.textContent('.photo-label');
    expect(afterRightLabel).not.toBe(initialLabel);
    
    // Test left arrow
    await page.keyboard.press('ArrowLeft');
    await waitForStableState(page);
    
    const afterLeftLabel = await page.textContent('.photo-label');
    expect(afterLeftLabel).toBe(initialLabel);
    
    // Test escape closes fullscreen
    await page.keyboard.press('Escape');
    await waitForStableState(page);
    await expect(page.locator('.selected-photo-container')).not.toBeVisible();
  });

  test('back to camera button works', async ({ page }) => {
    await page.click('.back-to-camera-btn');
    await waitForStableState(page);
    
    await verifyVisible(page, 'video#webcam');
    await expect(page.locator('.film-strip-container')).not.toBeVisible();
  });

  test('loading states display correctly', async ({ page }) => {
    await verifyVisible(page, '.film-frame.loading');
    
    // Wait for progress indicator
    const progressText = await page.textContent('.film-frame.loading .photo-label');
    expect(progressText).toMatch(/\d+%/);
  });

  test('error states display correctly', async ({ page }) => {
    // Force an error state by cancelling generation
    await page.evaluate(() => {
      // Find a loading photo and simulate error
      const loadingPhoto = document.querySelector('.film-frame.loading');
      if (loadingPhoto) {
        loadingPhoto.classList.remove('loading');
        loadingPhoto.classList.add('error');
        const label = loadingPhoto.querySelector('.photo-label');
        if (label) {
          label.textContent = 'Error: Generation failed';
        }
      }
    });
    await waitForStableState(page);
    
    // Verify error message is displayed
    await verifyVisible(page, '.film-frame.error .photo-label', 'Error');
  });
}); 