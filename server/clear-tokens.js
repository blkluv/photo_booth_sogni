import { forceAuthReset } from './services/sogni.js';
import process from 'process';

console.log('Clearing all cached tokens and forcing fresh authentication...');

forceAuthReset()
  .then(() => {
    console.log('✓ All tokens cleared successfully');
    console.log('✓ Next API request will use fresh authentication');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error clearing tokens:', error.message);
    process.exit(1);
  }); 