/**
 * Helper script to load environment variables from .env file for tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

// Setup path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const serverDir = path.resolve(rootDir, 'server');
const envPath = path.resolve(serverDir, '.env');

// Function to check if .env exists and has required credentials
export function checkEnvCredentials() {
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env file not found in server/ directory');
    console.error(`Expected at: ${envPath}`);
    console.error('Please create this file with required Sogni credentials.');
    return false;
  }

  // Read .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredVars = [
    'SOGNI_USERNAME',
    'SOGNI_PASSWORD',
    'SOGNI_APP_ID'
  ];

  // Check for required variables
  const missingVars = [];
  for (const varName of requiredVars) {
    if (!envContent.includes(`${varName}=`)) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    console.error(`❌ Error: Missing required environment variables in .env file:`);
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('Please add these variables to your server/.env file.');
    return false;
  }

  console.log('✅ .env file found with required Sogni credentials');
  return true;
}

// Load environment variables from .env file
export function loadEnvVars() {
  if (!checkEnvCredentials()) {
    return false;
  }
  
  try {
    // Load .env file into process.env
    const envConfig = dotenv.config({ path: envPath });
    
    if (envConfig.error) {
      console.error('❌ Error loading .env file:', envConfig.error);
      return false;
    }
    
    console.log('✅ Environment variables loaded successfully from .env file');
    return true;
  } catch (error) {
    console.error('❌ Error loading environment variables:', error);
    return false;
  }
}

// Main function to run a command with environment from .env
export async function runWithEnv(command) {
  if (!checkEnvCredentials()) {
    return { success: false, message: 'Missing required environment variables' };
  }

  // Load .env content
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  // Parse .env file
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      envVars[key] = value;
    }
  });

  return new Promise((resolve) => {
    console.log(`Running command: ${command}`);
    
    // Parse the command
    const [cmd, ...args] = command.split(' ');
    
    // Add NODE_OPTIONS for ESM modules
    const env = {
      ...process.env,
      ...envVars,
      NODE_OPTIONS: '--experimental-vm-modules',
      RUN_REAL_TESTS: 'true',
      REDUCED_TIMEOUT: 'true'
    };

    // Spawn process with environment vars
    const proc = spawn(cmd, args, { 
      env,
      stdio: 'inherit',
      cwd: rootDir,
      shell: true
    });

    proc.on('close', (code) => {
      const success = code === 0;
      resolve({ 
        success, 
        message: success ? 'Tests completed successfully' : `Tests failed with exit code ${code}` 
      });
    });
  });
}

// Direct script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (!command) {
    console.log('Usage: node test-env-helper.js "command-to-run"');
    console.log('Example: node test-env-helper.js "node test-idle-timeout.js"');
    process.exit(1);
  }
  
  runWithEnv(command)
    .then(result => {
      console.log(result.message);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Error running command:', error);
      process.exit(1);
    });
} 