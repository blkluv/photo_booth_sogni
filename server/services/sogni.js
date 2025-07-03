/* global process */
import { SogniClient } from '@sogni-ai/sogni-client';
import dotenv from 'dotenv';
// import fs from 'fs'; // removed unused
// import path from 'path'; // removed unused

// Load environment variables
dotenv.config();

// Add connection tracking
export const activeConnections = new Map();
// Add session tracking - map session IDs to client IDs
export const sessionClients = new Map();

// Add timeout tracking for activity
const connectionLastActivity = new Map();
const NORMAL_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TEST_INACTIVITY_TIMEOUT_MS = 10 * 1000; // 10 seconds for tests

// Use shorter timeout for tests if specified
const INACTIVITY_TIMEOUT_MS = process.env.REDUCED_TIMEOUT ? 
  TEST_INACTIVITY_TIMEOUT_MS : NORMAL_INACTIVITY_TIMEOUT_MS;

// Keep track of recent status checks to prevent duplicate client creation
const recentStatusChecks = new Map();
const STATUS_CHECK_TTL = 30 * 1000; // 30 seconds

// Helper function to log connection status
export function getActiveConnectionsCount() {
  return activeConnections.size;
}

export function logConnectionStatus(operation, clientId) {
  console.log(`[CONNECTION TRACKER] ${operation} - Client: ${clientId}`);
  console.log(`[CONNECTION TRACKER] Active connections: ${activeConnections.size}`);
  if (activeConnections.size > 0) {
    console.log('[CONNECTION TRACKER] All active app-ids:');
    for (const appId of activeConnections.keys()) {
      console.log(`  - ${appId}`);
    }
  }
  return activeConnections.size;
}

// Helper to record activity on a client
function recordClientActivity(clientId) {
  if (clientId) {
    connectionLastActivity.set(clientId, Date.now());
    // Uncomment for debugging
    // console.log(`[ACTIVITY] Recorded activity for client: ${clientId}`);
  }
}

// Helper to clear invalid tokens
export function clearInvalidTokens() {
  console.log('[AUTH] Clearing invalid cached tokens');
  sogniTokens = null;
  if (createSogniClient._globalTokens) {
    createSogniClient._globalTokens = null;
  }
}

// Helper to force clear all cached tokens and restart authentication
export async function forceAuthReset() {
  console.log('[AUTH] Force clearing ALL cached tokens and clients');
  
  // Clear global token cache
  sogniTokens = null;
  if (createSogniClient._globalTokens) {
    createSogniClient._globalTokens = null;
  }
  
  // Clear pending client cache
  if (createSogniClient._pendingClients) {
    createSogniClient._pendingClients.clear();
  }
  
  // Clear status check cache
  if (recentStatusChecks) {
    recentStatusChecks.clear();
  }
  
  // Cleanup all active clients to force fresh authentication
  await cleanupSogniClient({ logout: true, includeSessionClients: true });
  
  console.log('[AUTH] Force auth reset completed - all clients will re-authenticate on next request');
}

// Setup periodic check for idle connections
export const checkIdleConnections = async () => {
  const now = Date.now();
  const idleTimeThreshold = now - INACTIVITY_TIMEOUT_MS;
  let idleConnectionsCount = 0;

  // First identify all idle clients
  const idleClients = [];
  for (const [clientId, lastActivity] of connectionLastActivity.entries()) {
    if (lastActivity < idleTimeThreshold) {
      console.log(`[IDLE CHECK] Found inactive client: ${clientId}, idle for ${Math.floor((now - lastActivity)/1000)}s`);
      
      const client = activeConnections.get(clientId);
      if (client) {
        idleClients.push({ clientId, client });
      } else {
        // No client object but still in tracking maps - clean up metadata
        console.log(`[IDLE CHECK] Cleaning up tracking for missing client: ${clientId}`);
        connectionLastActivity.delete(clientId);
      }
    }
  }

  // Also clean up orphaned session clients
  console.log(`[IDLE CHECK] Checking for orphaned session clients...`);
  const orphanedSessions = [];
  for (const [sessionId, clientId] of sessionClients.entries()) {
    // Check if the client exists and if it's active
    if (!activeConnections.has(clientId) || 
        (connectionLastActivity.has(clientId) && 
         connectionLastActivity.get(clientId) < idleTimeThreshold)) {
      
      orphanedSessions.push({ sessionId, clientId });
    }
  }
  
  if (orphanedSessions.length > 0) {
    console.log(`[IDLE CHECK] Found ${orphanedSessions.length} orphaned session clients`);
    for (const { sessionId, clientId } of orphanedSessions) {
      console.log(`[IDLE CHECK] Cleaning up orphaned session: ${sessionId} with client: ${clientId}`);
      
      // Check if client still exists
      const client = activeConnections.get(clientId);
      if (client) {
        try {
          // Disconnect if there's an actual client reference
          await disconnectClient(client);
        } catch (err) {
          console.error(`[IDLE CHECK] Error disconnecting orphaned client ${clientId}:`, err);
        }
      }
      
      // Always remove the session mapping
      sessionClients.delete(sessionId);
    }
  }

  // Then disconnect idle clients
  if (idleClients.length > 0) {
    console.log(`[IDLE CHECK] Disconnecting ${idleClients.length} idle clients`);
    
    // Process each idle client
    for (const { clientId, client } of idleClients) {
      try {
        // Let disconnectClient handle the removal from maps
        await disconnectClient(client);
        idleConnectionsCount++;
      } catch (err) {
        console.error(`[IDLE CHECK] Error disconnecting idle client ${clientId}:`, err);
        // If disconnectClient fails, make sure we remove from tracking maps anyway
        activeConnections.delete(clientId);
        connectionLastActivity.delete(clientId);
      }
    }
    
    console.log(`[IDLE CHECK] Successfully disconnected ${idleConnectionsCount} idle clients`);
  }
};

