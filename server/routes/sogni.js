import express from 'express';
import { getClientInfo, generateImage, cleanupSogniClient, getSessionClient, disconnectSessionClient, getActiveConnectionsCount, checkIdleConnections, activeConnections, sessionClients } from '../services/sogni.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Map to store active project SSE connections
const activeProjects = new Map();

// Timer for delayed Sogni cleanup
let sogniCleanupTimer = null;
const SOGNI_CLEANUP_DELAY_MS = 30 * 1000; // 30 seconds

// Track recent disconnect requests to prevent duplicates
const recentDisconnectRequests = new Map();
const DISCONNECT_CACHE_TTL = 3000; // 3 seconds

// Middleware to ensure session ID cookie exists
const ensureSessionId = (req, res, next) => {
  const sessionCookieName = 'sogni_session_id';
  let sessionId = req.cookies?.[sessionCookieName];
  
  // Log the current cookie state for debugging
  console.log(`[SESSION] Cookie check for ${sessionCookieName}: ${sessionId || 'not found'}`);
  //console.log(`[SESSION] Request origin: ${req.headers.origin}, referer: ${req.headers.referer}`);
  
  // If no session ID exists, create one
  if (!sessionId) {
    sessionId = `sid-${uuidv4()}`;
    
    // Determine if we're in a secure context
    const isSecureContext = req.secure || 
                            req.headers['x-forwarded-proto'] === 'https' || 
                            process.env.NODE_ENV === 'production' ||
                            req.headers.origin?.startsWith('https:');
    
    // Get the origin for cross-domain access
    const origin = req.headers.origin;
    
    // For cross-origin requests from HTTPS origins, use SameSite=None and Secure=true
    // For all other requests, use SameSite=Lax for better compatibility
    const sameSiteSetting = (origin && origin.startsWith('https:')) ? 'none' : 'lax';
    const secure = isSecureContext || sameSiteSetting === 'none';
    
    console.log(`[SESSION] Creating new session ID: ${sessionId}, Secure: ${secure}, SameSite: ${sameSiteSetting}`);
    
    // Set cookie with long expiry (30 days) with proper security settings
    res.cookie(sessionCookieName, sessionId, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: secure, // Enable for HTTPS, even local
      sameSite: sameSiteSetting, // Use 'none' for cross-domain requests
      path: '/'  // Ensure cookie is available for all paths
    });
  } else {
    console.log(`[SESSION] Using existing session ID: ${sessionId}`);
  }
  
  // Attach session ID to request for use in route handlers
  req.sessionId = sessionId;
  next();
};

// Helper function to send SSE messages
const sendSSEMessage = (client, data) => {
  if (!client || !client.writable) {
    return false;
  }
  
  try {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    return client.write(message);
  } catch (error) {
    console.error('Error sending SSE message:', error);
    return false;
  }
};

// Add OPTIONS handler for the /status endpoint to handle preflight requests
router.options('/status', (req, res) => {
  // CORS headers are now handled by Nginx for the api subdomain
  // if (req.headers.origin) {
  //   res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  //   res.setHeader('Access-Control-Allow-Credentials', 'true');
  //   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  //   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID, Accept');
  //   res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  // }
  res.status(204).end(); // No content response for OPTIONS
});

// Test connection to Sogni
router.get('/status', ensureSessionId, async (req, res) => {
  try {
    // Extract client app ID from header or query parameter
    const clientAppId = req.headers['x-client-app-id'] || req.query.clientAppId;
    
    // Get status info, passing the session ID and client app ID to enable result caching and app ID reuse
    const status = await getClientInfo(req.sessionId, clientAppId);
    
    // Add session info to the response
    res.json({
      ...status,
      sessionId: req.sessionId
    });
  } catch (error) {
    console.error('Error getting Sogni client status:', error);
    
    // Enhanced error logging
    console.log('DEBUG - Error details:', {
      message: error.message,
      status: error.status,
      payload: error.payload,
      stack: error.stack
    });
    
    // Check for proxy or timeout issues
    if (error.code === 'ECONNREFUSED') {
      console.error('DEBUG - Connection refused. Check if the Sogni API is reachable.');
      res.status(502).json({
        error: 'Backend unavailable',
        message: 'Could not connect to Sogni API. Connection refused.',
        details: 'This is likely due to network connectivity issues to the Sogni API.'
      });
    } 
    // Return a more specific error code for credential issues
    else if (error.message && error.message.includes('Invalid credentials')) {
      console.error('DEBUG - Invalid credentials detected. Check your .env file.');
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid Sogni credentials. Please check your .env file.',
        details: 'This error occurs when the Sogni API rejects the username and password combination.'
      });
    } 
    // Handle timeout errors
    else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error('DEBUG - Connection timeout detected.');
      res.status(504).json({
        error: 'Gateway timeout',
        message: 'Connection to Sogni API timed out',
        details: 'The request took too long to complete. Check your network connection or try again later.'
      });
    } 
    // Generic error fallback
    else {
      res.status(500).json({ 
        error: 'Failed to connect to Sogni services',
        message: error.message,
        details: JSON.stringify(error)
      });
    }
  }
});

