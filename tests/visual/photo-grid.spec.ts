import { test, expect } from '@playwright/test';
import {
  waitForCamera,
  takePhotoAndWaitForGrid,
  waitForGeneratedPhoto,
  waitForAnimations,
  mockCameraPermissions,
  cleanup
} from '../helpers/test-utils';

test.describe('Photo Grid Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockCameraPermissions(page);
    await page.goto('/');
    await waitForCamera(page);
    await takePhotoAndWaitForGrid(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
  });

  test('photo grid layout matches snapshot', async ({ page }) => {
    await waitForGeneratedPhoto(page);
    await waitForAnimations(page);
    await expect(page).toHaveScreenshot('photo-grid.png', {
      animations: 'disabled',
    });
  });

  test('selected photo view matches snapshot', async ({ page }) => {
    await waitForGeneratedPhoto(page);
    await page.click('.film-frame:not(.loading)');
    await waitForAnimations(page);
    await expect(page).toHaveScreenshot('selected-photo.png', {
      animations: 'disabled',
    });
  });

  test('photo navigation buttons visible on hover', async ({ page }) => {
    await waitForGeneratedPhoto(page);
    await page.click('.film-frame:not(.loading)');
    await waitForAnimations(page);
    await page.hover('.photo-nav-btn.next');
    await expect(page).toHaveScreenshot('photo-nav-buttons.png', {
      animations: 'disabled',
    });
  });

  test('loading state photos match snapshot', async ({ page }) => {
    await page.waitForSelector('.film-frame.loading');
    await waitForAnimations(page);
    await expect(page).toHaveScreenshot('loading-photos.png', {
      animations: 'disabled',
    });
  });
});