// Run idle check every minute
const idleCheckInterval = setInterval(() => {
  checkIdleConnections().catch(err => {
    console.error('[IDLE CHECK] Error during idle client cleanup:', err);
  });
}, 60 * 1000);

// Clean shutdown handler
process.on('SIGTERM', () => {
  clearInterval(idleCheckInterval);
  console.log('Cleaning up Sogni connections before shutdown...');
  cleanupSogniClient({ logout: true })
    .then(() => {
      console.log('Completed Sogni cleanup on shutdown');
    })
    .catch(err => {
      console.error('Error during Sogni cleanup on shutdown:', err);
    });
});

// Get Sogni URLs based on environment
const getSogniUrls = (env) => {
  const SOGNI_HOSTS = {
    'local': { socket: 'wss://socket-local.sogni.ai', api: 'https://api-local.sogni.ai' },
    'staging': { socket: 'wss://socket-staging.sogni.ai', api: 'https://api-staging.sogni.ai' },
    'production': { socket: 'wss://socket.sogni.ai', api: 'https://api.sogni.ai' },
  };

  const sogniEnv = env || 'production';
  
  if (!SOGNI_HOSTS[sogniEnv]) {
    throw new Error(`Invalid SOGNI_ENV: ${sogniEnv}. Must be one of: ${Object.keys(SOGNI_HOSTS).join(', ')}`);
  }
  
  return SOGNI_HOSTS[sogniEnv];
};

// Cache tokens for login efficiency
let sogniTokens = null; // { token, refreshToken }
let sogniUsername = null;
let sogniAppId = null;
let sogniEnv = null;
let sogniUrls = null;

// Handle WebSocket errors more gracefully
const handleSocketError = (error) => {
  // Check for common WebSocket race condition errors during page refresh
  if (error && (
    (error.message && typeof error.message === 'string' && (
      error.message.includes('closed before') ||
      error.message.includes('WebSocket was closed') ||
      error.message.includes('WebSocket is not open')
    )) ||
    (error.code === 'ECONNRESET') ||
    // Handle specific WebSocket close codes that indicate normal closure
    (error.code === 1000) || // Normal closure
    (error.code === 1001) || // Going away (e.g., page close)
    (error.code === 1005)    // No status code
  )) {
    // This is an expected error during page navigation, just log it
    console.log('Ignored WebSocket connection race error:', error.message || error.code || 'unknown error');
    return true; // Error was handled
  }
  
  // Not a known error we can ignore
  return false;
};

// Add a global uncaught exception handler specific to WebSocket errors
// This will prevent the server from crashing due to WebSocket connection race conditions
process.on('uncaughtException', (err) => {
  if (handleSocketError(err)) {
    // Error was handled, no need to crash
    return;
  }
  
  // For any other uncaught exception, log it but don't crash in production
  console.error('Uncaught exception:', err);
  if (process.env.NODE_ENV !== 'production') {
    // In development, re-throw to see the stack trace
    throw err;
  }
});

// Also handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  if (handleSocketError(reason)) {
    // Error was handled, no need to do anything else
    return;
  }
  
  // For any other unhandled rejection, log it
  console.error('Unhandled promise rejection:', reason);
  
  // Log promise object in development for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.debug('Promise object:', promise);
  }
});