// Add OPTIONS handler for the /progress/:projectId endpoint
router.options('/progress/:projectId', (req, res) => {
  // CORS headers are now handled by Nginx
  res.status(204).end();
});

// SSE endpoint for getting real-time progress updates
router.get('/progress/:projectId', ensureSessionId, (req, res) => {
  const projectId = req.params.projectId;
  
  // Extract client app ID from header or query parameter
  const clientAppId = req.headers['x-client-app-id'] || req.query.clientAppId;
  
  // Log request info for debugging (streamlined for performance)
  console.log(`SSE connection request for project: ${projectId}, client: ${clientAppId || 'none'}`);
  
  // Set headers for SSE - optimized order for faster processing
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send immediate response before other processing
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId, timestamp: Date.now() })}\n\n`);
  
  // Immediately flush the response to send data to client
  try {
    res.flushHeaders();
  } catch (err) {
    console.error(`Error flushing headers: ${err.message}`);
  }
  
  // Set up client tracking - do this after initial response is sent
  if (!activeProjects.has(projectId)) {
    activeProjects.set(projectId, new Set());
  }
  activeProjects.get(projectId).add(res);
  
  // Cancel any pending cleanup since a user is now connected
  if (sogniCleanupTimer) {
    clearTimeout(sogniCleanupTimer);
    sogniCleanupTimer = null;
  }
  
  // Send a heartbeat every 15 seconds to keep the connection alive
  // Increased from 3s to reduce unnecessary traffic
  const heartbeatInterval = setInterval(() => {
    if (res.writable) {
      try {
        res.write(":\n\n"); 
      } catch (err) {
        clearInterval(heartbeatInterval);
      }
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 15000);
  
  // Handle client disconnect - simplified for performance
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
    
    // If no active projects remain, schedule Sogni cleanup
    if (activeProjects.size === 0) {
      if (sogniCleanupTimer) clearTimeout(sogniCleanupTimer);
      sogniCleanupTimer = setTimeout(() => {
        cleanupSogniClient({ logout: false });
      }, SOGNI_CLEANUP_DELAY_MS);
    }
  });
  
  // Handle connection errors - simplified
  req.on('error', () => {
    clearInterval(heartbeatInterval);
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  });
  
  // Add a safety timeout - reduced from 10 minutes to 5 minutes
  const connectionTimeout = setTimeout(() => {
    clearInterval(heartbeatInterval);
    
    try {
      if (res.writable) {
        res.write(`data: ${JSON.stringify({ type: 'timeout', projectId })}\n\n`);
        res.end();
      }
    } catch (err) {
      // Silent catch - connection likely already closed
    }
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  }, 5 * 60 * 1000); // 5 minutes max connection time
  
  // Clean up the timeout when the connection closes
  req.on('close', () => {
    clearTimeout(connectionTimeout);
  });
});

// Add project cancellation endpoint
router.post('/cancel/:projectId', ensureSessionId, async (req, res) => {
  const projectId = req.params.projectId;
  
  try {
    // Extract client app ID from header, body, or query parameter
    const clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    console.log(`Request to cancel project ${projectId} for session ${req.sessionId} with app ID: ${clientAppId || 'none provided'}`);
    
    // Get the existing client for this session
    const client = await getSessionClient(req.sessionId, clientAppId);
    
    // Cancel the project using the session's client
    await client.projects.cancel(projectId);
    
    // Notify any connected clients
    if (activeProjects.has(projectId)) {
      const clients = activeProjects.get(projectId);
      clients.forEach(client => {
        if (client.writable) {
          client.write(`data: ${JSON.stringify({ type: 'cancelled', projectId })}\n\n`);
        }
      });
    }
    
    res.json({ status: 'cancelled', projectId });
  } catch (error) {
    console.error(`Error cancelling project ${projectId}:`, error);
    res.status(500).json({ error: 'Failed to cancel project', message: error.message });
  }
});

// Add OPTIONS handler for the /generate endpoint
router.options('/generate', (req, res) => {
  // CORS headers are now handled by Nginx
  res.status(204).end();
});

// Generate image with project tracking
router.post('/generate', ensureSessionId, async (req, res) => {
  const localProjectId = `project-${Date.now()}`;
  console.log(`[${localProjectId}] Starting image generation request for session ${req.sessionId}...`);
  
  try {
    const clientAppId = req.headers['x-client-app-id'] || req.body.clientAppId || req.query.clientAppId;
    console.log(`[${localProjectId}] Using client app ID: ${clientAppId || 'none provided'}`);
    
    // Track progress and send updates
    let lastProgressUpdate = Date.now();
    const progressHandler = (eventData) => {
      // Log the raw progress data received from the Sogni service callback
      // we don't currently care for the project 'complete' event as we listen to the job 'complete' events already
      if (eventData.type !== 'complete') {
        console.log(`[${localProjectId}] Received callback event:`, JSON.stringify(eventData));
      }
      
      // Throttle SSE updates
      const now = Date.now();
      if (now - lastProgressUpdate < 500 && eventData.type === 'progress' && (eventData.progress !== 0 && eventData.progress !== 1)) { 
        // Skip frequent progress updates unless it's start/end
        return;
      }
      lastProgressUpdate = now;
        
      // Ensure the projectId in the event matches the localProjectId for this SSE stream
      // Sogni service events might have their own projectId (the actual Sogni project ID)
      const sseEvent = {
        ...eventData,
        projectId: localProjectId, // Standardize on the localProjectId for client-side tracking
        jobId: eventData.jobId, // This should now be correctly set by sogni.js (imgID or SDK job.id)
        workerName: eventData.workerName || 'unknown', // Ensure workerName is present
        progress: typeof eventData.progress === 'number' ? 
                  (eventData.progress > 1 ? eventData.progress / 100 : eventData.progress) : 
                  eventData.progress, // Normalize progress 0-1
      };

      // Handle the 'queued' event specifically
      if (eventData.type === 'queued') {
        const sseEvent = {
          type: 'queued',
          projectId: localProjectId, // Standardize on the localProjectId for client-side tracking
          queuePosition: eventData.queuePosition,
        };
        if (activeProjects.has(localProjectId)) {
          const clients = activeProjects.get(localProjectId);
          console.log(`[${localProjectId}] Forwarding 'queued' event to ${clients.size} SSE client(s):`, JSON.stringify(sseEvent));
          clients.forEach(client => {
            sendSSEMessage(client, sseEvent);
          });
        }
        return; // Exit the handler for this specific event type after processing
      }

      if (activeProjects.has(localProjectId)) {
        const clients = activeProjects.get(localProjectId);
        // console.log(`[${localProjectId}] Forwarding event to ${clients.size} SSE client(s):`, JSON.stringify(sseEvent));
        clients.forEach(client => {
          sendSSEMessage(client, sseEvent);
        });
      } else {
        console.log(`[${localProjectId}] No SSE clients found for this request.`);
      }
    };
    
    // Get or create a client for this session, using the client-provided app ID
    const client = await getSessionClient(req.sessionId, clientAppId);
    const params = req.body;

    console.log(`DEBUG - ${new Date().toISOString()} - [${localProjectId}] Calling Sogni SDK (generateImage function) with params:`, Object.keys(params));
    
    generateImage(client, params, progressHandler)
      .then(sogniResult => {
        console.log(`DEBUG - ${new Date().toISOString()} - [${localProjectId}] Sogni SDK (generateImage function) promise resolved.`);
        console.log(`[${localProjectId}] Sogni generation process finished. Sogni Project ID: ${sogniResult.projectId}, Result:`, JSON.stringify(sogniResult.result));
      })
      .catch(error => {
        console.error(`ERROR - ${new Date().toISOString()} - [${localProjectId}] Sogni SDK (generateImage function) promise rejected:`, error);
        console.error(`[${localProjectId}] Sogni generation process failed:`, error);
        if (activeProjects.has(localProjectId)) {
          const clients = activeProjects.get(localProjectId);
          const errorEvent = { 
            type: 'error', 
            projectId: localProjectId,
            message: error.message || 'Image generation failed',
            details: error.toString() // Include more error details
          };
          console.log(`[${localProjectId}] Sending 'error' event to ${clients.size} SSE client(s):`, JSON.stringify(errorEvent));
          clients.forEach((client) => {
            sendSSEMessage(client, errorEvent);
          });
        }
      });
    
    // Immediately return the localProjectId for tracking this /generate request
    console.log(`[${localProjectId}] Responding to initial POST request.`);
    res.json({ 
      status: 'processing',
      projectId: localProjectId, // This is the ID the client uses to listen for SSE
      message: 'Image generation request received and processing started.' 
    });
  } catch (error) {
    console.error(`ERROR - ${new Date().toISOString()} - [${localProjectId}] Uncaught error in POST /generate handler:`, error);
    console.error(`[${localProjectId}] Error in POST /generate handler:`, error);
    res.status(500).json({ 
      error: 'Failed to initiate image generation',
      message: error.message,
      // Adding full error details to the response for debugging (consider removing for production)
      errorDetails: { name: error.name, message: error.message, stack: error.stack, ...error }
    });
  }
});

// Add a health check endpoint to verify server is running
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Admin endpoint to clean up all connections (for development/maintenance)
router.post('/admin/cleanup', async (req, res) => {
  try {
    const adminKey = req.query.key || req.body.key;
    
    // Simple security - require an admin key
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      console.warn(`Unauthorized cleanup attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log(`[ADMIN] Running full cleanup requested by ${req.ip}`);
    
    // Clean up all connections including session clients
    await cleanupSogniClient({ 
      logout: true, 
      includeSessionClients: true 
    });
    
    // Force run idle check to clean up any other resources
    await checkIdleConnections();
    
    // Return status with counts
    res.json({ 
      status: 'success', 
      message: 'All connections cleaned up',
      remainingConnections: getActiveConnectionsCount()
    });
  } catch (error) {
    console.error('[ADMIN] Error during cleanup:', error);
    res.status(500).json({ 
      error: 'Failed to clean up connections',
      message: error.message
    });
  }
});

