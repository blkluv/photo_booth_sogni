import { test, expect } from '@playwright/test';

// Test splash screen on various iPhone viewport sizes to ensure text isn't cropped
test.describe('Splash Screen Mobile Layouts', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure splash screen shows
    await page.evaluate(() => {
      localStorage.removeItem('sogni_splash_v2_hidden');
    });
  });

  test('displays splash screen correctly on iPhone SE (375x667)', async ({ page }) => {
    // Set iPhone SE viewport (shortest modern iPhone)
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Wait for splash screen to be visible
    await expect(page.locator('.splash-screen')).toBeVisible();
    
    // Check that all key elements are visible
    await expect(page.locator('.splash-tagline')).toBeVisible();
    await expect(page.locator('.polaroid-image')).toBeVisible();
    await expect(page.locator('.gallery-slideshow')).toBeVisible();
    
    // Check that the "Let's Gooo!" text is fully in viewport
    const tagline = page.locator('.splash-tagline');
    const taglineBbox = await tagline.boundingBox();
    expect(taglineBbox).toBeTruthy();
    
    if (taglineBbox) {
      // Ensure the tagline bottom is above the viewport bottom (with small margin for safety)
      expect(taglineBbox.y + taglineBbox.height).toBeLessThan(667 - 10);
      // Ensure the tagline is not cut off at the top
      expect(taglineBbox.y).toBeGreaterThan(0);
    }
  });

  test('displays splash screen correctly on iPhone 12 mini (375x812)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    await page.goto('/');
    
    await expect(page.locator('.splash-screen')).toBeVisible();
    await expect(page.locator('.splash-tagline')).toBeVisible();
    
    // On taller screens, ensure elements are properly spaced
    const layout = page.locator('.splash-layout');
    const cta = page.locator('.splash-cta-section');
    
    const layoutBbox = await layout.boundingBox();
    const ctaBbox = await cta.boundingBox();
    
    expect(layoutBbox).toBeTruthy();
    expect(ctaBbox).toBeTruthy();
    
    if (layoutBbox && ctaBbox) {
      // Ensure there's proper spacing between layout and CTA
      expect(ctaBbox.y - (layoutBbox.y + layoutBbox.height)).toBeGreaterThan(5);
    }
  });

  test('displays splash screen correctly on very short screen (375x568)', async ({ page }) => {
    // Simulate an extremely short screen to test edge case
    await page.setViewportSize({ width: 375, height: 568 });
    
    await page.goto('/');
    
    await expect(page.locator('.splash-screen')).toBeVisible();
    
    // Check that critical elements are still visible
    await expect(page.locator('.splash-tagline')).toBeVisible();
    
    // On very short screens, camera bubble might be hidden
    const bubble = page.locator('.camera-bubble');
    const isVisible = await bubble.isVisible();
    
    // Either bubble is visible or hidden (both are acceptable on very short screens)
    if (isVisible) {
      // If visible, it should be properly positioned
      const bubbleBbox = await bubble.boundingBox();
      expect(bubbleBbox?.y).toBeGreaterThan(0);
    }
    
    // Tagline should always be fully visible and clickable
    const tagline = page.locator('.splash-tagline');
    await expect(tagline).toBeVisible();
    
    // Test that clicking the tagline dismisses the splash screen
    await tagline.click();
    await expect(page.locator('.splash-screen')).not.toBeVisible({ timeout: 2000 });
  });

  test('responsive layout adjusts properly across breakpoints', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, name: 'iPhone 5' },
      { width: 375, height: 667, name: 'iPhone SE' },
      { width: 375, height: 812, name: 'iPhone 12 mini' },
      { width: 430, height: 932, name: 'iPhone 14 Pro Max' }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Clear localStorage and reload for each test
      await page.evaluate(() => {
        localStorage.removeItem('sogni_splash_v2_hidden');
      });
      await page.goto('/');
      
      // Check that splash screen is visible and properly sized
      await expect(page.locator('.splash-screen')).toBeVisible();
      
      const tagline = page.locator('.splash-tagline');
      await expect(tagline).toBeVisible();
      
      // Ensure tagline text is not cut off
      const taglineBbox = await tagline.boundingBox();
      expect(taglineBbox).toBeTruthy();
      
      if (taglineBbox) {
        expect(taglineBbox.y + taglineBbox.height).toBeLessThan(viewport.height - 5);
        expect(taglineBbox.y).toBeGreaterThan(0);
      }
    }
  });
}); 