// Helper to create a new SogniClient for each project
async function createSogniClient(appIdPrefix, clientProvidedAppId) {
  console.log(`Creating Sogni client with app ID: ${clientProvidedAppId}`);
  
  // Cache client creation to prevent duplicates during high-load periods
  const cacheKey = clientProvidedAppId;
  
  // Check if we have a currently pending client creation for this appId
  if (!createSogniClient._pendingClients) {
    createSogniClient._pendingClients = new Map();
  }
  
  // If we have a pending promise for this client, return it
  if (createSogniClient._pendingClients.has(cacheKey)) {
    console.log(`Reusing in-flight client creation for ${cacheKey}`);
    return createSogniClient._pendingClients.get(cacheKey);
  }
  
  // Cache tokens globally for faster authentication
  if (!sogniTokens && createSogniClient._globalTokens) {
    sogniTokens = createSogniClient._globalTokens;
  }
  
  // Create client creation promise
  const clientPromise = (async () => {
    try {
      // Only allow creation if clientProvidedAppId is present
      if (!clientProvidedAppId) {
        throw new Error('clientProvidedAppId is required to create a SogniClient');
      }
      
      const generatedAppId = clientProvidedAppId;
      sogniAppId = generatedAppId;
      sogniEnv = process.env.SOGNI_ENV || 'production';
      sogniUsername = process.env.SOGNI_USERNAME;
      const password = process.env.SOGNI_PASSWORD;
      sogniUrls = getSogniUrls(sogniEnv);
      const customJsonRpcUrl = process.env.JSON_RPC_URL;
      
      // Optimized client creation with faster timeouts
      const client = await SogniClient.createInstance({
        appId: sogniAppId,
        testnet: false,
        network: "fast",
        logLevel: "info",
        restEndpoint: sogniUrls.api,
        socketEndpoint: sogniUrls.socket,
        ...(customJsonRpcUrl ? { jsonRpcUrl: customJsonRpcUrl } : {}),
        connectionTimeout: 5000, // 5 second connection timeout (reduced from default)
      });
      
      // Explicitly ensure client has the appId property set
      if (!client.appId) {
        client.appId = sogniAppId;
      }
      
      // Track this actual client
      activeConnections.set(sogniAppId, client);
      recordClientActivity(sogniAppId);
      logConnectionStatus('Created', sogniAppId);

      // Fast path: Try to restore session with tokens if available
      try {
        if (sogniTokens && sogniTokens.token && sogniTokens.refreshToken) {
          await client.account.setToken(sogniUsername, sogniTokens);
          recordClientActivity(sogniAppId); // Record activity after token set
          
          // Check if login was successful - use currentAccount.isAuthenicated
          if (!client.account.currentAccount.isAuthenicated) {
            console.log(`[AUTH] Token restoration failed for client ${sogniAppId}, performing fresh login`);
            // Clear invalid tokens
            sogniTokens = null;
            createSogniClient._globalTokens = null;
            // Fall through to fresh login
            await client.account.login(sogniUsername, password);
            console.log('EIP712', client.account.eip712.EIP712Domain)
            recordClientActivity(sogniAppId); // Record activity after login
          } else {
            // Validate that the restored tokens actually work
            console.log(`[AUTH] Validating restored tokens for client ${sogniAppId}...`);
            try {
              await client.account.refreshBalance();
              console.log(`[AUTH] Successfully restored and validated session with cached tokens for client ${sogniAppId}`);
            } catch (tokenValidationError) {
              if (tokenValidationError.status === 401 || (tokenValidationError.message && tokenValidationError.message.includes('Invalid token'))) {
                console.log(`[AUTH] Cached tokens are invalid for client ${sogniAppId}, performing fresh login`);
                // Clear invalid tokens
                sogniTokens = null;
                createSogniClient._globalTokens = null;
                // Fall through to fresh login
                await client.account.login(sogniUsername, password);
                console.log('EIP712', client.account.eip712.EIP712Domain)
                recordClientActivity(sogniAppId); // Record activity after login
              } else {
                // Non-auth error, assume tokens are valid but there's a network issue
                console.warn(`[AUTH] Token validation failed with non-auth error for client ${sogniAppId}: ${tokenValidationError.message}`);
                console.log(`[AUTH] Assuming tokens are valid despite validation error`);
              }
            }
          }
        } else {
          // No tokens available, do a fresh login
          console.log(`[AUTH] No cached tokens available, performing fresh login for client ${sogniAppId}`);
          
          try {
            console.log(`[AUTH] Calling client.account.login() for client ${sogniAppId}...`);
            await client.account.login(sogniUsername, password);
            console.log('EIP712', client.account.eip712.EIP712Domain)
            console.log(`[AUTH] Login call completed for client ${sogniAppId}, isAuthenicated: ${client.account.currentAccount.isAuthenicated}`);
            
            // Add a small delay to allow for async state updates
            await new Promise(resolve => setTimeout(resolve, 100));
            
            console.log(`[AUTH] After login - account state:`, {
              isAuthenicated: client.account.currentAccount.isAuthenicated,
              hasCurrentAccount: !!client.account.currentAccount,
              hasToken: !!client.account.currentAccount.token,
              hasRefreshToken: !!client.account.currentAccount.refreshToken
            });
            recordClientActivity(sogniAppId); // Record activity after login
          } catch (loginError) {
            console.error(`[AUTH] Login call failed for client ${sogniAppId}:`, loginError);
            throw loginError; // Re-throw to be caught by outer catch block
          }
        }
      } catch (e) {
        // Login retry on failure, with minimal logging
        console.log(`[AUTH] Login failed for client ${sogniAppId}, retrying:`, e.message);
        console.log(`[AUTH] Error details:`, e);
        // Clear any potentially invalid tokens
        sogniTokens = null;
        createSogniClient._globalTokens = null;
        
        try {
          await client.account.login(sogniUsername, password);
          console.log('EIP712', client.account.eip712.EIP712Domain)
          console.log(`[AUTH] Retry login completed for client ${sogniAppId}, isAuthenicated: ${client.account.currentAccount.isAuthenicated}`);
          recordClientActivity(sogniAppId); // Record activity even after error recovery
        } catch (retryError) {
          console.error(`[AUTH] Retry login also failed for client ${sogniAppId}:`, retryError);
          throw retryError;
        }
      }
      
      // Validate final authentication state
      console.log(`[AUTH] Final validation for client ${sogniAppId}: isAuthenicated=${client.account.currentAccount.isAuthenicated}, hasAccount=${!!client.account.currentAccount}, hasToken=${!!client.account.currentAccount.token}`);
      
      // Primary validation: if we got here without throwing an error, login was successful
      // Secondary validation: check isAuthenicated flag and token presence
      if (!client.account.currentAccount.isAuthenicated) {
        console.warn(`[AUTH] Warning: isAuthenicated is false for client ${sogniAppId}, but login didn't throw an error`);
        // Don't throw an error here - the login might still be valid
      }
      
      if (!client.account.currentAccount || !client.account.currentAccount.token) {
        console.error(`[AUTH] Final authentication validation failed for client ${sogniAppId}: no tokens available`);
        throw new Error(`Failed to authenticate client ${sogniAppId}: no tokens available`);
      }
      
      console.log(`[AUTH] Final authentication validation successful for client ${sogniAppId}`);
      
      // Save tokens for reuse
      if (client.account.currentAccount && client.account.currentAccount.token && client.account.currentAccount.refreshToken) {
        const tokens = {
          token: client.account.currentAccount.token,
          refreshToken: client.account.currentAccount.refreshToken,
        };
        
        // Store both in instance variable and static cache
        sogniTokens = tokens;
        createSogniClient._globalTokens = tokens;
        console.log(`[AUTH] Saved tokens for client ${sogniAppId}`);
      }
      
      // Add event listeners to record activity on any client events
      if (client.on) {
        client.on('*', () => recordClientActivity(client.appId || sogniAppId));
      }
      
      // Add WebSocket error handlers to prevent uncaught exceptions
      if (client._socket) {
        client._socket.addEventListener('error', (err) => {
          if (err.message && err.message.includes('closed before')) {
            console.log(`Ignored WebSocket connection race error for client ${client.appId || sogniAppId}`);
          } else {
            console.warn(`WebSocket error for client ${client.appId || sogniAppId}:`, err);
          }
        });
      }
      
      return client;
    } catch (error) {
      console.error(`Error creating Sogni client with app ID ${clientProvidedAppId}:`, error);
      
      // Clean up tracking for this failed client
      activeConnections.delete(sogniAppId);
      connectionLastActivity.delete(sogniAppId);
      
      throw error;
    } finally {
      // Clean up cache entry
      setTimeout(() => {
        createSogniClient._pendingClients.delete(cacheKey);
      }, 5000); // Keep cache entry for 5 seconds
    }
  })();
  
  // Store in pending clients cache
  createSogniClient._pendingClients.set(cacheKey, clientPromise);
  
  return clientPromise;
}