// Add OPTIONS handler for the disconnect endpoint
router.options('/disconnect', (req, res) => {
  // Set CORS headers for preflight requests
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID, Accept');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }
  res.status(204).end(); // No content response for OPTIONS
});

// Helper to check and cache disconnect requests
const cacheDisconnectRequest = (key) => {
  // Check if this request was processed recently
  if (recentDisconnectRequests.has(key)) {
    return true; // Already in cache, duplicate request
  }
  
  // Add to cache with expiration
  recentDisconnectRequests.set(key, Date.now());
  
  // Set cleanup timer
  setTimeout(() => {
    recentDisconnectRequests.delete(key);
  }, DISCONNECT_CACHE_TTL);
  
  return false; // Not a duplicate
};

// Add an endpoint to explicitly disconnect a session when the user leaves
router.post('/disconnect', ensureSessionId, async (req, res) => {
  try {
    console.log(`Explicit disconnect request for session ${req.sessionId}`);
    
    // Extract client app ID from header or body
    const clientAppId = req.headers['x-client-app-id'] || req.body?.clientAppId;
    console.log(`Disconnect request with clientAppId: ${clientAppId || 'none'}`);
    
    // Create a unique key for this request to detect duplicates
    const requestKey = `${req.sessionId}:${clientAppId || 'no-client-id'}:POST`;
    
    // Check if this is a duplicate request
    if (cacheDisconnectRequest(requestKey)) {
      console.log(`Skipping duplicate POST disconnect request for session ${req.sessionId} with clientAppId ${clientAppId}`);
      
      // Still return success to the client
      res.setHeader('Connection', 'close');
      res.setHeader('Cache-Control', 'no-store, no-cache');
      return res.status(200).send({ success: true, cached: true });
    }
    
    // Set CORS headers to ensure response reaches the client
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID');
    }
    
    // Check if we have this client before attempting to disconnect
    let hasClient = false;
    
    if (clientAppId && activeConnections.has(clientAppId)) {
      hasClient = true;
    } else if (sessionClients.has(req.sessionId)) {
      const clientId = sessionClients.get(req.sessionId);
      if (activeConnections.has(clientId)) {
        hasClient = true;
      }
    }
    
    // Only attempt to disconnect if we have a client
    let result = false;
    if (hasClient) {
      console.log(`Found active client for session ${req.sessionId}, disconnecting...`);
      result = await disconnectSessionClient(req.sessionId, clientAppId);
    } else {
      console.log(`No active client found for session ${req.sessionId}, skipping disconnect`);
    }
    
    // Set special headers to ensure the response reaches the client 
    // even during page unload/navigation events
    res.setHeader('Connection', 'close');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    
    // Return a very small response to ensure it completes quickly
    res.status(200).send({ success: true });
    
    // Log the outcome
    console.log(`Session ${req.sessionId} disconnect attempt: ${result ? 'success' : 'no client found or no action needed'}`);
  } catch (error) {
    console.error(`Error disconnecting session ${req.sessionId}:`, error);
    res.status(500).json({ error: 'Failed to disconnect session', message: error.message });
  }
});

