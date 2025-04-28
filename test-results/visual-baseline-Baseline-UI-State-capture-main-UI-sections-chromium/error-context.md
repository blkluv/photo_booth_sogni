# Test info

- Name: Baseline UI State >> capture main UI sections
- Location: /Users/markledford/Documents/git/sogni-photobooth/tests/visual/baseline.spec.ts:22:3

# Error details

```
Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

Locator: locator('.camera-container')
Expected: visible
Received: <element(s) not found>
Call log:
  - expect.toBeVisible with timeout 10000ms
  - waiting for locator('.camera-container')

    at /Users/markledford/Documents/git/sogni-photobooth/tests/visual/baseline.spec.ts:25:35
```

# Page snapshot

```yaml
- text: First the photobooth, and then the world baby!
- heading "Advanced Settings" [level=2]
- button "×"
- text: "Pick an Image Model:"
- combobox:
  - option "🅂 Sogni.XLT 𝛂1 (SDXL Turbo)" [selected]
  - option "DreamShaper v2.1 (SDXL Turbo)"
  - option "JuggernautXL 9 + RD Photo2 (SDXL Lightning)"
- text: "Number of Images:"
- slider: "16"
- text: "16 Prompt Guidance:"
- slider: "2"
- text: "2.0 Instant ID Strength:"
- slider: "0.8"
- text: "0.8 Instant ID Impact Stop:"
- slider: "0.6"
- text: "0.6"
- checkbox "Flash Flash" [checked]
- text: Flash
- checkbox "Show Original Image Show Original Image"
- text: Show Original Image
- button "Reset to Defaults"
- button "?"
- img "Studio Light"
- img "Studio Light"
- text: SOGNI PHOTOBOOTH
- button "⚙️"
- button
- button "Take Photo" [disabled]
- heading "Advanced Settings" [level=2]
- button "×"
- text: "Pick an Image Model:"
- combobox
- text: "Number of Images:"
- slider: "16"
- text: "16 Prompt Guidance:"
- slider: "2"
- text: "2.0 Instant ID Strength:"
- slider: "0.8"
- text: "0.8 Instant ID Impact Stop:"
- slider: "0.6"
- text: "0.6"
- checkbox [checked]
- text: Flash
- checkbox
- text: Show Original Image
- button "Reset to Defaults"
- img "Slothicorn mascot"
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 | import { waitForStableState, waitForCamera, mockCameraPermissions, TEST_SERVER_URL } from '../helpers/test-utils';
   3 |
   4 | // IMPORTANT: Always use the dedicated test server (port 5176)
   5 | // Main dev server runs on port 5175 and should not be used for tests
   6 | test.describe('Baseline UI State', () => {
   7 |   test.beforeEach(async ({ page }) => {
   8 |     // Mock camera permissions before navigating to prevent permission dialogs
   9 |     await mockCameraPermissions(page);
  10 |     // Use the dedicated test server
  11 |     await page.goto(TEST_SERVER_URL);
  12 |     // Increase timeout for camera initialization
  13 |     await waitForCamera(page);
  14 |     // Ensure camera is fully visible and stabilized
  15 |     await page.waitForSelector('video#webcam', { state: 'visible', timeout: 15000 });
  16 |     // Wait for UI to stabilize
  17 |     await waitForStableState(page);
  18 |     // Additional wait to ensure camera feed is stable
  19 |     await page.waitForTimeout(1000);
  20 |   });
  21 |
  22 |   test('capture main UI sections', async ({ page }) => {
  23 |     // First verify the camera container is present
  24 |     const cameraContainer = page.locator('.camera-container');
> 25 |     await expect(cameraContainer).toBeVisible({ timeout: 10000 });
     |                                   ^ Error: Timed out 10000ms waiting for expect(locator).toBeVisible()
  26 |     
  27 |     // Mask the actual camera feed since it changes
  28 |     await expect(page).toHaveScreenshot('baseline-full-view.png', {
  29 |       mask: [page.locator('video#webcam')],
  30 |       maxDiffPixelRatio: 0.01,
  31 |       timeout: 15000
  32 |     });
  33 |
  34 |     // Capture style selector and controls
  35 |     await expect(page.locator('.bottom-controls')).toHaveScreenshot('baseline-controls.png', {
  36 |       maxDiffPixelRatio: 0.01,
  37 |       timeout: 15000
  38 |     });
  39 |
  40 |     // Open and capture style dropdown
  41 |     await page.click('[class*="styleButton"]');
  42 |     await waitForStableState(page);
  43 |     await expect(page.locator('[class*="styleDropdown"]')).toHaveScreenshot('baseline-style-dropdown.png', {
  44 |       maxDiffPixelRatio: 0.01,
  45 |       timeout: 15000
  46 |     });
  47 |
  48 |     // Open and capture settings panel
  49 |     await page.click('[class*="configButton"]');
  50 |     await waitForStableState(page);
  51 |     await expect(page.locator('.control-overlay.visible')).toHaveScreenshot('baseline-settings-panel.png', {
  52 |       maxDiffPixelRatio: 0.01,
  53 |       timeout: 15000
  54 |     });
  55 |
  56 |     // Take a photo and capture photo grid
  57 |     await page.click('[class*="shutterButton"]');
  58 |     await page.waitForTimeout(4000); // Wait for countdown and capture
  59 |     await waitForStableState(page);
  60 |     await expect(page.locator('.film-strip-container')).toHaveScreenshot('baseline-photo-grid.png', {
  61 |       maxDiffPixelRatio: 0.01,
  62 |       timeout: 15000
  63 |     });
  64 |
  65 |     // Test responsive layouts
  66 |     for (const viewport of [
  67 |       { width: 375, height: 667, name: 'mobile' },
  68 |       { width: 768, height: 1024, name: 'tablet' },
  69 |       { width: 1280, height: 720, name: 'desktop' }
  70 |     ]) {
  71 |       await page.setViewportSize(viewport);
  72 |       await waitForStableState(page);
  73 |       await expect(page).toHaveScreenshot(`baseline-full-${viewport.name}.png`, {
  74 |         maxDiffPixelRatio: 0.01,
  75 |         fullPage: true,
  76 |         timeout: 15000,
  77 |         mask: [page.locator('video#webcam')] // Mask camera feed in all screenshots
  78 |       });
  79 |     }
  80 |   });
  81 | }); 
```