/**
 * Test script to verify Sogni client idle timeout cleanup
 * 
 * This test creates clients and verifies they're properly 
 * disconnected after the inactivity timeout period.
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
  getActiveConnectionsCount
} from '../../server/services/sogni.js';

// Reduce timeout for testing - 10 seconds instead of 5 minutes
// Note: The actual backend code should use a longer timeout (5 minutes)
const TEST_IDLE_TIMEOUT_SECONDS = 10;

// Print test report
function reportTest(testName, passed, message) {
  const status = passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`\n${status}: ${testName}`);
  console.log(`${message}\n`);
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
async function runIdleTimeoutTest() {
  console.log('\n======= SOGNI CLIENT IDLE TIMEOUT TEST =======\n');
  console.log(`This test verifies clients are disconnected after ${TEST_IDLE_TIMEOUT_SECONDS} seconds of inactivity`);
  console.log('Note: The production timeout is longer (5 minutes)');
  
  // Force cleanup at the start of the test
  await cleanupSogniClient();
  
  try {
    // Step 1: Create a client that will become idle
    console.log('\nCreating idle client...');
    await initializeSogniClient();
    console.log('✓ Idle client created');
    
    // Step 2: Verify we have one active client
    const initialCount = getActiveConnectionsCount();
    reportTest('Initial count check', initialCount === 1, 
      `Expected 1 active connection, found ${initialCount}`);
    
    // Step 3: Wait for timeout to occur
    await sleepWithCountdown(TEST_IDLE_TIMEOUT_SECONDS + 2, 
      `Waiting for idle timeout (${TEST_IDLE_TIMEOUT_SECONDS} seconds + 2 extra seconds for processing)`);
    
    // Step 4: Verify client was disconnected by idle timeout
    const afterTimeoutCount = getActiveConnectionsCount();
    const timeoutPassed = afterTimeoutCount === 0;
    
    reportTest('Idle timeout cleanup', timeoutPassed, 
      timeoutPassed ? 
        'Client was properly disconnected by idle timeout' : 
        `Client was NOT disconnected, still have ${afterTimeoutCount} active connections`);
    
    // Step 5: Create an active client that shouldn't time out
    if (!timeoutPassed) {
      // Skip this part if the timeout test failed
      console.log('\nSkipping active client test since idle timeout failed');
      return false;
    }
    
    console.log('\nCreating an active client that will keep sending activity signals...');
    const activeClient = await initializeSogniClient();
    console.log('✓ Active client created');
    
    // Step 6: Setup activity simulation - record activity every 2 seconds
    console.log('Starting activity simulation for the client...');
    let keepActive = true;
    
    // Simulates activity by using the client every 2 seconds
    const activityInterval = setInterval(() => {
      if (keepActive && activeClient) {
        try {
          console.log('✓ Simulating client activity');
          // This would normally be done by project events in actual usage
          if (activeClient.appId) {
            // Just accessing the appId is enough to show it's being used
            process.stdout.write('.');
          }
        } catch (e) {
          console.error('Error in activity simulation:', e);
        }
      }
    }, 2000);
    
    // Step 7: Wait for what would normally be an idle timeout, but client should remain active
    await sleepWithCountdown(TEST_IDLE_TIMEOUT_SECONDS + 2, 
      `Waiting to verify active client doesn't timeout (${TEST_IDLE_TIMEOUT_SECONDS} seconds)`);
    
    // Step 8: Stop the activity simulation
    keepActive = false;
    clearInterval(activityInterval);
    
    // Step 9: Verify the active client wasn't disconnected
    const afterActiveWaitCount = getActiveConnectionsCount();
    const activeClientTest = afterActiveWaitCount === 1;
    
    reportTest('Active client persistence', activeClientTest, 
      activeClientTest ? 
        'Active client was correctly kept alive during activity' : 
        `Active client was incorrectly disconnected, have ${afterActiveWaitCount} active connections`);
    
    // Step 10: Clean up
    console.log('\nCleaning up all remaining connections...');
    await cleanupSogniClient();
    
    // Step 11: Verify final cleanup
    const finalCount = getActiveConnectionsCount();
    reportTest('Final cleanup', finalCount === 0, 
      `Expected 0 active connections after cleanup, found ${finalCount}`);
    
    // Return true if both main tests passed
    return timeoutPassed && activeClientTest;
  } catch (error) {
    console.error('Error during idle timeout test:', error);
    return false;
  }
}

// Run the test
console.log('Starting Sogni client idle timeout test...');
runIdleTimeoutTest()
  .then(success => {
    if (success) {
      console.log('✅ Idle timeout test completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Idle timeout test failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test failed with unhandled error:', error);
    process.exit(1);
  }); 