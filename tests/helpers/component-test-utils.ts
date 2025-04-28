import { Page, expect } from '@playwright/test';

export interface ComponentState {
  element: string;
  styles: {
    [key: string]: string | number;
  };
  dimensions?: {
    width: number;
    height: number;
  };
  position?: {
    x: number;
    y: number;
  };
  computedStyles?: {
    [key: string]: string;
  };
}

/**
 * Captures the current state of a component for comparison
 */
export async function captureComponentState(page: Page, selector: string): Promise<ComponentState> {
  const element = await page.locator(selector);
  
  // Get element box
  const box = await element.boundingBox();
  if (!box) {
    throw new Error(`Element ${selector} not found or not visible`);
  }

  // Get computed styles
  const computedStyles = await element.evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      borderRadius: styles.borderRadius,
      padding: styles.padding,
      fontSize: styles.fontSize,
      fontFamily: styles.fontFamily,
      boxShadow: styles.boxShadow,
      transform: styles.transform,
      opacity: styles.opacity,
      zIndex: styles.zIndex,
    };
  });

  return {
    element: selector,
    styles: computedStyles,
    dimensions: {
      width: box.width,
      height: box.height,
    },
    position: {
      x: box.x,
      y: box.y,
    },
  };
}

/**
 * Compares two component states
 */
export function compareComponentStates(actual: ComponentState, expected: ComponentState): void {
  // Compare dimensions if specified
  if (expected.dimensions) {
    expect(actual.dimensions?.width).toBeCloseTo(expected.dimensions.width, 1);
    expect(actual.dimensions?.height).toBeCloseTo(expected.dimensions.height, 1);
  }

  // Compare position if specified
  if (expected.position) {
    expect(actual.position?.x).toBeCloseTo(expected.position.x, 1);
    expect(actual.position?.y).toBeCloseTo(expected.position.y, 1);
  }

  // Compare styles
  for (const [key, value] of Object.entries(expected.styles)) {
    expect(actual.styles[key]).toBe(value);
  }
}

/**
 * Captures reference states for a component
 */
export async function captureReferenceStates(page: Page, config: {
  selector: string;
  states: {
    name: string;
    setup?: () => Promise<void>;
  }[];
}): Promise<Record<string, ComponentState>> {
  const states: Record<string, ComponentState> = {};

  for (const state of config.states) {
    if (state.setup) {
      await state.setup();
    }
    states[state.name] = await captureComponentState(page, config.selector);
  }

  return states;
}

/**
 * Verifies component states match reference states
 */
export async function verifyComponentStates(page: Page, referenceStates: Record<string, ComponentState>, config: {
  selector: string;
  states: {
    name: string;
    setup?: () => Promise<void>;
  }[];
}): Promise<void> {
  for (const state of config.states) {
    if (state.setup) {
      await state.setup();
    }
    const currentState = await captureComponentState(page, config.selector);
    compareComponentStates(currentState, referenceStates[state.name]);
  }
}

/**
 * Captures reference styles from the original implementation
 */
export async function captureReferenceStyles(page: Page, selectors: string[]): Promise<Record<string, any>> {
  const styles: Record<string, any> = {};

  for (const selector of selectors) {
    const element = await page.locator(selector);
    const computedStyles = await element.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const properties = Array.from(styles);
      return properties.reduce((acc, prop) => {
        acc[prop] = styles.getPropertyValue(prop);
        return acc;
      }, {} as Record<string, string>);
    });
    styles[selector] = computedStyles;
  }

  return styles;
}

/**
 * Verifies component styles match reference styles
 */
export async function verifyStyles(page: Page, referenceStyles: Record<string, any>, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const element = await page.locator(selector);
    const currentStyles = await element.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      const properties = Array.from(styles);
      return properties.reduce((acc, prop) => {
        acc[prop] = styles.getPropertyValue(prop);
        return acc;
      }, {} as Record<string, string>);
    });

    // Compare with reference styles
    const reference = referenceStyles[selector];
    for (const [property, value] of Object.entries(reference)) {
      expect(currentStyles[property]).toBe(value);
    }
  }
}

/**
 * Captures screenshot of component in various states
 */
export async function captureComponentScreenshots(page: Page, config: {
  selector: string;
  states: {
    name: string;
    setup?: () => Promise<void>;
  }[];
}): Promise<void> {
  for (const state of config.states) {
    if (state.setup) {
      await state.setup();
    }
    await expect(page.locator(config.selector)).toHaveScreenshot(`${state.name}.png`, {
      maxDiffPixelRatio: 0.01
    });
  }
} 