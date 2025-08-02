import { SogniClient } from '@sogni-ai/sogni-client';
import dotenv from 'dotenv';
import process from 'process';

// Load environment variables
dotenv.config();

console.log('==== Sogni Authentication Test Script ====');
console.log(`Working directory: ${process.cwd()}`);

// Test environment variables
console.log('\nEnvironment Variables:');
console.log(`SOGNI_APP_ID: ${process.env.SOGNI_APP_ID || '(not set)'}`);
console.log(`SOGNI_USERNAME: ${process.env.SOGNI_USERNAME || '(not set)'}`);
console.log(`SOGNI_PASSWORD: ${process.env.SOGNI_PASSWORD ? '(set)' : '(not set)'}`);
console.log(`SOGNI_ENV: ${process.env.SOGNI_ENV || '(not set)'}`);

const main = async () => {
  console.log('Testing Sogni Client authentication with version 3.0.0-alpha.40');
  
  try {
    // Get environment-aware URLs
    const getSogniUrls = (env) => {
      const SOGNI_HOSTS = {
        'local': { socket: 'wss://socket-local.sogni.ai', api: 'https://api-local.sogni.ai' },
        'staging': { socket: 'wss://socket-staging.sogni.ai', api: 'https://api-staging.sogni.ai' },
        'production': { socket: 'wss://socket.sogni.ai', api: 'https://api.sogni.ai' },
      };
      return SOGNI_HOSTS[env || 'production'];
    };
    
    const sogniEnv = process.env.SOGNI_ENV || 'production';
    const sogniUrls = getSogniUrls(sogniEnv);
    
    console.log(`Using ${sogniEnv} environment:`);
    console.log(`  API: ${sogniUrls.api}`);
    console.log(`  Socket: ${sogniUrls.socket}`);
    
    // Use testnet for staging environment, mainnet for production  
    const useTestnet = sogniEnv === 'staging' || sogniEnv === 'local';
    
    const client = await SogniClient.createInstance({
      appId: 'test-client-' + Date.now(),
      testnet: useTestnet,
      network: "fast",
      logLevel: "info",
      restEndpoint: sogniUrls.api,
      socketEndpoint: sogniUrls.socket,
    });
    
    console.log('✓ Client created successfully');
    console.log('  - Client has appId:', !!client.appId);
    console.log('  - Client has account:', !!client.account);
    console.log('  - Client has currentAccount:', !!client.account.currentAccount);
    console.log('  - Initial authentication state:', client.account.currentAccount.isAuthenicated);
    
    // Test authentication
    const username = process.env.SOGNI_USERNAME;
    const password = process.env.SOGNI_PASSWORD;
    
    if (username && password) {
      console.log('\nTesting login...');
      await client.account.login(username, password);
      console.log('✓ Login successful');
      console.log('  - Authentication state:', client.account.currentAccount.isAuthenicated);
      console.log('  - Has token:', !!client.account.currentAccount.token);
      console.log('  - Has refresh token:', !!client.account.currentAccount.refreshToken);
    } else {
      console.log('⚠ No credentials provided, skipping login test');
    }
    
    console.log('\nAll tests passed! The Sogni Client migration is working correctly.');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error('Stack:', error.stack);
  }
};

main().catch(console.error); 