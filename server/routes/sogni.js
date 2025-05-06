import express from 'express';
import { getClientInfo, generateImage, initializeSogniClient } from '../services/sogni.js';

const router = express.Router();

// Map to store active project SSE connections
const activeProjects = new Map();

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

// Test connection to Sogni
router.get('/status', async (req, res) => {
  try {
    const status = await getClientInfo();
    res.json(status);
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

// SSE endpoint for getting real-time progress updates
router.get('/progress/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  
  // Log request info for debugging
  console.log(`SSE connection request for project: ${projectId}`);
  console.log(`SSE request headers:`, JSON.stringify({
    origin: req.headers.origin,
    referer: req.headers.referer,
    host: req.headers.host
  }));
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Disable response compression - can cause issues with SSE
  res.setHeader('Content-Encoding', 'identity');
  
  // Critical for CORS with credentials - ensure we're accepting all origins for SSE
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '*');
  console.log(`SSE CORS: Setting Access-Control-Allow-Origin to: ${origin}`);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Disable Nginx buffering if present
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send immediate response to prevent timeouts
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);
  
  try {
    res.flushHeaders();
  } catch (err) {
    console.error(`Error flushing headers: ${err.message}`);
  }
  
  // Send a heartbeat every 3 seconds to keep the connection alive
  const heartbeatInterval = setInterval(() => {
    if (res.writable) {
      try {
        res.write(":\n\n"); 
      } catch (err) {
        console.warn(`Heartbeat write failed: ${err.message}`);
        clearInterval(heartbeatInterval);
      }
    } else {
      console.warn(`SSE connection for ${projectId} is no longer writable`);
      clearInterval(heartbeatInterval);
    }
  }, 3000); // Reduced to 3s to keep connection more active
  
  // Add this connection to the map
  if (!activeProjects.has(projectId)) {
    activeProjects.set(projectId, new Set());
  }
  activeProjects.get(projectId).add(res);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`SSE connection closed for project: ${projectId}`);
    clearInterval(heartbeatInterval);
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  });
  
  // If the connection fails to establish properly, clean up
  req.on('error', (err) => {
    console.error(`SSE connection error for project ${projectId}:`, err);
    clearInterval(heartbeatInterval);
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  });
  
  // Add a safety timeout that will close the connection after a reasonable amount of time
  // to prevent zombie connections
  const connectionTimeout = setTimeout(() => {
    console.log(`Closing SSE connection for project ${projectId} after max duration`);
    clearInterval(heartbeatInterval);
    
    try {
      if (res.writable) {
        res.write(`data: ${JSON.stringify({ type: 'timeout', projectId })}\n\n`);
        res.end();
      }
    } catch (err) {
      console.warn(`Error closing SSE connection: ${err.message}`);
    }
    
    if (activeProjects.has(projectId)) {
      activeProjects.get(projectId).delete(res);
      if (activeProjects.get(projectId).size === 0) {
        activeProjects.delete(projectId);
      }
    }
  }, 10 * 60 * 1000); // 10 minutes max connection time
  
  // Clean up the timeout when the connection closes
  req.on('close', () => {
    clearTimeout(connectionTimeout);
  });
});

// Add project cancellation endpoint
router.post('/cancel/:projectId', async (req, res) => {
  const projectId = req.params.projectId;
  
  try {
    // Implement project cancellation logic
    console.log(`Request to cancel project ${projectId}`);
    const client = await initializeSogniClient();
    await client.cancelProject(projectId);
    
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

// Generate image with project tracking
router.post('/generate', async (req, res) => {
  // Create a unique project ID for tracking this specific /generate request
  const localProjectId = `project-${Date.now()}`;
  console.log(`[${localProjectId}] Starting image generation request...`);
  
  try {
    // Track progress and send updates
    let lastProgressUpdate = Date.now();
    const progressHandler = (eventData) => {
      // Log the raw progress data received from the Sogni service callback
      console.log(`[${localProjectId}] Received callback event:`, JSON.stringify(eventData));
      
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
        imgId: eventData.imgId, // Keep original imgId for reference if present
        workerName: eventData.workerName || 'unknown', // Ensure workerName is present
        progress: typeof eventData.progress === 'number' ? 
                  (eventData.progress > 1 ? eventData.progress / 100 : eventData.progress) : 
                  eventData.progress, // Normalize progress 0-1
      };
      
      // If there's no primary jobId but there is an imgId, use imgId as jobId.
      // This is a fallback, sogni.js should ideally set jobId correctly.
      if (!sseEvent.jobId && sseEvent.imgId) {
        console.warn(`[${localProjectId}] sseEvent.jobId is missing, falling back to imgId: ${sseEvent.imgId}`);
        sseEvent.jobId = sseEvent.imgId;
      }

      // Critical: Ensure a valid jobId exists before sending, otherwise frontend can't track
      if (!sseEvent.jobId) {
        console.error(`[${localProjectId}] Event is missing critical jobId, cannot send to client:`, JSON.stringify(sseEvent));
        return; // Do not send event without a jobId
      }
      
      if (activeProjects.has(localProjectId)) {
        const clients = activeProjects.get(localProjectId);
        console.log(`[${localProjectId}] Forwarding event to ${clients.size} SSE client(s):`, JSON.stringify(sseEvent));
        clients.forEach(client => {
          sendSSEMessage(client, sseEvent);
        });
      } else {
        console.log(`[${localProjectId}] No SSE clients found for this request.`);
      }
    };
    
    // Start the generation process
    // generateImage returns a promise that resolves with Sogni's actual project ID and result URLs
    generateImage(req.body, progressHandler)
      .then(sogniResult => {
        console.log(`[${localProjectId}] Sogni generation process finished. Sogni Project ID: ${sogniResult.projectId}, Result URLs:`, JSON.stringify(sogniResult.result));
        // When complete, notify any connected SSE clients for this localProjectId
        if (activeProjects.has(localProjectId)) {
          const clients = activeProjects.get(localProjectId);
          const completionEvent = {
            type: 'complete', 
            projectId: localProjectId, // Use localProjectId for client tracking
            sogniProjectId: sogniResult.projectId, // Include actual Sogni project ID
            result: sogniResult.result // Result URLs from Sogni
          };
          console.log(`[${localProjectId}] Sending 'complete' event to ${clients.size} SSE client(s):`, JSON.stringify(completionEvent));
          clients.forEach((client) => {
            sendSSEMessage(client, completionEvent);
            // Optionally close the connection from the server side after completion
            // client.end(); 
          });
        }
      })
      .catch(error => {
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
    console.error(`[${localProjectId}] Error in POST /generate handler:`, error);
    res.status(500).json({ 
      error: 'Failed to initiate image generation',
      message: error.message 
    });
  }
});

// Add a health check endpoint to verify server is running
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

export default router; 