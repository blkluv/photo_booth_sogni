import { SogniClient } from '@sogni-ai/sogni-client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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
  return activeConnections.size;
}

// Helper to record activity on a client
function recordClientActivity(clientId, env) {
  if (clientId) {
    connectionLastActivity.set(clientId, Date.now());
    // Uncomment for debugging
    console.log(`[ACTIVITY] Recorded activity for client: ${clientId} in env: ${env}`);
  }
}

// Setup periodic check for idle connections
export const checkIdleConnections = async () => {
  const now = Date.now();
  const idleTimeThreshold = now - INACTIVITY_TIMEOUT_MS;
  let idleConnectionsCount = 0;
  const disconnectionPromises = [];

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

// Helper function to generate a UUID
const generateUUID = () => uuidv4();

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
});

// Helper to create a new SogniClient for each project
async function createSogniClient(appIdPrefix, clientProvidedAppId) {
  // Use client-provided app ID if available, otherwise generate a consistent but unique app ID
  const generatedAppId = clientProvidedAppId || `${appIdPrefix || process.env.SOGNI_APP_ID}-${generateUUID()}`;
  sogniAppId = generatedAppId;
  sogniEnv = process.env.SOGNI_ENV || 'production';
  sogniUsername = process.env.SOGNI_USERNAME;
  const password = process.env.SOGNI_PASSWORD;
  sogniUrls = getSogniUrls(sogniEnv);
  
  console.log(`Creating Sogni client with app ID: ${sogniAppId}`);
  
  try {
    const client = await SogniClient.createInstance({
      appId: sogniAppId,
      testnet: true,
      network: "fast",
      logLevel: "info",
      restEndpoint: sogniUrls.api,
      socketEndpoint: sogniUrls.socket,
    });
    
    // Explicitly ensure client has the appId property set
    if (!client.appId) {
      console.log(`Setting missing appId property on client to: ${sogniAppId}`);
      client.appId = sogniAppId;
    }
    
    // Track this actual client
    activeConnections.set(sogniAppId, client);
    recordClientActivity(sogniAppId, sogniEnv);
    logConnectionStatus('Created', sogniAppId);

    // Try to restore session with tokens if available
    try {
      if (sogniTokens && sogniTokens.token && sogniTokens.refreshToken) {
        await client.account.setToken(sogniUsername, sogniTokens);
        recordClientActivity(sogniAppId); // Record activity after token set
        
        if (!client.account.isLoggedIn) {
          await client.account.login(sogniUsername, password);
          recordClientActivity(sogniAppId); // Record activity after login
        }
      } else {
        await client.account.login(sogniUsername, password);
        recordClientActivity(sogniAppId); // Record activity after login
      }
    } catch (e) {
      console.warn(`Login error for client ${sogniAppId}, trying again:`, e.message);
      await client.account.login(sogniUsername, password);
      recordClientActivity(sogniAppId); // Record activity even after error recovery
    }
    
    // Save tokens for reuse
    if (client.account.currentAccount && client.account.currentAccount.token && client.account.currentAccount.refreshToken) {
      sogniTokens = {
        token: client.account.currentAccount.token,
        refreshToken: client.account.currentAccount.refreshToken,
      };
    }
    
    // Add event listeners to record activity on any client events
    // This ensures clients remain active during long-running projects
    if (client.on) {
      client.on('*', () => recordClientActivity(client.appId || sogniAppId));
    }
    
    // If client has projects, add event listeners there too
    if (client.projects && client.projects.on) {
      client.projects.on('*', () => recordClientActivity(client.appId || sogniAppId));
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
    console.error(`Error creating Sogni client with app ID ${sogniAppId}:`, error);
    
    // Clean up tracking for this failed client
    activeConnections.delete(sogniAppId);
    connectionLastActivity.delete(sogniAppId);
    
    throw error;
  }
}

// Standardize client disconnection
async function disconnectClient(client) {
  if (!client) return false;
  
  // Safety check: get client ID with a fallback for undefined
  const clientId = client.appId || 'unknown-client';
  console.log(`Disconnecting Sogni client: ${clientId}`);

  try {
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
        authenticated: client.account.isLoggedIn
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

export async function generateImage(params, progressCallback) {
  const client = await createSogniClient();
  
  try {
    // Record activity for this client
    recordClientActivity(client.appId);
    
    const isEnhancement = params.startingImage !== undefined;
    const projectOptions = {
      modelId: params.selectedModel,
      positivePrompt: params.stylePrompt,
      sizePreset: 'custom',
      width: params.width,
      height: params.height,
      steps: isEnhancement ? 4 : 7,
      guidance: params.promptGuidance || (isEnhancement ? 1 : 7),
      numberOfImages: params.numberImages || 1,
      scheduler: 'DPM Solver Multistep (DPM-Solver++)',
      timeStepSpacing: 'Karras'
    };
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
    const project = await client.projects.create(projectOptions);
    const handledJobProgress = new Set();
    const setupProgressListener = (sdkJob) => {
      if (!sdkJob || handledJobProgress.has(sdkJob.id)) return;
      handledJobProgress.add(sdkJob.id);
      sdkJob.on('progress', (progressValue) => {
        if (progressCallback) {
          const normalizedProgress = typeof progressValue === 'number' && progressValue > 1 
                                     ? progressValue / 100 
                                     : (progressValue || 0);
          const progressEvent = {
            type: 'progress',
            jobId: sdkJob.id,
            imgId: sdkJob.imgID,
            progress: normalizedProgress,
            projectId: project.id,
            workerName: sdkJob.workerName || 'unknown'
          };
          progressCallback(progressEvent);
        }
      });
    };
    if (project.jobs && project.jobs.length > 0) {
      project.jobs.forEach(setupProgressListener);
    }
    project.on('updated', (keys) => {
      if (keys.includes('jobs')) {
        project.jobs.forEach(setupProgressListener);
      }
    });
    project.on('jobStarted', (sdkJob) => {
      setupProgressListener(sdkJob);
      if (progressCallback) {
        const startedEvent = {
          type: 'started',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        };
        progressCallback(startedEvent);
        progressCallback({
          type: 'progress',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          progress: 0.0,
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
      }
    });
    project.on('jobCompleted', (sdkJob) => {
      if (progressCallback) {
        progressCallback({
          type: 'progress',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          progress: 1.0, 
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
        progressCallback({
          type: 'jobCompleted',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          resultUrl: sdkJob.resultUrl, 
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
      }
    });
    project.on('jobFailed', (sdkJob) => {
      if (progressCallback) {
        progressCallback({
          type: 'jobFailed',
          jobId: sdkJob.id,
          imgId: sdkJob.imgID,
          error: sdkJob.error?.message || sdkJob.error || 'Unknown error',
          projectId: project.id,
          workerName: sdkJob.workerName || 'unknown'
        });
      }
    });
    return await new Promise((resolve, reject) => {
      // Record activity whenever we get progress events
      project.on('updated', () => {
        recordClientActivity(client.appId);
      });
      
      project.on('completed', () => {
        recordClientActivity(client.appId);
        resolve({
          projectId: project.id,
          result: { imageUrls: project.resultUrls }
        });
        if (progressCallback) {
          progressCallback({
            type: 'complete',
            projectId: project.id,
            result: { imageUrls: project.resultUrls } 
          });
        }
      });
      
      project.on('failed', (error) => {
        recordClientActivity(client.appId);
        reject(error);
        if (progressCallback) {
          progressCallback({
            type: 'error',
            projectId: project.id,
            error: error?.message || error || 'Unknown project error'
          });
        }
      });
    });
  } finally {
    // Always disconnect this client after use
    await disconnectClient(client);
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
  // If client app ID is provided and we already have this client
  if (clientAppId && activeConnections.has(clientAppId)) {
    const existingClient = activeConnections.get(clientAppId);
    
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
  }
  
  // If this session already has a client assigned
  if (sessionId && sessionClients.has(sessionId)) {
    const clientId = sessionClients.get(sessionId);
    const existingClient = activeConnections.get(clientId);
    
    // If the client still exists and is valid
    if (existingClient) {
      console.log(`[SESSION] Reusing existing client ${clientId} for session ${sessionId}`);
      recordClientActivity(clientId);
      return existingClient;
    } else {
      console.log(`[SESSION] Client ${clientId} no longer exists for session ${sessionId}, creating new one`);
      sessionClients.delete(sessionId);
    }
  }
  
  // Prefer the client-provided app ID to ensure consistency
  const appId = clientAppId || `session-${sessionId}`;
  
  // Create a new client for this session
  console.log(`[SESSION] Creating new client for session ${sessionId} with app ID: ${appId}`);
  const client = await createSogniClient(undefined, appId);
  
  // Store the session-to-client mapping
  if (sessionId && client && client.appId) {
    sessionClients.set(sessionId, client.appId);
    console.log(`[SESSION] Mapped session ${sessionId} to client ${client.appId}`);
  }
  
  return client;
} 