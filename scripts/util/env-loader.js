/**
 * Simple module to load environment variables for tests
 * Import this at the top of your test scripts to load variables from server/.env
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Setup path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const serverDir = path.resolve(rootDir, 'server');
const envPath = path.resolve(serverDir, '.env');

// Check if .env exists
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: .env file not found in server/ directory');
  console.error(`Expected at: ${envPath}`);
  console.error('Please create this file with required Sogni credentials.');
  process.exit(1);
}

// Load .env file
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`❌ Error loading environment variables: ${result.error.message}`);
  process.exit(1);
}

// Check for required variables
const requiredVars = [
  'SOGNI_USERNAME',
  'SOGNI_PASSWORD',
  'SOGNI_APP_ID'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Error: Missing required environment variables in .env file:`);
  missingVars.forEach(varName => console.error(`  - ${varName}`));
  console.error('Please add these variables to your server/.env file.');
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully from server/.env');

// Export the variables for convenience
export const SOGNI_USERNAME = process.env.SOGNI_USERNAME;
export const SOGNI_PASSWORD = process.env.SOGNI_PASSWORD;
export const SOGNI_APP_ID = process.env.SOGNI_APP_ID;

export default {
  SOGNI_USERNAME,
  SOGNI_PASSWORD,
  SOGNI_APP_ID
}; 