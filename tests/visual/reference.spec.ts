import { test } from '@playwright/test';
import { captureReferenceStyles, captureReferenceStates } from '../helpers/component-test-utils';
import fs from 'fs';
import path from 'path';

test.describe('Capture Reference States', () => {
  test('capture style selector states', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Capture style selector states
    const styleSelectorStates = await captureReferenceStates(page, {
      selector: '.bottom-style-select',
      states: [
        { name: 'default' },
        { 
          name: 'hover',
          setup: async () => {
            await page.hover('.bottom-style-select');
            await page.waitForTimeout(300); // Wait for hover animation
          }
        },
        {
          name: 'active',
          setup: async () => {
            await page.click('.bottom-style-select');
            await page.waitForTimeout(300); // Wait for click animation
          }
        }
      ]
    });

    // Capture dropdown states
    const dropdownStates = await captureReferenceStates(page, {
      selector: '.style-dropdown',
      states: [
        {
          name: 'open',
          setup: async () => {
            await page.click('.bottom-style-select');
            await page.waitForTimeout(300); // Wait for dropdown animation
          }
        }
      ]
    });

    // Capture dropdown option states
    const optionStates = await captureReferenceStates(page, {
      selector: '.style-option:first-child',
      states: [
        { name: 'default' },
        {
          name: 'hover',
          setup: async () => {
            await page.hover('.style-option:first-child');
            await page.waitForTimeout(300); // Wait for hover animation
          }
        },
        {
          name: 'selected',
          setup: async () => {
            await page.click('.style-option:first-child');
            await page.waitForTimeout(300); // Wait for selection animation
          }
        }
      ]
    });

    // Capture all computed styles
    const computedStyles = await captureReferenceStyles(page, [
      '.bottom-style-select',
      '.style-dropdown',
      '.style-option',
      '.style-option.selected',
      '.header-config-btn'
    ]);

    // Save reference states
    const referencePath = path.join(__dirname, '../__snapshots__/reference');
    if (!fs.existsSync(referencePath)) {
      fs.mkdirSync(referencePath, { recursive: true });
    }

    fs.writeFileSync(
      path.join(referencePath, 'style-selector-states.json'),
      JSON.stringify(styleSelectorStates, null, 2)
    );

    fs.writeFileSync(
      path.join(referencePath, 'dropdown-states.json'),
      JSON.stringify(dropdownStates, null, 2)
    );

    fs.writeFileSync(
      path.join(referencePath, 'option-states.json'),
      JSON.stringify(optionStates, null, 2)
    );

    fs.writeFileSync(
      path.join(referencePath, 'computed-styles.json'),
      JSON.stringify(computedStyles, null, 2)
    );
  });
}); 