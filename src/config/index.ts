/**
 * Central configuration exports
 * This file exports all configuration modules to make imports cleaner
 */

export * from './env';
export * from './urls';

// Re-export default exports as named exports for convenience
import * as env from './env';
import * as urls from './urls';

export { env, urls };

// Remove the default export object to avoid unsafe assignment 