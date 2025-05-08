import { SogniClient } from '@sogni-ai/sogni-client';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Add connection tracking
const activeConnections = new Map();
// Add session tracking - map session IDs to client IDs
const sessionClients = new Map();

// Add timeout tracking for activity
const connectionLastActivity = new Map();
const NORMAL_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TEST_INACTIVITY_TIMEOUT_MS = 10 * 1000; // 10 seconds for tests

// Use shorter timeout for tests if specified
const INACTIVITY_TIMEOUT_MS = process.env.REDUCED_TIMEOUT ? 
  TEST_INACTIVITY_TIMEOUT_MS : NORMAL_INACTIVITY_TIMEOUT_MS;

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
const checkIdleConnections = () => {
  const now = Date.now();
  const idleTimeThreshold = now - INACTIVITY_TIMEOUT_MS;
  let idleConnectionsCount = 0;

  for (const [clientId, lastActivity] of connectionLastActivity.entries()) {
    if (lastActivity < idleTimeThreshold) {
      console.log(`[IDLE CHECK] Disconnecting inactive client: ${clientId}, idle for ${Math.floor((now - lastActivity)/1000)}s`);
      
      const client = activeConnections.get(clientId);
      if (client) {
        disconnectClient(client).catch(err => {
          console.error(`Error disconnecting idle client ${clientId}:`, err);
        });
        idleConnectionsCount++;
      }

      // Remove from tracking even if client reference is gone
      activeConnections.delete(clientId);
      connectionLastActivity.delete(clientId);
    }
  }

  if (idleConnectionsCount > 0) {
    console.log(`[IDLE CHECK] Disconnected ${idleConnectionsCount} idle clients`);
  }
};

// Run idle check every minute
const idleCheckInterval = setInterval(checkIdleConnections, 60 * 1000);

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

// Helper to create a new SogniClient for each project
async function createSogniClient(appIdPrefix) {
  // Generate a consistent but unique app ID
  const prefix = appIdPrefix || process.env.SOGNI_APP_ID;
  sogniAppId = `${prefix}-${generateUUID()}`;
  sogniEnv = process.env.SOGNI_ENV || 'production';
  sogniUsername = process.env.SOGNI_USERNAME;
  const password = process.env.SOGNI_PASSWORD;
  sogniUrls = getSogniUrls(sogniEnv);
  
  const client = await SogniClient.createInstance({
    appId: sogniAppId,
    testnet: true,
    network: "fast",
    logLevel: "debug",
    restEndpoint: sogniUrls.api,
    socketEndpoint: sogniUrls.socket,
  });
  
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
    client.on('*', () => recordClientActivity(client.appId));
  }
  
  // If client has projects, add event listeners there too
  if (client.projects && client.projects.on) {
    client.projects.on('*', () => recordClientActivity(client.appId));
  }
  
  return client;
}

// Standardize client disconnection
async function disconnectClient(client) {
  if (!client) return;
  
  const clientId = client.appId;
  console.log(`Disconnecting Sogni client: ${clientId}`);

  try {
    // Call the primary disconnect method
    if (client.disconnect) {
      await client.disconnect();
    }
    
    // Remove from our tracking
    if (clientId) {
      activeConnections.delete(clientId);
      connectionLastActivity.delete(clientId);
      logConnectionStatus('Disconnected', clientId);
    }
    
    return true;
  } catch (error) {
    console.error(`Error during client disconnection for ${clientId}:`, error);
    throw error;
  }
}

export async function getClientInfo() {
  const client = await createSogniClient();
  
  try {
    // Record activity for this client
    recordClientActivity(client.appId);
    
    const info = {
      connected: true,
      appId: client.appId,
      network: client.network,
      authenticated: client.account.isLoggedIn
    };
    return info;
  } finally {
    // Always disconnect this client when done with getClientInfo
    await disconnectClient(client);
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

// Global error handler for unhandled WebSocket errors
process.on('uncaughtException', (err) => {
  if (
    err &&
    typeof err.message === 'string' &&
    err.message.includes('WebSocket was closed before the connection was established')
  ) {
    console.warn('Ignored WebSocket connection race error:', err.message);
    return;
  }
  throw err;
});

process.on('unhandledRejection', (reason) => {
  if (
    reason &&
    typeof reason.message === 'string' &&
    reason.message.includes('WebSocket was closed before the connection was established')
  ) {
    console.warn('Ignored WebSocket connection race error (promise):', reason.message);
    return;
  }
  throw reason;
});

// Replace initializeSogniClient with getSogniClient
export async function initializeSogniClient() {
  return createSogniClient();
}

// Disconnect a specific session client
export async function disconnectSessionClient(sessionId) {
  if (sessionClients.has(sessionId)) {
    const clientId = sessionClients.get(sessionId);
    const client = activeConnections.get(clientId);
    
    console.log(`[SESSION] Disconnecting client ${clientId} for session ${sessionId}`);
    
    if (client) {
      try {
        await disconnectClient(client);
        sessionClients.delete(sessionId);
        return true;
      } catch (error) {
        console.error(`Error disconnecting session client for ${sessionId}:`, error);
        throw error;
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
  
  // Get all current clients for disconnection
  const clientDisconnectPromises = [];
  
  // First, handle known client instances
  for (const [clientId, client] of nonSessionClients) {
    if (client) {
      console.log(`Disconnecting client: ${clientId}`);
      
      try {
        if (logout && client.account && client.account.logout) {
          await client.account.logout();
          console.log(`Client ${clientId} logged out successfully`);
          // Only clear tokens on explicit logout request
          if (clientId === sogniAppId) {
            sogniTokens = null;
          }
        }
        
        clientDisconnectPromises.push(disconnectClient(client));
      } catch (error) {
        console.error(`Error handling client ${clientId} during cleanup:`, error);
      }
    }
  }
  
  // Wait for all disconnections to complete
  if (clientDisconnectPromises.length > 0) {
    console.log(`Waiting for ${clientDisconnectPromises.length} client disconnections to complete...`);
    await Promise.allSettled(clientDisconnectPromises);
  }
  
  console.log('Sogni client cleanup completed');
  return true;
}

// Get or create a Sogni client for a session
export async function getSessionClient(sessionId) {
  // If this session already has a client assigned
  if (sessionClients.has(sessionId)) {
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
  
  // Create a new client for this session
  console.log(`[SESSION] Creating new client for session ${sessionId}`);
  const client = await createSogniClient(`session-${sessionId}`);
  
  // Store the session-to-client mapping
  if (client && client.appId) {
    sessionClients.set(sessionId, client.appId);
    console.log(`[SESSION] Mapped session ${sessionId} to client ${client.appId}`);
  }
  
  return client;
} 