// Add GET version of disconnect for easier browser integration (e.g., beacon, img tag)
router.get('/disconnect', ensureSessionId, async (req, res) => {
  try {
    console.log(`GET disconnect request for session ${req.sessionId}`);
    
    // Extract client app ID from query parameters
    const clientAppId = req.query?.clientAppId || req.headers['x-client-app-id'];
    console.log(`GET disconnect with clientAppId: ${clientAppId || 'none'}`);
    
    // Create a unique key for this request to detect duplicates
    const requestKey = `${req.sessionId}:${clientAppId || 'no-client-id'}:GET`;
    
    // Check if this is a duplicate request
    if (cacheDisconnectRequest(requestKey)) {
      console.log(`Skipping duplicate GET disconnect request for session ${req.sessionId} with clientAppId ${clientAppId}`);
      
      // Still return the transparent GIF to the client
      res.setHeader('Connection', 'close');
      res.setHeader('Cache-Control', 'no-store, no-cache');
      res.setHeader('Content-Type', 'image/gif');
      const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      return res.send(TRANSPARENT_GIF);
    }
    
    // Set CORS headers to ensure response reaches the client
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-App-ID');
    }
    
    // Check if we have this client before attempting to disconnect
    let hasClient = false;
    
    if (clientAppId && activeConnections.has(clientAppId)) {
      hasClient = true;
    } else if (sessionClients.has(req.sessionId)) {
      const clientId = sessionClients.get(req.sessionId);
      if (activeConnections.has(clientId)) {
        hasClient = true;
      }
    }
    
    // Queue the disconnect operation but don't wait for it
    // This ensures a fast response even during page unload
    if (hasClient) {
      console.log(`Found active client for session ${req.sessionId}, queuing disconnect...`);
      disconnectSessionClient(req.sessionId, clientAppId)
        .then(result => {
          console.log(`Async session ${req.sessionId} disconnected: ${result ? 'success' : 'failed'}`);
        })
        .catch(err => {
          console.error(`Async error disconnecting session ${req.sessionId}:`, err);
        });
    } else {
      console.log(`No active client found for session ${req.sessionId}, skipping disconnect`);
    }
    
    // Return a tiny response with appropriate headers
    res.setHeader('Connection', 'close');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.setHeader('Content-Type', 'image/gif');
    
    // 1x1 transparent GIF
    const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.send(TRANSPARENT_GIF);
  } catch (error) {
    console.error(`Error in GET disconnect for session ${req.sessionId}:`, error);
    res.status(500).send('');
  }
});

export default router; 