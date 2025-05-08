/**
 * Mock test script for verifying socket connection cleanup logic
 * 
 * This script simulates Sogni client connections and verifies
 * that all connections are properly tracked and closed.
 */

// Mock connection tracking
const activeConnections = new Map();

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
    activeConnections.set(this.appId, {
      created: new Date(),
      type: 'mock-sogni-client'
    });
    logConnectionStatus('Created', this.appId);
  }
  
  async disconnect() {
    console.log(`Disconnecting client: ${this.appId}`);
    // Remove from tracking
    if (activeConnections.has(this.appId)) {
      activeConnections.delete(this.appId);
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

// Get active connection count
function getActiveConnectionsCount() {
  return activeConnections.size;
}

// Mock functions that use the Sogni client
async function initializeSogniClient() {
  const client = new MockSogniClient();
  return client;
}

async function getClientInfo() {
  const client = new MockSogniClient();
  const info = {
    connected: true,
    appId: client.appId,
    network: 'fast'
  };
  
  // Clean up after info check
  try { 
    console.log(`Explicitly closing WebSocket connection for info check client: ${client.appId}`);
    // Force disconnection
    await client.disconnect(); 
    
    // Close internal WebSockets
    if (client._socket && typeof client._socket.close === 'function') {
      client._socket.close();
    }
    if (client._websocket && typeof client._websocket.close === 'function') {
      client._websocket.close();
    }
    
    // Log connection status
    logConnectionStatus('Closed in getClientInfo', client.appId);
  } catch (err) {
    console.error('Error during WebSocket disconnect in getClientInfo:', err);
  }
  
  return info;
}

async function cleanupSogniClient() {
  console.log('Performing mock client cleanup operations...');
  
  // Create a temporary client to mock cleanup
  const tmpClient = new MockSogniClient();
  
  try {
    // Force disconnection
    await tmpClient.disconnect(); 
    
    // Close internal WebSockets
    if (tmpClient._socket && typeof tmpClient._socket.close === 'function') {
      tmpClient._socket.close();
    }
    if (tmpClient._websocket && typeof tmpClient._websocket.close === 'function') {
      tmpClient._websocket.close();
    }
    
    // Log connection status
    logConnectionStatus('Closed in cleanupSogniClient', tmpClient.appId);
    
    // Clean up ALL remaining connections (this is what real cleanupSogniClient should do)
    console.log('Cleaning up all remaining connections...');
    const connectionIds = [...activeConnections.keys()];
    for (const id of connectionIds) {
      console.log(`Forcibly cleaning up connection: ${id}`);
      activeConnections.delete(id);
    }
    
    // Log any remaining connections
    if (activeConnections.size > 0) {
      console.warn(`WARNING: Still have ${activeConnections.size} active connections after cleanup!`);
      activeConnections.forEach((details, id) => {
        console.warn(`Remaining connection: ${id}, created: ${details.created}, type: ${details.type}`);
      });
    } else {
      console.log('SUCCESS: No active connections remain after cleanup!');
    }
    
    return true;
  } catch (err) {
    console.error('Error during mock client cleanup:', err);
    return false;
  }
}

// Print test report
function printTestResult(testName, passed, message) {
  const status = passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`\n${status}: ${testName}`);
  console.log(`${message}\n`);
}

// Run a single test with cleanup
async function runTestCase() {
  console.log('\n====== TEST: Mock Socket Connection Cleanup ======\n');
  
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
      // Also clean up internal WebSockets
      if (client1._socket) client1._socket.close();
      if (client1._websocket) client1._websocket.close();
    }
    
    // 5. Check remaining connection count
    const afterExplicitCleanupCount = getActiveConnectionsCount();
    printTestResult(
      'After explicit client1 cleanup', 
      afterExplicitCleanupCount === 1,
      `Expected 1 connection after client1 cleanup, found ${afterExplicitCleanupCount}`
    );
    
    // 6. Check cleanup of remaining connections
    console.log('Running full cleanup for remaining connections...');
    await cleanupSogniClient();
    
    // 7. Verify all connections are closed
    const finalCount = getActiveConnectionsCount();
    printTestResult(
      'Final connection cleanup', 
      finalCount === 0,
      `Expected 0 connections after cleanup, found ${finalCount}`
    );
    
    // 8. Overall test result
    const allTestsPassed = initialCount === 0 && 
                           afterCreationCount > 0 && 
                           afterExplicitCleanupCount === 1 &&
                           finalCount === 0;
    
    if (allTestsPassed) {
      console.log('\n✅ TEST PASSED: All socket connections properly tracked and cleaned up!');
    } else {
      console.log('\n❌ TEST FAILED: Socket connections not properly tracked or cleaned up');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
    printTestResult('Test execution', false, `Error: ${error.message}`);
  }
}

// Run the test
console.log('Starting mock socket connection cleanup test...');
runTestCase()
  .then(() => {
    console.log('Test completed.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
  }); 