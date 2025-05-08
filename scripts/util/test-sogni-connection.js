/**
 * Example test script that uses env-loader to connect to the Sogni API
 * This demonstrates how to use the environment variables for real testing
 */

// Import the env loader first - this will load all environment variables
import './env-loader.js';

// Import Sogni service functions
import { 
  initializeSogniClient, 
  cleanupSogniClient,
  getActiveConnectionsCount
} from '../../server/services/sogni.js';

// Import node modules
import { setTimeout } from 'node:timers/promises';

// Main test function
async function testSogniConnection() {
  console.log('=== SOGNI CONNECTION TEST ===');
  console.log('Testing real connection to Sogni API using credentials from .env');
  
  try {
    // Step 1: Create a client
    console.log('\nInitializing Sogni client...');
    const client = await initializeSogniClient();
    
    // Step 2: Check if client connected successfully
    if (!client) {
      console.error('❌ Error: Failed to create Sogni client');
      return false;
    }
    
    console.log('✅ Client initialized successfully');
    
    // Step 3: Verify active connections tracking
    const activeCount = getActiveConnectionsCount();
    console.log(`Active connections: ${activeCount}`);
    
    if (activeCount !== 1) {
      console.error(`❌ Error: Expected 1 active connection, found ${activeCount}`);
      return false;
    }
    
    console.log('✅ Connection properly tracked in activeConnections');
    
    // Step 4: Inspect client properties to see what's available
    console.log('\nInspecting client properties:');
    console.log('Client account:', {
      isLoggedIn: client.account?.isLoggedIn,
      username: client.account?.username
    });
    
    // Step 5: Wait a bit to show the connection is stable
    console.log('\nWaiting 3 seconds to verify connection stability...');
    await setTimeout(3000);
    
    // Step 6: Check if client is still connected
    if (getActiveConnectionsCount() !== 1) {
      console.error(`❌ Error: Expected 1 active connection, found ${getActiveConnectionsCount()}`);
      return false;
    }
    
    console.log('✅ Connection stable after waiting');
    
    // Step 7: Clean up
    console.log('\nCleaning up client connection...');
    await cleanupSogniClient();
    
    // Step 8: Verify cleanup
    const finalCount = getActiveConnectionsCount();
    if (finalCount !== 0) {
      console.error(`❌ Error: Expected 0 active connections after cleanup, found ${finalCount}`);
      return false;
    }
    
    console.log('✅ Client cleanup successful');
    return true;
  } catch (error) {
    console.error('❌ Error during Sogni connection test:', error);
    return false;
  }
}

// Run the test
console.log('Starting Sogni connection test...');
testSogniConnection()
  .then(success => {
    console.log('\n=== TEST RESULT ===');
    if (success) {
      console.log('✅ Connection test passed!');
      process.exit(0);
    } else {
      console.error('❌ Connection test failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n=== UNHANDLED ERROR ===');
    console.error('❌ Test failed with unhandled error:', error);
    process.exit(1);
  }); 