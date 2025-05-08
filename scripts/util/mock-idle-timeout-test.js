/**
 * Mock test script to verify idle timeout functionality
 * 
 * This test creates clients and verifies they're properly 
 * disconnected after the inactivity timeout period.
 */

import { setTimeout } from 'node:timers/promises';

// Mock connection tracking
const activeConnections = new Map();
const connectionLastActivity = new Map();
const TEST_IDLE_TIMEOUT_MS = 3000; // 3 seconds for tests

// Create a mock socket with close method for testing
class MockWebSocket {
  constructor(id) {
    this.id = id;
    this.closed = false;
  }
  
  close() {
    console.log(`WebSocket ${this.id} closed`);
    this.closed = true;
  }
}

// Create a mock Sogni client
class MockSogniClient {
  constructor(appId) {
    this.appId = appId || `mock-client-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this._socket = new MockWebSocket(`socket-${this.appId}`);
    this._websocket = new MockWebSocket(`websocket-${this.appId}`);
    this.account = { isLoggedIn: true };
    
    // Track this connection
    activeConnections.set(this.appId, this);
    recordClientActivity(this.appId);
    logConnectionStatus('Created', this.appId);
  }
  
  async disconnect() {
    console.log(`Disconnecting client: ${this.appId}`);
    // Remove from tracking
    if (activeConnections.has(this.appId)) {
      activeConnections.delete(this.appId);
    }
    if (connectionLastActivity.has(this.appId)) {
      connectionLastActivity.delete(this.appId);
    }
    return true;
  }
}

// Helper function to log connection status
function logConnectionStatus(operation, clientId) {
  console.log(`[CONNECTION TRACKER] ${operation} - Client: ${clientId}`);
  console.log(`[CONNECTION TRACKER] Active connections: ${activeConnections.size}`);
  return activeConnections.size;
}

// Record client activity
function recordClientActivity(clientId) {
  if (clientId) {
    connectionLastActivity.set(clientId, Date.now());
    console.log(`[ACTIVITY] Recorded activity for client: ${clientId}`);
  }
}

// Get active connection count
function getActiveConnectionsCount() {
  return activeConnections.size;
}

// Check for idle connections
async function checkIdleConnections() {
  const now = Date.now();
  const idleTimeThreshold = now - TEST_IDLE_TIMEOUT_MS;
  let idleConnectionsCount = 0;

  for (const [clientId, lastActivity] of connectionLastActivity.entries()) {
    if (lastActivity < idleTimeThreshold) {
      console.log(`[IDLE CHECK] Disconnecting inactive client: ${clientId}, idle for ${Math.floor((now - lastActivity)/1000)}s`);
      
      const client = activeConnections.get(clientId);
      if (client) {
        await client.disconnect();
        idleConnectionsCount++;
      }

      // Remove from tracking even if client reference is gone
      activeConnections.delete(clientId);
      connectionLastActivity.delete(clientId);
    }
  }

  if (idleConnectionsCount > 0) {
    console.log(`[IDLE CHECK] Disconnected ${idleConnectionsCount} idle clients`);
  } else {
    console.log('[IDLE CHECK] No idle clients found');
  }
  
  return idleConnectionsCount;
}

// Create client function
async function createClient() {
  const client = new MockSogniClient();
  return client;
}

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
  console.log('\n======= MOCK IDLE TIMEOUT TEST =======\n');
  console.log(`This test verifies clients are disconnected after ${TEST_IDLE_TIMEOUT_MS/1000} seconds of inactivity`);
  
  try {
    // Step 1: Make sure we start with no connections
    if (activeConnections.size > 0) {
      for (const [clientId, client] of activeConnections.entries()) {
        await client.disconnect();
      }
    }
    
    // Step 2: Create a client that will become idle
    console.log('\nCreating idle client...');
    const idleClient = await createClient();
    console.log('✓ Idle client created');
    
    // Step 3: Verify we have one active client
    const initialCount = getActiveConnectionsCount();
    reportTest('Initial count check', initialCount === 1, 
      `Expected 1 active connection, found ${initialCount}`);
    
    // Step 4: Wait for timeout to occur
    await sleepWithCountdown(TEST_IDLE_TIMEOUT_MS/1000 + 1, 'Waiting for idle timeout');
    
    // Step 5: Run idle check
    await checkIdleConnections();
    
    // Step 6: Verify client was disconnected by idle timeout
    const afterTimeoutCount = getActiveConnectionsCount();
    const timeoutPassed = afterTimeoutCount === 0;
    
    reportTest('Idle timeout cleanup', timeoutPassed, 
      timeoutPassed ? 
        'Client was properly disconnected by idle timeout' : 
        `Client was NOT disconnected, still have ${afterTimeoutCount} active connections`);
    
    // Step 7: Create an active client that shouldn't time out
    console.log('\nCreating an active client that will keep sending activity signals...');
    const activeClient = await createClient();
    console.log('✓ Active client created');
    
    // Step 8: Setup activity simulation - record activity every second
    console.log('Starting activity simulation for the client...');
    
    // Simulate activity for the duration of our test
    for (let i = 0; i < TEST_IDLE_TIMEOUT_MS/1000; i++) {
      recordClientActivity(activeClient.appId);
      process.stdout.write('.');
      await setTimeout(1000);
    }
    console.log('\n✓ Activity simulation completed');
    
    // Step 9: Check for idle connections - active client should NOT be disconnected
    await checkIdleConnections();
    
    // Step 10: Verify the active client wasn't disconnected
    const afterActiveCheckCount = getActiveConnectionsCount();
    const activeClientTest = afterActiveCheckCount === 1;
    
    reportTest('Active client persistence', activeClientTest, 
      activeClientTest ? 
        'Active client was correctly kept alive during activity' : 
        `Active client was incorrectly disconnected, have ${afterActiveCheckCount} active connections`);
    
    // Step 11: Let the active client become idle
    console.log('\nLetting active client become idle...');
    await sleepWithCountdown(TEST_IDLE_TIMEOUT_MS/1000 + 1, 'Waiting for active client to time out');
    
    // Step 12: Check for idle connections again - now the active client should be disconnected
    await checkIdleConnections();
    
    // Step 13: Verify the client was disconnected
    const finalCount = getActiveConnectionsCount();
    const finalTest = finalCount === 0;
    
    reportTest('Final idle timeout', finalTest, 
      finalTest ? 
        'Active client was properly disconnected after becoming idle' : 
        `Client was NOT disconnected, still have ${finalCount} active connections`);
    
    // Return true if all tests passed
    return timeoutPassed && activeClientTest && finalTest;
  } catch (error) {
    console.error('Error during idle timeout test:', error);
    return false;
  }
}

// Run the test
console.log('Starting mock idle timeout test...');
runIdleTimeoutTest()
  .then(success => {
    if (success) {
      console.log('✅ Mock idle timeout test completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Mock idle timeout test failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test failed with unhandled error:', error);
    process.exit(1);
  }); 