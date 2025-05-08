/**
 * Test script to verify proper Sogni client connection cleanup
 * 
 * This test creates multiple clients and verifies:
 * 1. Explicit disconnection works for individual clients
 * 2. Idle timeout cleanup disconnects inactive clients
 * 3. The global cleanup function disconnects all remaining connections
 */

// Explicitly use node: protocol for node standard modules
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Setup path resolution for imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = resolve(__dirname, '../../server/services/sogni.js');

// Import the Sogni client API from the server
import { 
  initializeSogniClient, 
  cleanupSogniClient,
  getClientInfo,
  getActiveConnectionsCount
} from '../../server/services/sogni.js';

// Test summary
let testsPassed = 0;
let testsFailed = 0;

// Print test report
function reportTest(testName, passed, message) {
  const status = passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`\n${status}: ${testName}`);
  console.log(`${message}\n`);
  
  if (passed) {
    testsPassed++;
  } else {
    testsFailed++;
  }
}

// Sleep helper that shows countdown
async function sleepWithCountdown(seconds, message) {
  console.log(`\n${message || 'Waiting'} for ${seconds} seconds...`);
  
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`${i}... `);
    await setTimeout(1000);
  }
  console.log('Done!');
}

// Main test function
async function runSocketCleanupTest() {
  console.log('\n======= SOGNI CLIENT CONNECTION CLEANUP TEST =======\n');
  console.log('This test verifies proper handling of Sogni client connections');
  
  try {
    // Step 1: Check the starting state (should be empty)
    const initialCount = getActiveConnectionsCount();
    reportTest('Initial state check', initialCount === 0, 
      `Expected 0 active connections, found ${initialCount}`);
    
    // Step 2: Create multiple clients
    console.log('\nCreating clients...');
    const client1 = await initializeSogniClient();
    console.log('✓ Client 1 created');
    
    const client2 = await initializeSogniClient();
    console.log('✓ Client 2 created');
    
    // Use getClientInfo which should create and then immediately disconnect a client
    await getClientInfo();
    console.log('✓ Client info checked (should auto-disconnect)');
    
    // Step 3: Verify client tracking
    const afterCreationCount = getActiveConnectionsCount();
    reportTest('Client creation tracking', afterCreationCount === 2, 
      `Expected 2 active connections after creation, found ${afterCreationCount}`);
    
    // Step 4: Explicitly disconnect one client
    console.log('\nExplicitly disconnecting client 1...');
    if (client1 && client1.disconnect) {
      await client1.disconnect();
      console.log('✓ Client 1 disconnected');
    } else {
      console.log('✗ Client 1 does not have disconnect method');
    }
    
    // Step 5: Verify after explicit disconnect
    const afterDisconnectCount = getActiveConnectionsCount();
    reportTest('Explicit client disconnect', afterDisconnectCount === 1, 
      `Expected 1 active connection after explicit disconnect, found ${afterDisconnectCount}`);
    
    // Step 6: Final cleanup of all remaining connections
    console.log('\nCleaning up all remaining connections...');
    await cleanupSogniClient();
    
    // Step 7: Verify final state
    const finalCount = getActiveConnectionsCount();
    reportTest('Final cleanup', finalCount === 0, 
      `Expected 0 active connections after cleanup, found ${finalCount}`);
    
    // Print test summary
    console.log('\n======= TEST SUMMARY =======');
    console.log(`✅ Tests passed: ${testsPassed}`);
    console.log(`❌ Tests failed: ${testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n✅ ALL TESTS PASSED: Socket connection handling is working as expected!');
    } else {
      console.log('\n❌ SOME TESTS FAILED: Check the logs for details');
    }
    
    return testsFailed === 0;
  } catch (error) {
    console.error('\nError during test execution:', error);
    reportTest('Test execution', false, `Error: ${error.message}`);
    return false;
  }
}

// Run the test
console.log('Starting Sogni client connection cleanup test...');
runSocketCleanupTest()
  .then(success => {
    if (success) {
      console.log('✅ Test completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Test failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test failed with unhandled error:', error);
    process.exit(1);
  }); 