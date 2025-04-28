import { Page, expect } from '@playwright/test';

/**
 * Base URL for the test server - ALWAYS use this URL for tests
 * The main dev server runs on port 5175 and should not be affected by tests
 */
export const TEST_SERVER_URL = 'http://photobooth-local.sogni.ai:5176';

/**
 * Wait for camera to be ready
 */
export async function waitForCamera(page: Page): Promise<void> {
  // Wait for the video element to be visible
  await page.waitForSelector('video#webcam', { state: 'visible', timeout: 15000 });
  
  // Verify camera is actually active by checking attributes
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const video = document.querySelector('video#webcam') as HTMLVideoElement;
      if (video) {
        // If video is already playing, resolve immediately
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        
        // Otherwise wait for loadeddata event
        const handleLoaded = () => {
          video.removeEventListener('loadeddata', handleLoaded);
          resolve();
        };
        
        video.addEventListener('loadeddata', handleLoaded);
        
        // Fallback timeout in case event never fires
        setTimeout(resolve, 5000);
      } else {
        // Resolve anyway if video element not found to prevent hanging
        setTimeout(resolve, 1000);
      }
    });
  });
}

/**
 * Take a photo and wait for the photo grid to appear
 */
export async function takePhotoAndWaitForGrid(page: Page): Promise<void> {
  await page.click('[class*="shutterButton"]');
  await page.waitForTimeout(4000); // Wait for countdown and flash
  await page.waitForSelector('.film-strip-container.visible');
  // Add a stable state wait to ensure UI is fully rendered and stable
  await waitForStableState(page);
}

/**
 * Wait for at least one photo to finish generating
 */
export async function waitForGeneratedPhoto(page: Page): Promise<void> {
  await page.waitForSelector('.film-frame:not(.loading)');
}

/**
 * Open the settings panel
 */
export async function openSettings(page: Page): Promise<void> {
  await page.click('[class*="configButton"]');
  await page.waitForSelector('.control-overlay.visible');
}

/**
 * Open the style selector dropdown
 */
export async function openStyleSelector(page: Page): Promise<void> {
  await page.click('[class*="styleButton"]');
  await page.waitForSelector('[class*="styleDropdown"]', { state: 'visible' });
}

/**
 * Select a specific style by name
 */
export async function selectStyle(page: Page, styleName: string): Promise<void> {
  await openStyleSelector(page);
  await page.click(`.style-option:has-text("${styleName}")`);
}

/**
 * Verify an element is visible and optionally contains text
 */
export async function verifyVisible(page: Page, selector: string, text?: string): Promise<void> {
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  if (text) {
    await expect(element).toContainText(text);
  }
}

/**
 * Wait for animations to complete
 * Use this when visual tests need stable snapshots
 */
export async function waitForAnimations(page: Page): Promise<void> {
  // Wait for CSS transitions to complete (typical duration is 500ms)
  await page.waitForTimeout(600);
  
  // Check if any ongoing animations remain by checking for elements with transition or animation
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        // Add another frame to ensure animations had a chance to complete
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

/**
 * Wait for a stable visual state combining network, animations and rendering
 * Essential for consistent visual testing snapshots
 */
export async function waitForStableState(page: Page): Promise<void> {
  // First wait for network activity to complete
  await page.waitForLoadState('networkidle');
  
  // Then wait for animations to complete
  await waitForAnimations(page);
  
  // Add a small buffer to ensure rendering is complete
  await page.waitForTimeout(100);
}

/**
 * Mock camera permissions
 */
export async function mockCameraPermissions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const mockStream = {
      getTracks: () => [{
        stop: () => {}
      }]
    } as MediaStream;

    // Create a mock getUserMedia that returns our mock stream
    const mockGetUserMedia = async () => mockStream;

    // Create a new mediaDevices object with our mock
    const mediaDevices = {
      ...navigator.mediaDevices,
      getUserMedia: mockGetUserMedia
    };

    // Override the entire mediaDevices object
    Object.defineProperty(navigator, 'mediaDevices', {
      value: mediaDevices,
      configurable: true
    });
  });
}

/**
 * Helper to test responsive layouts
 */
export async function setViewportSize(page: Page, size: 'mobile' | 'tablet' | 'desktop'): Promise<void> {
  const sizes = {
    mobile: { width: 390, height: 844 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 720 }
  };
  await page.setViewportSize(sizes[size]);
}

/**
 * Clean up any test artifacts
 */
export async function cleanup(page: Page): Promise<void> {
  // Close any open overlays
  const overlays = [
    '.control-overlay.visible',
    '.styleDropdown',
    '.selected-photo-container'
  ];
  
  for (const selector of overlays) {
    const isVisible = await page.isVisible(selector);
    if (isVisible) {
      if (selector === '.selected-photo-container') {
        await page.keyboard.press('Escape');
      } else if (selector === '.control-overlay.visible') {
        await page.click('.dismiss-overlay-btn');
      }
      // Style dropdown closes automatically when clicking outside
    }
  }
} 