/**
 * Central configuration exports
 * This file exports all configuration modules to make imports cleaner
 */

export * from './env';
export * from './urls';

// Re-export default exports as named exports for convenience
import env from './env';
import urls from './urls';

export { env, urls };

// Default export for import * as config from '@/config'
export default {
  env,
  urls
}; 