/**
 * Test script for verifying socket connection cleanup
 * 
 * This script creates multiple Sogni clients and verifies that
 * all connections are properly closed after cleanup.
 */

// Use ESM import syntax
import { 
  initializeSogniClient, 
  cleanupSogniClient, 
  getClientInfo, 
  getActiveConnectionsCount,
  logConnectionStatus
} from '../../server/services/sogni.js';

// Print test report
function printTestResult(testName, passed, message) {
  const status = passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`\n${status}: ${testName}`);
  console.log(`${message}\n`);
}

// Run a single test with cleanup
async function runTestCase() {
  console.log('\n====== TEST: Socket Connection Cleanup ======\n');
  
  try {
    // 1. Verify starting with zero connections
    const initialCount = getActiveConnectionsCount();
    printTestResult(
      'Initial connection count', 
      initialCount === 0,
      `Expected 0 connections, found ${initialCount}`
    );
    
    // 2. Create multiple clients
    console.log('Creating multiple clients to test...');
    const client1 = await initializeSogniClient();
    const client2 = await initializeSogniClient();
    await getClientInfo(); // This should self-cleanup
    
    // 3. Verify client creation tracking
    const afterCreationCount = getActiveConnectionsCount();
    printTestResult(
      'Client creation tracking', 
      afterCreationCount > 0,
      `Expected connections > 0, found ${afterCreationCount}`
    );
    
    // 4. Clean up one client explicitly
    if (client1 && client1.disconnect) {
      console.log('Cleaning up client1 explicitly...');
      await client1.disconnect();
    }
    
    // 5. Check cleanup of remaining connections
    console.log('Running full cleanup for remaining connections...');
    await cleanupSogniClient();
    
    // 6. Verify all connections are closed
    const finalCount = getActiveConnectionsCount();
    printTestResult(
      'Final connection cleanup', 
      finalCount === 0,
      `Expected 0 connections after cleanup, found ${finalCount}`
    );
    
    // 7. Overall test result
    if (initialCount === 0 && afterCreationCount > 0 && finalCount === 0) {
      console.log('\n✅ TEST PASSED: All socket connections properly cleaned up!');
    } else {
      console.log('\n❌ TEST FAILED: Socket connections not properly tracked or cleaned up');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
    printTestResult('Test execution', false, `Error: ${error.message}`);
  }
}

// Run the test
console.log('Starting socket connection cleanup test...');
runTestCase()
  .then(() => {
    console.log('Test completed.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
  }); 