// Standardize client disconnection
async function disconnectClient(client) {
  if (!client) return false;
  
  // Safety check: get client ID with a fallback for undefined
  const clientId = client.appId || 'unknown-client';
  console.log(`Disconnecting Sogni client: ${clientId}`);

  try {
    // Clean up event handlers if they exist
    if (client._eventHandlers) {
      try {
        // Remove all project event handlers
        if (client.projects && client.projects.off) {
          // Clean up project handlers
          if (client._eventHandlers.projectHandlers && client._eventHandlers.projectHandlers.size > 0) {
            console.log(`Removing ${client._eventHandlers.projectHandlers.size} project event handlers for client: ${clientId}`);
            
            for (const [projectId, handler] of client._eventHandlers.projectHandlers.entries()) {
              console.log(`Removing project event handler for project: ${projectId}`);
              client.projects.off('project', handler);
            }
            client._eventHandlers.projectHandlers.clear();
          }
          
          // Clean up job handlers
          if (client._eventHandlers.jobHandlers && client._eventHandlers.jobHandlers.size > 0) {
            console.log(`Removing ${client._eventHandlers.jobHandlers.size} job event handlers for client: ${clientId}`);
            
            for (const [projectId, handler] of client._eventHandlers.jobHandlers.entries()) {
              console.log(`Removing job event handler for project: ${projectId}`);
              client.projects.off('job', handler);
            }
            client._eventHandlers.jobHandlers.clear();
          }
        }
        
        // Remove the activity handler
        if (client.off && client._eventHandlers.activityHandler) {
          console.log(`Removing activity handler for client: ${clientId}`);
          client.off('*', client._eventHandlers.activityHandler);
          client._eventHandlers.activityHandler = null;
        }
        
        // Clear all event handler references
        client._eventHandlers = null;
      } catch (listenerErr) {
        console.warn(`Non-critical error removing event handlers for ${clientId}:`, listenerErr);
      }
    }
    
    // Force close any socket connections first
    if (client._socket) {
      console.log(`Closing socket connection for client: ${clientId}`);
      try {
        client._socket.close();
      } catch (socketErr) {
        if (!handleSocketError(socketErr)) {
          console.warn(`Non-critical error closing socket for ${clientId}:`, socketErr);
        }
      }
    }
    
    // Call the primary disconnect method
    if (client.disconnect) {
      console.log(`Calling client.disconnect() for: ${clientId}`);
      await client.disconnect();
    }
    
    // If there's an account object, try to clean that up too
    if (client.account && client.account.logout) {
      try {
        console.log(`Logging out account for client: ${clientId}`);
        await client.account.logout();
      } catch (logoutErr) {
        // Check specifically for authorization errors (401)
        if (logoutErr.status === 401 || 
            (logoutErr.message && logoutErr.message.includes('Authorization header required'))) {
          console.log(`Auth token already expired for ${clientId}, this is expected during cleanup`);
        } else {
          console.warn(`Non-critical error during logout for ${clientId}:`, logoutErr);
        }
      }
    }
    
    // Remove from our tracking - handle case where appId might be undefined
    if (clientId && clientId !== 'unknown-client') {
      activeConnections.delete(clientId);
      connectionLastActivity.delete(clientId);
      logConnectionStatus('Disconnected', clientId);
    } else {
      console.warn(`Unable to cleanup client with missing appId: ${JSON.stringify({
        hasAppId: !!client.appId,
        appIdType: typeof client.appId,
        clientKeys: Object.keys(client)
      })}`);
      
      // Try to find and remove from connections by reference
      for (const [key, value] of activeConnections.entries()) {
        if (value === client) {
          console.log(`Found client by reference with key: ${key}`);
          activeConnections.delete(key);
          connectionLastActivity.delete(key);
          logConnectionStatus('Disconnected by reference', key);
          break;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error during client disconnection for ${clientId}:`, error);
    
    // Still remove from tracking even if disconnection fails
    if (clientId && clientId !== 'unknown-client') {
      activeConnections.delete(clientId);
      connectionLastActivity.delete(clientId);
      logConnectionStatus('Disconnect failed, cleaned up tracking', clientId);
    } else {
      // Try to find and remove from connections by reference
      for (const [key, value] of activeConnections.entries()) {
        if (value === client) {
          console.log(`Found client by reference with key: ${key}`);
          activeConnections.delete(key);
          connectionLastActivity.delete(key);
          logConnectionStatus('Disconnect failed, cleaned up by reference', key);
          break;
        }
      }
    }
    
    // Don't throw the error, just return false to indicate failure
    // This prevents cascading errors during cleanup
    return false;
  }
}

export async function getClientInfo(sessionId, clientAppId) {
  // Generate a tracking ID for this status check
  const trackingId = `status-${Date.now()}`;
  
  try {
    // If this session made a recent status check, don't create a new client
    if (sessionId && recentStatusChecks.has(sessionId)) {
      const { timestamp, clientInfo } = recentStatusChecks.get(sessionId);
      
      // If the check is recent enough (within 30 seconds), just return the cached result
      if (Date.now() - timestamp < STATUS_CHECK_TTL) {
        console.log(`[STATUS] Using cached status info for session ${sessionId} (${Math.floor((Date.now() - timestamp)/1000)}s old)`);
        return clientInfo;
      }
    }
    
    // Determine the app ID to use for this temporary client
    // If clientAppId is provided, use it directly instead of generating a temporary one
    // This makes tracking more consistent across status checks
    const tempClientId = clientAppId || `${trackingId}`;
    
    // Create a temporary client for the status check
    console.log(`[STATUS] Creating temporary client for status check ${trackingId}, using clientAppId: ${tempClientId}`);
    let client;
    
    try {
      client = await createSogniClient(trackingId, tempClientId);
      
      // Double-check the client has an appId property to avoid "unknown-client" issues
      if (!client.appId && tempClientId) {
        console.log(`Manually setting missing appId on status client to: ${tempClientId}`);
        client.appId = tempClientId;
      }
      
      // Record activity for this client
      recordClientActivity(client.appId || tempClientId);
      
      const info = {
        connected: true,
        appId: client.appId || tempClientId,
        network: client.network,
        authenticated: client.account.currentAccount.isAuthenicated
      };
      
      // If we have a sessionId, cache this result
      if (sessionId) {
        recentStatusChecks.set(sessionId, {
          timestamp: Date.now(),
          clientInfo: info
        });
        
        // Cleanup old entries every 10 minutes
        setTimeout(() => {
          recentStatusChecks.delete(sessionId);
        }, STATUS_CHECK_TTL);
      }
      
      return info;
    } finally {
      // Always disconnect this temporary client when done with getClientInfo
      // But only if we don't want to keep it (when clientAppId is provided)
      if (client) {
        try {
          await disconnectClient(client);
        } catch (disconnectError) {
          console.warn(`Non-critical error disconnecting temporary status client:`, disconnectError);
        }
      }
    }
  } catch (error) {
    console.error(`[STATUS] Error in status check ${trackingId}:`, error);
    throw error;
  }
}

export async function generateImage(client, params, progressCallback) {
  if (!client) {
    throw new Error('A valid Sogni client must be provided to generateImage');
  }
  
  try {
    // Record activity for this client
    recordClientActivity(client.appId);
    
    const isEnhancement = params.startingImage !== undefined;
    
    const projectOptions = {
      modelId: params.selectedModel,
      positivePrompt: params.positivePrompt || '',
      negativePrompt: params.negativePrompt || '',
      stylePrompt: params.stylePrompt || '',
      sizePreset: 'custom',
      width: params.width,
      height: params.height,
      steps: isEnhancement ? 4 : 7,
      guidance: params.promptGuidance || (isEnhancement ? 1 : 7),
      numberOfImages: params.numberImages || 1,
      // numberOfPreviews: params.numberPreviews || 1,
      scheduler: 'DPM Solver Multistep (DPM-Solver++)',
      timeStepSpacing: 'Karras',
      disableNSFWFilter: true,
      ...(params.seed !== undefined ? { seed: params.seed } : {})
    };
    
    // Add image data BEFORE creating the project
    if (isEnhancement) {
      projectOptions.startingImage = params.startingImage instanceof Uint8Array 
        ? params.startingImage 
        : new Uint8Array(params.startingImage);
      projectOptions.startingImageStrength = params.startingImageStrength || 0.85;
    } else if (params.imageData) {
      projectOptions.controlNet = {
        name: 'instantid',
        image: params.imageData instanceof Uint8Array 
          ? params.imageData 
          : new Uint8Array(params.imageData),
        strength: params.controlNetStrength || 0.8,
        mode: 'balanced',
        guidanceStart: 0,
        guidanceEnd: params.controlNetGuidanceEnd || 0.3,
      };
    } else {
      console.warn("No starting image or controlNet image data provided.");
    }
    
    // Create the project with all options including image data
    const project = await client.projects.create(projectOptions);
    const projectId = project.id;
    
    console.log(`Created project with ID: ${projectId}`);

    // Initialize event tracker object if it doesn't exist
    if (!client._eventHandlers) {
      client._eventHandlers = {
        projectHandlers: new Map(),
        jobHandlers: new Map(),
        activityHandler: null
      };
    }

    // Set up global activity tracking if not already done
    if (!client._eventHandlers.activityHandler) {
      client._eventHandlers.activityHandler = () => {
        recordClientActivity(client.appId);
      };
      
      // Record activity on all client events
      if (client.on) {
        client.on('*', client._eventHandlers.activityHandler);
      }
    }

    // Now create project-specific handlers that filter by project ID
    const projectHandler = (event) => {
      // Only process events for this specific project
      if (event.projectId !== projectId) {
        return;
      }
      /* Example of each event we can expect:
      {
        type: 'queued',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE',
        queuePosition: 1
      }
      {
        type: 'completed',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE'
      }
      {
        type: 'error',
        projectId: 'F0C3F0C4-0CE3-4CBC-8A8D-B9D7F978AE8C',
        error: { code: 4013, message: 'Model not found' }
      }
      */
      
      let progressEvent;
      switch (event.type) {
        case 'queued':
          progressEvent = {
            type: 'queued',
            queuePosition: event.queuePosition,
          };
          break;
        case 'completed':
          progressEvent = {
            type: 'completed',
          };
          
          // Check if all expected jobs are completed
          if (project) {
            // Get the expected number of jobs from the project
            const expectedJobs = project.numberOfImages || project.jobs?.length || 0;
            
            // Count how many jobs actually completed
            let completedJobs = project.jobs?.filter(job => 
              job.status === 'completed' || job.resultUrl
            ).length || 0;
            
            // Initialize a set to track job IDs that completed outside REST data
            if (!project._extraCompletedJobIds) {
              project._extraCompletedJobIds = new Set();
            }
            
            // Delay cleanup to allow any in-flight job completions to arrive
            setTimeout(() => {
              let completedJobs = project.jobs?.filter(job => 
                job.status === 'completed' || job.resultUrl
              ).length || 0;

                // Log completion status
              console.log(`Project ${projectId} completed: ${completedJobs}/${expectedJobs} jobs finished`);
              
              // If we're missing jobs, log a warning
              if (completedJobs < expectedJobs) {
                console.warn(`Project ${projectId} completed with missing jobs: ${completedJobs}/${expectedJobs}`);
                progressEvent.missingJobs = {
                  expected: expectedJobs,
                  completed: completedJobs
                };
              }
              
              // Add the imageUrls to the completion event
              const imageUrls = project.jobs
                ?.filter(job => job.resultUrl)
                .map(job => job.resultUrl) || [];
              
              if (imageUrls.length > 0) {
                progressEvent.imageUrls = imageUrls;
              }
              
              // Set a flag to indicate the project has received completion event
              project._receivedCompletionEvent = true;

              // Check if we've received any extra completed jobs after project completion
              if (project._extraCompletedJobIds && project._extraCompletedJobIds.size > 0) {
                console.log(`Received ${project._extraCompletedJobIds.size} additional job completions after project completed`);
              }
              
              // Remove project-specific handlers
              if (client._eventHandlers.projectHandlers.has(projectId)) {
                const handler = client._eventHandlers.projectHandlers.get(projectId);
                client.projects.off('project', handler);
                client._eventHandlers.projectHandlers.delete(projectId);
                console.log(`Cleaned up project event handler for ${projectId}`);
              }
              
              if (client._eventHandlers.jobHandlers.has(projectId)) {
                const handler = client._eventHandlers.jobHandlers.get(projectId);
                client.projects.off('job', handler);
                client._eventHandlers.jobHandlers.delete(projectId);
                console.log(`Cleaned up job event handler for ${projectId}`);
              }
            }, completedJobs < expectedJobs ? 2000 : 0); // Longer delay to ensure any final events are processed
          }
          break;  
        case 'error':
        case 'failed':
          progressEvent = { 
            type: 'failed',
            error: event.message || event.error || 'Unknown job error'
          };
          
          // Add explicit tracking for expected vs actual job count
          if (project && project.jobCount !== undefined) {
            const actualJobsStarted = project.jobs ? project.jobs.length : 0;
            if (actualJobsStarted < project.jobCount) {
              console.warn(`Project ${projectId} failed with job count mismatch: ${actualJobsStarted}/${project.jobCount} jobs started`);
              
              // Include the job count mismatch in the error event
              progressEvent.jobCountMismatch = {
                expected: project.jobCount,
                actual: actualJobsStarted
              };
            }
          }
          break;  
        default:
          console.warn(`Unknown project event type: ${event.type}`);
          break;
      }
      
      if (progressEvent && progressCallback) {
        progressEvent.projectId = event.projectId;
        progressCallback(progressEvent);
      }
    };
    
    const jobHandler = (event) => {
      // Only process events for this specific project
      if (event.projectId !== projectId) {
        return;
      }
      
      if (event.type !== 'progress') {
        console.log(`Job event for project ${projectId}: "${event.type}" payload:`, event);
      }
      /* Example of each event we can expect:
      {
        type: 'initiating',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE',
        jobId: '6F9FD965-0EE7-4DFB-ADB0-E3821D763DE5',
        workerName: 'vycod20',
        positivePrompt: undefined,
        negativePrompt: undefined,
        jobIndex: 0
      }
      {
        type: 'started',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE',
        jobId: '6F9FD965-0EE7-4DFB-ADB0-E3821D763DE5',
        workerName: 'vycod20',
        positivePrompt: undefined,
        negativePrompt: undefined,
        jobIndex: 0
      }
      {
        type: 'progress',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE',
        jobId: '6F9FD965-0EE7-4DFB-ADB0-E3821D763DE5',
        step: 2,
        stepCount: 20
      }
      {
        type: 'preview',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE',
        jobId: '6F9FD965-0EE7-4DFB-ADB0-E3821D763DE5',
        url: 'http...'
      }
      {
        type: 'completed',
        projectId: '049E8DDD-5022-4425-A16F-EF538068FDFE',
        jobId: '6F9FD965-0EE7-4DFB-ADB0-E3821D763DE5',
        steps: 20,
        seed: 2546631794,
        resultUrl: 'http...',
      }
      */
      
      let progressEvent;
      switch (event.type) {
        case 'initiating':
        case 'started':
          progressEvent = {
            type: event.type,
            workerName: event.workerName || 'unknown',
            positivePrompt: event.positivePrompt,
            jobIndex: event.jobIndex
          }
          break;
        case 'progress':
          progressEvent = {
            type: 'progress',
            progress: Math.floor(event.step / event.stepCount * 100),
          };
          break;
        case 'completed':
          progressEvent = {
            type: 'jobCompleted',
            resultUrl: event.resultUrl,
            positivePrompt: event.positivePrompt,
            jobIndex: event.jobIndex,
            isNSFW: event.isNSFW,
            seed: event.seed,
            steps: event.steps
          };
          
          // Log NSFW filtering issues
          if (event.isNSFW && !event.resultUrl) {
            console.warn(`Job ${event.jobId} completed but was flagged as NSFW, resultUrl is null`);
            console.warn(`Job details: seed=${event.seed}, steps=${event.steps}, project=${projectId}`);
            progressEvent.nsfwFiltered = true;
          }
          
          // Track job completion in the project
          if (project) {
            // First, check if this job is in the project's job list
            const jobInList = project.jobs?.some(job => job.id === event.jobId);
            
            if (!jobInList) {
              console.warn(`Job with id ${event.jobId} not found in the REST project data`);
              
              // If the project has already received its completion event, track this as an extra
              if (project._receivedCompletionEvent) {
                if (!project._extraCompletedJobIds) {
                  project._extraCompletedJobIds = new Set();
                }
                project._extraCompletedJobIds.add(event.jobId);
                console.log(`Added job ${event.jobId} to extra completed jobs after project completion`);
              }
            }
          }
          break;
        case 'failed':
        case 'error':
          progressEvent = {
            type: 'jobFailed',
            error: event.message || event.error || 'Unknown job error'
          };
          
          // Add explicit tracking for expected vs actual job count
          if (project && project.jobCount !== undefined) {
            const actualJobsStarted = project.jobs ? project.jobs.length : 0;
            if (actualJobsStarted < project.jobCount) {
              console.warn(`Project ${projectId} failed with job count mismatch: ${actualJobsStarted}/${project.jobCount} jobs started`);
              
              // Include the job count mismatch in the error event
              progressEvent.jobCountMismatch = {
                expected: project.jobCount,
                actual: actualJobsStarted
              };
            }
          }
          break;
        default:
          console.warn(`Unknown job event type: ${event.type}`);
          break;
      }
      
      if (progressEvent && progressCallback) {
        progressEvent.jobId = event.jobId;
        progressEvent.projectId = event.projectId;
        progressCallback(progressEvent);
      }
    };
    
    // Store the handlers in the client's handler maps, indexed by project ID
    client._eventHandlers.projectHandlers.set(projectId, projectHandler);
    client._eventHandlers.jobHandlers.set(projectId, jobHandler);
    
    // Register the event handlers
    client.projects.on('project', projectHandler);
    client.projects.on('job', jobHandler);
    
    // Set up activity tracking for this project
    project.on('updated', client._eventHandlers.activityHandler);
    
    return {
      projectId: project.id,
      client: client // Return the client reference so caller can access it
    };
  } catch (error) {
    console.error(`Error generating image:`, error);
    // In case of error, we still want to throw the error
    throw error;
  }
}

// Replace initializeSogniClient with getSogniClient
export async function initializeSogniClient(clientAppId) {
  return createSogniClient(undefined, clientAppId);
}

// Disconnect a specific session client
export async function disconnectSessionClient(sessionId, clientAppId) {
  // Track recently disconnected client IDs to prevent duplicates
  const sessionKey = `${sessionId}:${clientAppId || 'no-app-id'}`;
  
  // Check if we have a flag indicating this combination was disconnected recently
  if (disconnectSessionClient._recentDisconnects && 
      disconnectSessionClient._recentDisconnects.has(sessionKey)) {
    console.log(`[SESSION] Skipping duplicate disconnect for session ${sessionId} with client ${clientAppId} (within cache TTL)`);
    return true;
  }
  
  // Initialize the cache if it doesn't exist
  if (!disconnectSessionClient._recentDisconnects) {
    disconnectSessionClient._recentDisconnects = new Set();
  }
  
  // Add to the cache and clear after 3 seconds
  disconnectSessionClient._recentDisconnects.add(sessionKey);
  setTimeout(() => {
    if (disconnectSessionClient._recentDisconnects) {
      disconnectSessionClient._recentDisconnects.delete(sessionKey);
    }
  }, 3000);
  
  // First try to find a client by client app ID if provided
  if (clientAppId && activeConnections.has(clientAppId)) {
    const client = activeConnections.get(clientAppId);
    
    console.log(`[SESSION] Disconnecting client ${clientAppId} for session ${sessionId} by app ID`);
    
    // Remove the session mapping if it exists
    if (sessionId) {
      sessionClients.delete(sessionId);
    }
    
    if (client) {
      try {
        await disconnectClient(client);
        return true;
      } catch (error) {
        console.error(`Error disconnecting client ${clientAppId}:`, error);
        // This is a client-specific error, so we're not throwing
        // Let's try the session client lookup instead
      }
    }
  }
  
  // Fall back to session mapping
  if (sessionId && sessionClients.has(sessionId)) {
    const clientId = sessionClients.get(sessionId);
    
    // Skip if we just tried disconnecting this clientId
    if (clientId === clientAppId && clientAppId) {
      console.log(`[SESSION] Already tried disconnecting client ${clientId} directly, skipping session path`);
      return false;
    }
    
    const client = activeConnections.get(clientId);
    
    console.log(`[SESSION] Disconnecting client ${clientId} for session ${sessionId}`);
    
    if (client) {
      try {
        await disconnectClient(client);
        sessionClients.delete(sessionId);
        return true;
      } catch (error) {
        console.error(`Error disconnecting session client for ${sessionId}:`, error);
        // Don't throw this error - we've done our best
        sessionClients.delete(sessionId);
        return false;
      }
    } else {
      // Client not found in active connections, just clean up the session mapping
      console.log(`[SESSION] Client ${clientId} not found in active connections`);
      sessionClients.delete(sessionId);
    }
  } else {
    console.log(`[SESSION] No client found for session ${sessionId}`);
  }
  
  return false;
}

// Update cleanupSogniClient to leave session clients alone by default
export async function cleanupSogniClient({ logout = false, includeSessionClients = false } = {}) {
  const sessionClientIds = new Set(sessionClients.values());
  const nonSessionClients = [...activeConnections.entries()]
    .filter(([clientId]) => includeSessionClients || !sessionClientIds.has(clientId));
  
  console.log(`Cleaning up ${nonSessionClients.length} of ${activeConnections.size} active Sogni connections...`);
  if (!includeSessionClients && sessionClientIds.size > 0) {
    console.log(`Preserving ${sessionClientIds.size} session clients`);
  }
  
  // Process each client sequentially to avoid race conditions
  for (const [clientId, client] of nonSessionClients) {
    if (client) {
      console.log(`Cleaning up client: ${clientId}`);
      
      try {
        // Handle logout first if requested
        if (logout && client.account && client.account.logout) {
          console.log(`Logging out client ${clientId}`);
          await client.account.logout();
          console.log(`Client ${clientId} logged out successfully`);
          
          // Only clear tokens on explicit logout request
          if (clientId === sogniAppId) {
            sogniTokens = null;
          }
        }
        
        // Then disconnect the client (which will also clean up tracking)
        await disconnectClient(client);
        console.log(`Client ${clientId} successfully disconnected`);
      } catch (error) {
        console.error(`Error handling client ${clientId} during cleanup:`, error);
        
        // Ensure client is removed from tracking even if disconnect fails
        activeConnections.delete(clientId);
        connectionLastActivity.delete(clientId);
      }
    }
  }
  
  console.log('Sogni client cleanup completed');
  return true;
}

// Get or create a Sogni client for a session
export async function getSessionClient(sessionId, clientAppId) {
  console.log(`[SESSION] Getting client for session ${sessionId} with app ID: ${clientAppId}`);
  
  // Cache key for this request
  const cacheKey = `${sessionId}:${clientAppId || ''}`;
  
  // Check request cache first (short-lived to prevent duplicates)
  if (!getSessionClient._requestCache) {
    getSessionClient._requestCache = new Map();
  }
  
  // If we have a pending promise for this exact request, return it
  if (getSessionClient._requestCache.has(cacheKey)) {
    const cachedPromise = getSessionClient._requestCache.get(cacheKey);
    const cacheTimestamp = getSessionClient._requestCacheTimestamps?.get(cacheKey) || 0;
    
    // Only use cache if it's fresh (last 10 seconds)
    if (Date.now() - cacheTimestamp < 10000) {
      console.log(`[SESSION] Reusing in-flight request for ${cacheKey} from cache`);
      return cachedPromise;
    }
  }
  
  // Create a promise for this session request
  const clientPromise = (async () => {
    try {
      // Helper function to validate client authentication
      const validateClientAuth = async (client) => {
        if (!client || !client.account) {
          return false;
        }
        
        // Check if client is logged in - use currentAccount.isAuthenicated
        if (!client.account.currentAccount.isAuthenicated) {
          console.log(`[SESSION] Client ${client.appId} is not authenticated`);
          return false;
        }
        
        // Check if we have valid tokens
        if (!client.account.currentAccount || !client.account.currentAccount.token) {
          console.log(`[SESSION] Client ${client.appId} has no valid tokens`);
          return false;
        }
        
        // Actually test if the tokens are valid by making a simple API call
        try {
          console.log(`[SESSION] Testing token validity for client ${client.appId}...`);
          // Use a lightweight API call to test token validity
          await client.account.refreshBalance();
          console.log(`[SESSION] Client ${client.appId} authentication appears valid (tokens tested successfully)`);
          return true;
        } catch (error) {
          // If we get a 401 or auth error, the tokens are invalid
          if (error.status === 401 || (error.message && error.message.includes('Invalid token'))) {
            console.log(`[SESSION] Client ${client.appId} has invalid/expired tokens (${error.message})`);
            // Clear the invalid tokens
            try {
              await client.account.logout();
            } catch (logoutError) {
              // Ignore logout errors - we just want to clear the state
            }
            return false;
          } else {
            // For other errors, log but assume tokens are valid (network issues, etc.)
            console.warn(`[SESSION] Client ${client.appId} token validation failed with non-auth error: ${error.message}`);
            return true;
          }
        }
      };
      
      // If client app ID is provided and we already have this client
      if (clientAppId && activeConnections.has(clientAppId)) {
        const existingClient = activeConnections.get(clientAppId);
        
        // Validate authentication before reusing
        if (await validateClientAuth(existingClient)) {
          // Update the session mapping
          if (sessionId && existingClient) {
            const oldClientId = sessionClients.get(sessionId);
            
            // If this session was mapped to a different client, log it
            if (oldClientId && oldClientId !== clientAppId) {
              console.log(`[SESSION] Session ${sessionId} was previously mapped to ${oldClientId}, updating to ${clientAppId}`);
            }
            
            // Update the mapping
            sessionClients.set(sessionId, clientAppId);
            console.log(`[SESSION] Reusing client ${clientAppId} for session ${sessionId} (by app ID)`);
            
            // Record activity to keep the client active
            recordClientActivity(clientAppId);
            return existingClient;
          }
        } else {
          console.log(`[SESSION] Client ${clientAppId} authentication invalid, will create new client`);
          // Remove the invalid client from tracking
          activeConnections.delete(clientAppId);
          connectionLastActivity.delete(clientAppId);
        }
      }
      
      // If this session already has a client assigned
      if (sessionId && sessionClients.has(sessionId)) {
        const clientId = sessionClients.get(sessionId);
        const existingClient = activeConnections.get(clientId);
        
        // If the client still exists and is valid
        if (existingClient && await validateClientAuth(existingClient)) {
          console.log(`[SESSION] Reusing existing client ${clientId} for session ${sessionId}`);
          recordClientActivity(clientId);
          return existingClient;
        } else {
          console.log(`[SESSION] Client ${clientId} no longer exists or authentication invalid for session ${sessionId}, creating new one`);
          // Clean up invalid client
          if (existingClient) {
            activeConnections.delete(clientId);
            connectionLastActivity.delete(clientId);
          }
          sessionClients.delete(sessionId);
        }
      }
      
      // Prefer the client-provided app ID to ensure consistency
      const appId = clientAppId || `session-${sessionId}`;
      
      // Create a new client for this session (optimized)
      console.log(`[SESSION] Creating new client for session ${sessionId} with app ID: ${appId}`);
      const client = await createSogniClient(undefined, appId);
      
      // Store the session-to-client mapping
      if (sessionId && client && client.appId) {
        sessionClients.set(sessionId, client.appId);
        console.log(`[SESSION] Mapped session ${sessionId} to client ${client.appId}`);
      }
      
      return client;
    } finally {
      // Always clean up the cache entry for this request
      setTimeout(() => {
        getSessionClient._requestCache.delete(cacheKey);
        if (getSessionClient._requestCacheTimestamps) {
          getSessionClient._requestCacheTimestamps.delete(cacheKey);
        }
      }, 10000); // Keep the cache entry for 10 seconds to avoid duplicate requests
    }
  })();
  
  // Store in request cache with timestamp
  getSessionClient._requestCache.set(cacheKey, clientPromise);
  
  // Initialize timestamp tracking if needed
  if (!getSessionClient._requestCacheTimestamps) {
    getSessionClient._requestCacheTimestamps = new Map();
  }
  getSessionClient._requestCacheTimestamps.set(cacheKey, Date.now());
  
  return clientPromise;
} 