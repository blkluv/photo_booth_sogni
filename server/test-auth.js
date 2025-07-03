import { SogniClient } from '@sogni-ai/sogni-client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

console.log('==== Sogni Authentication Test Script ====');
console.log(`Working directory: ${process.cwd()}`);

// Read .env file directly
try {
  const envPath = path.join(process.cwd(), '.env');
  console.log(`Checking for .env file at: ${envPath}`);
  const envExists = fs.existsSync(envPath);
  
  if (envExists) {
    console.log('✅ .env file exists');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Log credentials without the actual password
    const envLines = envContent.split('\n');
    for (const line of envLines) {
      if (line.startsWith('SOGNI_PASSWORD=')) {
        console.log('SOGNI_PASSWORD=[REDACTED]');
      } else if (line.trim() && !line.startsWith('#')) {
        console.log(line);
      }
    }
  } else {
    console.log('❌ .env file not found!');
  }
} catch (err) {
  console.error(`Error reading .env file: ${err.message}`);
}

// Test environment variables
console.log('\nEnvironment Variables:');
console.log(`SOGNI_APP_ID: ${process.env.SOGNI_APP_ID || '(not set)'}`);
console.log(`SOGNI_USERNAME: ${process.env.SOGNI_USERNAME || '(not set)'}`);
console.log(`SOGNI_PASSWORD: ${process.env.SOGNI_PASSWORD ? '(set)' : '(not set)'}`);
console.log(`SOGNI_ENV: ${process.env.SOGNI_ENV || '(not set)'}`);

// Function to get Sogni URLs
const getSogniUrls = (env) => {
  const SOGNI_HOSTS = {
    'local': { socket: 'wss://socket-local.sogni.ai', api: 'https://api-local.sogni.ai' },
    'staging': { socket: 'wss://socket-staging.sogni.ai', api: 'https://api-staging.sogni.ai' },
    'production': { socket: 'wss://socket.sogni.ai', api: 'https://api.sogni.ai' },
  };

  const sogniEnv = env || 'staging';
  console.log(`Using Sogni environment: ${sogniEnv}`);
  
  if (!SOGNI_HOSTS[sogniEnv]) {
    throw new Error(`Invalid SOGNI_ENV: ${sogniEnv}. Must be one of: ${Object.keys(SOGNI_HOSTS).join(', ')}`);
  }
  
  return SOGNI_HOSTS[sogniEnv];
};

// Test actual authentication
async function testAuth() {
  try {
    console.log('\nAttempting to authenticate with Sogni API...');
    
    const appId = `test-auth-${Date.now()}`;
    const sogniEnv = process.env.SOGNI_ENV || 'production';
    const username = process.env.SOGNI_USERNAME;
    const password = process.env.SOGNI_PASSWORD;
    
    console.log(`Using app ID: ${appId}`);
    console.log(`Using username: ${username}`);
    console.log(`Using password: ${password ? '*****' : '(empty)'}`);
    
    const sogniUrls = getSogniUrls(sogniEnv);
    console.log(`Using REST endpoint: ${sogniUrls.api}`);
    console.log(`Using Socket endpoint: ${sogniUrls.socket}`);
    
    const client = await SogniClient.createInstance({
      appId,
      testnet: false,
      network: "fast",
      logLevel: "debug",
      restEndpoint: sogniUrls.api,
      socketEndpoint: sogniUrls.socket,
    });
    
    console.log('Client created, attempting login...');
    
    await client.account.login(username, password);
    
    console.log('✅ Authentication successful!');
    console.log(`Logged in as: ${username}`);
    console.log(`Network: ${client.network}`);
    return true;
  } catch (error) {
    console.error('❌ Authentication failed!');
    console.error(`Error message: ${error.message}`);
    
    if (error.status) {
      console.error(`Status code: ${error.status}`);
    }
    
    if (error.payload) {
      console.error('Error payload:', error.payload);
    }
    
    return false;
  }
}

// Run the test
console.log('\nStarting authentication test...');
testAuth().then(success => {
  console.log('\nTest completed.');
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
}); 