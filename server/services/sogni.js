import { v4 as uuidv4 } from 'uuid';
import process from 'process';

// Import SogniClient dynamically to avoid issues
let SogniClient;

// Connection tracking
export const activeConnections = new Map();
const connectionLastActivity = new Map();
export const sessionClients = new Map();

// Single global Sogni client and session management
let globalSogniClient = null;
let sogniUsername = null;
let sogniEnv = null;
let sogniUrls = null;
let password = null;

// Token refresh cooldown to prevent excessive refresh attempts
const lastRefreshAttempt = { timestamp: 0 };
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Validate if an error is truly auth-related by making an additional authenticated call
export async function validateAuthError(error) {
  console.log(`[AUTH] Validating error to determine if it's truly an auth issue: ${error.message}`);
  
  // If we're in cooldown, assume it's auth-related to avoid spam
  const now = Date.now();
  if (now - lastRefreshAttempt.timestamp < REFRESH_COOLDOWN_MS) {
    console.log(`[AUTH] Within refresh cooldown period, treating as auth error`);
    return true;
  }
  
  try {
    // Try to make a simple authenticated API call to test if tokens are actually invalid
    const client = await getOrCreateGlobalSogniClient();
    await client.account.refreshBalance();
    
    console.log(`[AUTH] Error doesn't appear to be auth-related, treating as transient: ${error.message}`);
    return false;
  } catch (validationError) {
    if (validationError.status === 401 || 
        (validationError.payload && validationError.payload.errorCode === 107) ||
        validationError.message?.includes('Invalid token')) {
      console.log(`[AUTH] Validation confirmed this is a real auth error: ${validationError.message}`);
      lastRefreshAttempt.timestamp = now;
      return true;
    }
    
    console.log(`[AUTH] Validation call failed with non-auth error, treating original error as transient: ${validationError.message}`);
    return false;
  }
}

// Activity tracking
export function getActiveConnectionsCount() {
  return activeConnections.size;
}

export function logConnectionStatus(operation, clientId) {
  const count = getActiveConnectionsCount();
  if (count > 0 || operation === 'Created') {
    console.log(`[CONNECTION] ${operation} client ${clientId}. Active connections: ${count}`);
  }
  return activeConnections.size;
}

// Helper to record activity on a client
function recordClientActivity(clientId) {
  if (clientId) {
    connectionLastActivity.set(clientId, Date.now());
  }
}

// Sogni environment configuration
const SOGNI_HOSTS = {
  local: {
    api: 'https://api-local.sogni.ai',
    socket: 'wss://socket-local.sogni.ai',
    rest: 'https://api-local.sogni.ai'
  },
  staging: {
    api: 'https://api-staging.sogni.ai',
    socket: 'wss://socket-staging.sogni.ai', 
    rest: 'https://api-staging.sogni.ai'
  },
  production: {
    api: 'https://api.sogni.ai',
    socket: 'wss://socket.sogni.ai',
    rest: 'https://api.sogni.ai'
  }
};

const getSogniUrls = (env) => {
  if (!SOGNI_HOSTS[env]) {
    console.warn(`Unknown Sogni environment: ${env}, falling back to production`);
    return SOGNI_HOSTS.production;
  }
  return SOGNI_HOSTS[env];
};




// Create or get the global Sogni client with proper session management
async function getOrCreateGlobalSogniClient() {
  // If we already have a valid global client, return it
  if (globalSogniClient && globalSogniClient.account.currentAccount.isAuthenicated) {
    console.log(`[GLOBAL] Reusing existing authenticated global client: ${globalSogniClient.appId}`);
    recordClientActivity(globalSogniClient.appId);
    
    // Log token status for monitoring (tokens are managed by SDK)
    const hasToken = !!globalSogniClient.account.currentAccount.token;
    const hasRefreshToken = !!globalSogniClient.account.currentAccount.refreshToken;
    console.log(`[GLOBAL] Token status - Access: ${hasToken ? 'present' : 'missing'}, Refresh: ${hasRefreshToken ? 'present' : 'missing'}`);
    
    return globalSogniClient;
  }
  
  // Initialize environment and credentials
  if (!sogniUsername || !password) {
    sogniEnv = process.env.SOGNI_ENV || 'production';
    sogniUsername = process.env.SOGNI_USERNAME;
    password = process.env.SOGNI_PASSWORD;
    sogniUrls = getSogniUrls(sogniEnv);
    
    if (!sogniUsername || !password) {
      throw new Error('Sogni credentials not configured - check SOGNI_USERNAME and SOGNI_PASSWORD');
    }
  }
  
  // Generate a unique app ID for this instance
  const clientAppId = `photobooth-${uuidv4()}`;
  
  console.log(`[GLOBAL] Creating new global Sogni client with app ID: ${clientAppId}`);
  
  // Import SogniClient if not already imported
  if (!SogniClient) {
    const sogniModule = await import('@sogni-ai/sogni-client');
    SogniClient = sogniModule.SogniClient;
  }
  
  // Create new global client
      const client = await SogniClient.createInstance({
    appId: clientAppId,
    network: 'fast',
    restEndpoint: sogniUrls.rest,
        socketEndpoint: sogniUrls.socket,
    testnet: sogniEnv === 'local' || sogniEnv === 'staging'
  });
  
  // Authenticate the client
  // Note: The Sogni SDK automatically manages token refresh:
  // - Access tokens are valid for 24 hours
  // - Refresh tokens are valid for 30 days
  // - SDK handles automatic renewal without requiring socket reconnection
  try {
    console.log(`[GLOBAL] Authenticating global client...`);
            await client.account.login(sogniUsername, password);
    console.log(`[GLOBAL] Successfully authenticated global client: ${clientAppId}`);
    console.log(`[GLOBAL] Auth state:`, {
      isAuthenticated: client.account.currentAccount.isAuthenicated,
              hasToken: !!client.account.currentAccount.token,
              hasRefreshToken: !!client.account.currentAccount.refreshToken
            });
    console.log(`[GLOBAL] SDK will automatically refresh access tokens (24h lifespan) using refresh tokens (30d lifespan)`);
  } catch (error) {
    console.error(`[GLOBAL] Authentication failed for global client:`, error);
    throw error;
  }
  
  // Set up event listeners for connection monitoring
  if (client.apiClient && client.apiClient.on) {
    client.apiClient.on('connected', () => {
      recordClientActivity(clientAppId);
      console.log(`[GLOBAL] Global client connected to Sogni`);
    });
    
    client.apiClient.on('disconnected', () => {
      recordClientActivity(clientAppId);
      console.log(`[GLOBAL] Global client disconnected from Sogni`);
    });
    
    client.apiClient.on('error', (error) => {
      recordClientActivity(clientAppId);
      console.log(`[GLOBAL] Global client socket error:`, error.message);
    });
  }
  
  globalSogniClient = client;
  activeConnections.set(clientAppId, client);
  recordClientActivity(clientAppId);
  logConnectionStatus('Created', clientAppId);
  
  return globalSogniClient;
}

// Enhanced wrapper for Sogni operations with proper error handling
async function withSogniClient(operation, operationName = 'operation') {
  let client;
  let retryCount = 0;
  const maxRetries = 2;
  
  while (retryCount <= maxRetries) {
    try {
      client = await getOrCreateGlobalSogniClient();
      
      // Execute the operation
      const result = await operation(client);
      recordClientActivity(client.appId);
      return result;
      
    } catch (error) {
      console.log(`[SOGNI] Error during ${operationName} (attempt ${retryCount + 1}/${maxRetries + 1}):`, error.message);
      
      // Validate if this is truly an auth error
      if (client && await validateAuthError(client, error)) {
        console.log(`[SOGNI] Confirmed auth error - clearing global client and retrying`);
        
        // Clear the global client to force re-authentication
        if (globalSogniClient) {
          try {
            await globalSogniClient.account.logout();
          } catch (logoutError) {
            // Ignore logout errors
          }
          if (activeConnections.has(globalSogniClient.appId)) {
            activeConnections.delete(globalSogniClient.appId);
            connectionLastActivity.delete(globalSogniClient.appId);
          }
          globalSogniClient = null;
        }
        
        retryCount++;
        if (retryCount <= maxRetries) {
          console.log(`[SOGNI] Retrying ${operationName} after auth error (attempt ${retryCount + 1})`);
          continue;
        }
      } else {
        console.log(`[SOGNI] Error is not auth-related, not retrying:`, error.message);
      }
      
      // Re-throw the error if we can't retry or have exhausted retries
      throw error;
    }
  }
}

// Helper functions for backwards compatibility
export function clearInvalidTokens() {
  console.log('[AUTH] Clearing global client due to invalid tokens');
  if (globalSogniClient) {
    try {
      globalSogniClient.account.logout().catch(() => {
        // Ignore logout errors during cleanup
      });
    } catch (error) {
      // Ignore errors during logout
    }
    
    if (activeConnections.has(globalSogniClient.appId)) {
      activeConnections.delete(globalSogniClient.appId);
      connectionLastActivity.delete(globalSogniClient.appId);
    }
    globalSogniClient = null;
  }
}

export async function forceAuthReset() {
  console.log('[AUTH] Force clearing global client and re-authenticating');
  
  if (globalSogniClient) {
    try {
      await globalSogniClient.account.logout();
    } catch (error) {
      console.log('[AUTH] Logout error during force reset (expected):', error.message);
    }
    
    if (activeConnections.has(globalSogniClient.appId)) {
      activeConnections.delete(globalSogniClient.appId);
      connectionLastActivity.delete(globalSogniClient.appId);
    }
    globalSogniClient = null;
  }
  
  // Clear session mappings but don't cleanup other services
  sessionClients.clear();
  
  console.log('[AUTH] Force auth reset completed - next request will re-authenticate');
}

// Backwards compatibility - create client (now returns global client)
async function createSogniClient() {
  console.log(`[LEGACY] Creating Sogni client (using global client)`);
  return await getOrCreateGlobalSogniClient();
}

// Simplified session client management - all sessions use the same global authenticated client
export async function getSessionClient(sessionId) {
  console.log(`[SESSION] Getting client for session ${sessionId}`);
  
  try {
    const client = await getOrCreateGlobalSogniClient();
    
    // Map this session to the global client for tracking
    sessionClients.set(sessionId, client.appId);
    
    console.log(`[SESSION] Successfully provided global client to session ${sessionId}`);
    return client;
  } catch (error) {
    console.error(`[SESSION] Failed to get client for session ${sessionId}:`, error);
    throw error;
  }
}

export async function disconnectSessionClient(sessionId) {
  console.log(`[SESSION] Disconnecting session client for session ${sessionId}`);
  
  // Just remove the session mapping - don't disconnect the global client
  sessionClients.delete(sessionId);
  
  console.log(`[SESSION] Session ${sessionId} disconnected (global client remains active)`);
  return true;
}

// Image generation with comprehensive error handling and streaming (restored from original)
export async function generateImage(client, params, progressCallback, localProjectId = null) {
  return await withSogniClient(async (sogniClient) => {
    console.log('[IMAGE] Starting image generation with params:', {
      model: params.model,
      // prompt: params.prompt?.substring(0, 50) + '...',
      //...Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'prompt'))
    });

    // Prepare project options in the correct format for the Sogni SDK
    const isEnhancement = params.startingImage !== undefined;
    
    const projectOptions = {
      modelId: params.selectedModel,
      positivePrompt: params.positivePrompt || '',
      negativePrompt: params.negativePrompt || '',
      stylePrompt: params.stylePrompt || '',
      sizePreset: 'custom',
      width: params.width,
      height: params.height,
      steps: params.inferenceSteps || (isEnhancement ? 4 : 7),
      guidance: params.promptGuidance || (isEnhancement ? 1 : 2),
      numberOfImages: params.numberImages || 1,
      numberOfPreviews: 10,
      scheduler: 'DPM Solver Multistep (DPM-Solver++)',
      timeStepSpacing: 'Karras',
      disableNSFWFilter: true,
      tokenType: params.tokenType || 'spark',
      ...(params.seed !== undefined ? { seed: params.seed } : {})
    };
    

    

    
    // Add image data for enhancement or controlNet
    if (isEnhancement) {
      const imageData = params.startingImage instanceof Uint8Array 
        ? params.startingImage 
        : new Uint8Array(params.startingImage);
      projectOptions.startingImage = imageData;
      projectOptions.startingImageStrength = params.startingImageStrength || 0.85;
      
      console.log(`[IMAGE] Enhancement image: ${(imageData.length / 1024 / 1024).toFixed(2)}MB`);
    } else if (params.imageData) {
      const imageData = params.imageData instanceof Uint8Array 
        ? params.imageData 
        : new Uint8Array(params.imageData);
      projectOptions.controlNet = {
        name: 'instantid',
        image: imageData,
        strength: params.controlNetStrength || 0.8,
        mode: 'balanced',
        guidanceStart: 0,
        guidanceEnd: params.controlNetGuidanceEnd || 0.3,
      };
      
      console.log(`[IMAGE] ControlNet image: ${(imageData.length / 1024 / 1024).toFixed(2)}MB`);
    }

    // Create project
    const project = await sogniClient.projects.create(projectOptions);
    console.log('[IMAGE] Project created:', project.id);

    // Send initial queued event (simulated since SDK doesn't provide queue info)
    if (progressCallback) {
      progressCallback({
        type: 'queued',
        projectId: localProjectId || project.id,
        queuePosition: 1 // Simulated queue position
      });
    }

    // Project completion tracking (restored from original)
    const projectCompletionTracker = {
      expectedJobs: params.numberImages || 1,
      sentJobCompletions: 0,
      jobProgress: new Map(),
      jobCompletionTimeouts: new Map(),
      projectCompletionReceived: false,
      projectCompletionEvent: null,
      sendProjectCompletion: null,
      jobIndexMap: new Map() // Track job ID to index mapping
    };

    // Store project details for event enrichment
    const projectDetails = {
      localProjectId: localProjectId,
      positivePrompt: params.positivePrompt || '',
      negativePrompt: params.negativePrompt || '',
      stylePrompt: params.stylePrompt || ''
    };

    // Job index counter for proper job assignment
    let nextJobIndex = 0;

    // Return promise that resolves when project is complete but streams individual jobs
    return new Promise((resolve, reject) => {
      let projectFinished = false;
      
      // Set up cleanup function that can be used by all handlers
      let cleanup = () => {}; // Default no-op function
      
      // Set up progress monitoring with comprehensive error handling using global client events
      if (progressCallback) {
        
        // Create job event handler for this project (restored from original)
        const jobHandler = (event) => {
          try {
            // Only process events for this specific project
            if (event.projectId !== project.id) {
              return;
            }
            

            
            let progressEvent = null;
            
            // Process different event types with original data structure
            switch (event.type) {
              case 'preview':
                // Handle preview events
                if (!event.jobId || !event.url) {
                  console.log(`[IMAGE] Skipping preview event - missing jobId or url:`, { jobId: event.jobId, hasUrl: !!event.url });
                  break;
                }
                
                // Cancel fallback completion timeout since we received a preview (job is still actively generating)
                if (projectCompletionTracker.jobCompletionTimeouts.has(event.jobId)) {
                  console.log(`[IMAGE] Preview received for job ${event.jobId}, canceling fallback completion timeout`);
                  clearTimeout(projectCompletionTracker.jobCompletionTimeouts.get(event.jobId));
                  projectCompletionTracker.jobCompletionTimeouts.delete(event.jobId);
                }
                
                progressEvent = {
                  type: 'preview',
                  jobId: event.jobId,
                  projectId: projectDetails.localProjectId || event.projectId,
                  previewUrl: event.url,
                  resultUrl: event.url, // Also set as resultUrl for compatibility
                  positivePrompt: event.positivePrompt || projectDetails.positivePrompt,
                  jobIndex: event.jobIndex
                };

                break;
                
              case 'initiating':
              case 'started':
                // Skip events without jobId as they can't be assigned to specific jobs
                if (!event.jobId) {
                  console.log(`[IMAGE] Skipping ${event.type} event without jobId`);
                  break;
                }
                
                progressEvent = {
                  type: event.type,
                  jobId: event.jobId,
                  projectId: projectDetails.localProjectId || event.projectId,
                  workerName: event.workerName || 'unknown',
                  positivePrompt: event.positivePrompt || projectDetails.positivePrompt,
                  jobIndex: event.jobIndex
                };
                break;
                
              case 'progress': {
                if (event.step && event.stepCount) {
                  const progressPercent = Math.floor(event.step / event.stepCount * 100);
                  
                  progressEvent = {
                    type: 'progress',
                    progress: progressPercent,
                    step: event.step,
                    stepCount: event.stepCount,
                    jobId: event.jobId,
                    projectId: projectDetails.localProjectId || event.projectId
                  };
                  
                  // Track job progress and set up fallback completion detection
                  if (event.jobId) {
                    projectCompletionTracker.jobProgress.set(event.jobId, progressPercent);
                    
                    // If job reaches 85%+ and no completion timeout is set, set one up
                    if (progressPercent >= 85 && !projectCompletionTracker.jobCompletionTimeouts.has(event.jobId)) {
                      console.log(`[IMAGE] Job ${event.jobId} reached ${progressPercent}%, setting up fallback completion timeout`);
                      
                      const timeoutId = setTimeout(() => {
                        console.log(`[IMAGE] Fallback completion timeout triggered for job ${event.jobId} - simulating completion event`);
                        
                        // Get job index if we have it
                        const jobIndex = projectCompletionTracker.jobIndexMap.get(event.jobId) || 0;
                        
                        // Create fallback completion event
                        const fallbackProgressEvent = {
                          type: 'jobCompleted',
                          jobId: event.jobId,
                          projectId: projectDetails.localProjectId || event.projectId,
                          resultUrl: null,
                          positivePrompt: event.positivePrompt || projectDetails.positivePrompt,
                          stylePrompt: projectDetails.stylePrompt,
                          jobIndex: jobIndex,
                          isNSFW: false,
                          seed: null,
                          steps: null,
                          fallback: true
                        };
                        
                        // Send fallback completion
                        progressCallback(fallbackProgressEvent);
                        projectCompletionTracker.sentJobCompletions++;
                        console.log(`[IMAGE] Fallback job completion sent for ${event.jobId} (${projectCompletionTracker.sentJobCompletions}/${projectCompletionTracker.expectedJobs})`);
                        
                        // Clean up timeout
                        projectCompletionTracker.jobCompletionTimeouts.delete(event.jobId);
                        
                        // Check if all jobs are done (fix for SDK timing issue)
                        if (projectCompletionTracker.projectCompletionReceived && 
                            projectCompletionTracker.sentJobCompletions >= projectCompletionTracker.expectedJobs) {
                          console.log(`[IMAGE] All jobs completed via fallback, triggering project completion`);
                          if (!projectFinished) {
                            projectFinished = true;
                            cleanup();
                            
                            if (progressCallback && projectCompletionTracker.projectCompletionEvent) {
                              progressCallback(projectCompletionTracker.projectCompletionEvent);
                            }
                            
                            resolve([]);
                          }
                        }
                      }, 20000); // Wait 20 seconds after reaching 85%
                      
                      projectCompletionTracker.jobCompletionTimeouts.set(event.jobId, timeoutId);
                    }
                  }
                } else {
                  // Handle project-level progress events without jobId
                  if (!event.jobId) {
                    // Skip project-level progress events without jobId to avoid frontend confusion
                    // These are typically overall project progress that doesn't map to specific jobs
                    console.log(`[IMAGE] Skipping project-level progress event without jobId: ${event.progress}`);
                    break;
                  }
                  
                  progressEvent = {
                    type: 'progress',
                    progress: event.progress || 0,
                    jobId: event.jobId,
                    projectId: projectDetails.localProjectId || event.projectId
                  };
                }
                break;
              }
              
              case 'completed':
              case 'jobCompleted': {
                // Skip job completion events without jobId as they can't be assigned to specific jobs
                if (!event.jobId) {
                  console.log(`[IMAGE] Skipping jobCompleted event without jobId`);
                  break;
                }
                
                // Handle job completion with comprehensive error checking (restored from original)
                let resultUrl = event.resultUrl;
                
                // Log when resultUrl is missing from the real event (not fallback)
                if (!resultUrl && !event.fallback) {
                  console.error(`[IMAGE] Job ${event.jobId} completed but resultUrl is null in the event itself`);
                  console.error(`[IMAGE] Event details:`, JSON.stringify(event, null, 2));
                }
                
                // Get the job index from our tracking
                const jobIndex = projectCompletionTracker.jobIndexMap.get(event.jobId) || 0;
                
                progressEvent = {
                  type: 'jobCompleted',
                  jobId: event.jobId,
                  projectId: projectDetails.localProjectId || event.projectId,
                  resultUrl: resultUrl,
                  positivePrompt: event.positivePrompt || projectDetails.positivePrompt,
                  stylePrompt: projectDetails.stylePrompt,
                  jobIndex: jobIndex,
                  isNSFW: event.isNSFW,
                  seed: event.seed,
                  steps: event.steps
                };
                
                // Handle NSFW filtering (restored from original)
                if (event.isNSFW && !resultUrl) {
                  console.warn(`[IMAGE] Job ${event.jobId} completed but was flagged as NSFW, resultUrl is null`);
                  console.warn(`[IMAGE] Job details: seed=${event.seed}, steps=${event.steps}, project=${project.id}`);
                  progressEvent.nsfwFiltered = true;
                } else if (!resultUrl && !event.isNSFW) {
                  console.warn(`[IMAGE] Job ${event.jobId} completed but resultUrl is missing from both event and project data`);
                  console.warn(`[IMAGE] Job details: seed=${event.seed}, steps=${event.steps}, project=${project.id}`);
                }
                
                // Track completion
                projectCompletionTracker.sentJobCompletions++;
                console.log(`[IMAGE] Job completion sent for ${event.jobId} (${projectCompletionTracker.sentJobCompletions}/${projectCompletionTracker.expectedJobs})`);
                
                // Clean up any pending timeout for this job
                if (projectCompletionTracker.jobCompletionTimeouts.has(event.jobId)) {
                  clearTimeout(projectCompletionTracker.jobCompletionTimeouts.get(event.jobId));
                  projectCompletionTracker.jobCompletionTimeouts.delete(event.jobId);
                }
                
                // Check if we can send the project completion now (fix for SDK timing issue)
                if (projectCompletionTracker.projectCompletionReceived && 
                    projectCompletionTracker.sentJobCompletions >= projectCompletionTracker.expectedJobs) {
                  console.log(`[IMAGE] All job completions sent (${projectCompletionTracker.sentJobCompletions}/${projectCompletionTracker.expectedJobs}), triggering project completion`);
                  if (!projectFinished) {
                    projectFinished = true;
                    cleanup();
                    
                    if (progressCallback && projectCompletionTracker.projectCompletionEvent) {
                      progressCallback(projectCompletionTracker.projectCompletionEvent);
                    }
                    
                    resolve([]);
                  }
                }
                
                break;
              }
            }
            
            // Send the event to frontend
            if (progressEvent && progressCallback) {
              progressCallback(progressEvent);
            }
            
          } catch (jobHandlerError) {
            console.error(`[IMAGE] Error in job event handler:`, jobHandlerError);
          }
        };
        
        // Register the global job event handler
        try {
          sogniClient.projects.on('job', jobHandler);
        } catch (eventRegistrationError) {
          console.error(`[IMAGE] Error registering job event handler:`, eventRegistrationError);
        }
        
        // Set up cleanup function when project completes (restored from original)
        cleanup = () => {
          try {
            sogniClient.projects.off('job', jobHandler);
          } catch (err) {
            console.error(`[IMAGE] Error removing job event handler:`, err);
          }
        };
        
        // Handle job started events to assign job indices and send initiating/started events
        project.on('jobStarted', (job) => {
          console.log(`[IMAGE] Job started: ${job.id}, workerName: ${job.workerName || 'unknown'}`);
          
          // Assign job index and track it
          const jobIndex = nextJobIndex++;
          projectCompletionTracker.jobIndexMap.set(job.id, jobIndex);
          
          // Send initiating event first (job being assigned to worker)
          progressCallback({ 
            type: 'initiating', 
            jobId: job.id,
            projectId: projectDetails.localProjectId || project.id,
            workerName: job.workerName || 'unknown',
            positivePrompt: projectDetails.positivePrompt,
            jobIndex: jobIndex
          });
          
          // Then send started event (job actually starting)
          progressCallback({ 
            type: 'started', 
            jobId: job.id,
            projectId: projectDetails.localProjectId || project.id,
            workerName: job.workerName || 'unknown',
            positivePrompt: projectDetails.positivePrompt,
            jobIndex: jobIndex
          });
        });
      }

      // Handle project completion (all jobs done) - with fix for SDK timing issue
      project.on('completed', (imageUrls) => {
        // Prevent duplicate processing of project completion
        if (projectFinished || projectCompletionTracker.projectCompletionReceived) {
          console.log('[IMAGE] Project completion already processed, ignoring duplicate');
          return;
        }
        
        console.log('[IMAGE] Project completed, all jobs finished. Total images:', imageUrls.length);
        
        // Store the completion event instead of sending it immediately (fix for SDK timing issue)
        const completionEvent = {
          type: 'completed',
          projectId: projectDetails.localProjectId || project.id,
          imageUrls: imageUrls,
          missingJobs: {
            expected: projectCompletionTracker.expectedJobs,
            completed: projectCompletionTracker.sentJobCompletions
          }
        };
        
        projectCompletionTracker.projectCompletionReceived = true;
        projectCompletionTracker.projectCompletionEvent = completionEvent;
        
        console.log(`[IMAGE] Project completion received: ${projectCompletionTracker.sentJobCompletions}/${projectCompletionTracker.expectedJobs} job completions sent to frontend`);
        
        // Check if we can send the project completion immediately
        if (projectCompletionTracker.sentJobCompletions >= projectCompletionTracker.expectedJobs) {
          console.log(`[IMAGE] All job completions already sent, sending project completion immediately`);
          if (!projectFinished) {
            projectFinished = true;
            cleanup();
            
            if (progressCallback) {
              progressCallback(completionEvent);
            }
            
            resolve(imageUrls);
          }
        } else {
          console.log(`[IMAGE] Waiting for ${projectCompletionTracker.expectedJobs - projectCompletionTracker.sentJobCompletions} more job completions before sending project completion`);
          
          // Set a failsafe timeout to send completion even if some job events are missing
          setTimeout(() => {
            console.log(`[IMAGE] Failsafe timeout reached, sending project completion (sent ${projectCompletionTracker.sentJobCompletions}/${projectCompletionTracker.expectedJobs} job completions)`);
            if (!projectFinished) {
              projectFinished = true;
              cleanup();
              
              if (progressCallback) {
                progressCallback(completionEvent);
              }
              
              resolve(imageUrls);
            }
          }, 3000); // 3 second failsafe
        }
      });

      // Handle project failure with detailed error analysis
      project.on('failed', (error) => {
        console.error('[IMAGE] Project failed:', error);
        
        // Clear any remaining timeouts
        for (const timeoutId of projectCompletionTracker.jobCompletionTimeouts.values()) {
          clearTimeout(timeoutId);
        }
        projectCompletionTracker.jobCompletionTimeouts.clear();
        
        if (!projectFinished) {
          projectFinished = true;
          
          // Clean up event handlers
          if (progressCallback) {
            cleanup();
          }
          
          // Analyze error type for better error handling
          const isAuthError = error.status === 401 || 
                             (error.payload && error.payload.errorCode === 107) ||
                             error.message?.includes('Invalid token');
          
          const isInsufficientFundsError = error.payload?.errorCode === 4024 || 
                                         error.message?.includes('Insufficient funds') ||
                                         error.message?.includes('Debit Error');
          
          let errorMessage = error.message || 'Image generation failed';
          if (isInsufficientFundsError) {
            errorMessage = 'Insufficient Sogni credits to generate images. Please add more credits to your account.';
          }
          
          if (progressCallback) {
            progressCallback({
              type: 'error',
              projectId: project.id,
              message: errorMessage,
              details: error.toString(),
              errorCode: isAuthError ? 'auth_error' : 
                       isInsufficientFundsError ? 'insufficient_funds' :
                       (error.payload?.errorCode ? `api_error_${error.payload.errorCode}` : 'unknown_error'),
              status: error.status || 500,
              isAuthError: isAuthError,
              isInsufficientFunds: isInsufficientFundsError
            });
          }
          
          reject(new Error(errorMessage));
        }
      });

      // Enhanced timeout with better error reporting
      setTimeout(() => {
        if (!projectFinished) {
          console.warn(`[IMAGE] Project ${project.id} timeout after 5 minutes`);
          
          // Clear any remaining timeouts
          for (const timeoutId of projectCompletionTracker.jobCompletionTimeouts.values()) {
            clearTimeout(timeoutId);
          }
          projectCompletionTracker.jobCompletionTimeouts.clear();
          
          // Clean up event handlers
          if (progressCallback) {
            cleanup();
          }
          
          projectFinished = true;
          reject(new Error('Project timeout after 5 minutes'));
        }
      }, 5 * 60 * 1000); // 5 minute timeout
    });
  }, 'image generation');
}

// Client info for debugging
export async function getClientInfo(sessionId) {
  try {
    const client = await getOrCreateGlobalSogniClient();
    
    return {
      appId: client.appId,
      isAuthenticated: client.account.currentAccount.isAuthenicated,
      networkStatus: client.account.currentAccount.networkStatus,
      network: client.account.currentAccount.network,
      hasToken: !!client.account.currentAccount.token,
      hasRefreshToken: !!client.account.currentAccount.refreshToken,
      walletAddress: client.account.currentAccount.walletAddress,
      username: client.account.currentAccount.username,
      balance: client.account.currentAccount.balance,
      sessionId: sessionId,
      globalClientActive: !!globalSogniClient,
      activeConnectionsCount: activeConnections.size
    };
      } catch (error) {
    console.error('[INFO] Error getting client info:', error);
    return {
      error: error.message,
      sessionId: sessionId,
      globalClientActive: !!globalSogniClient,
      activeConnectionsCount: activeConnections.size
    };
  }
}

// Backwards compatibility
export async function initializeSogniClient() {
  return createSogniClient();
}

// Simplified cleanup - only affects global client
export async function cleanupSogniClient({ logout = false, includeSessionClients = false } = {}) {
  console.log(`[CLEANUP] Cleaning up Sogni connections (logout: ${logout})`);
  
  if (globalSogniClient) {
    try {
      if (logout) {
        console.log(`[CLEANUP] Logging out global client: ${globalSogniClient.appId}`);
        await globalSogniClient.account.logout();
      }
      
      if (activeConnections.has(globalSogniClient.appId)) {
        activeConnections.delete(globalSogniClient.appId);
        connectionLastActivity.delete(globalSogniClient.appId);
      }
      
      console.log(`[CLEANUP] Global client cleaned up`);
        } catch (error) {
      console.error('[CLEANUP] Error during global client cleanup:', error);
    }
    
    if (logout) {
      globalSogniClient = null;
    }
  }
  
  if (includeSessionClients) {
    sessionClients.clear();
    console.log('[CLEANUP] Session client mappings cleared');
  }
  
  console.log('[CLEANUP] Sogni client cleanup completed');
  return true;
}

// Idle connection checking - conservative approach given 24h token lifespan
export const checkIdleConnections = async () => {
  const now = Date.now();
  const idleThreshold = 2 * 60 * 60 * 1000; // 2 hours (much less than 24h token lifespan)
  
  for (const [clientId, lastActivity] of connectionLastActivity.entries()) {
    if (now - lastActivity > idleThreshold) {
      console.log(`[IDLE] Client ${clientId} has been idle for ${Math.round((now - lastActivity) / 60000)} minutes`);
      
      if (clientId === globalSogniClient?.appId) {
        // Keep global client active since tokens are valid for 24h
        // Only log periodically to avoid spam
        if (Math.round((now - lastActivity) / 60000) % 60 === 0) { // Every hour
          console.log(`[IDLE] Global client idle but maintaining connection (tokens valid for 24h)`);
        }
          } else {
        // Clean up any orphaned connections
            activeConnections.delete(clientId);
            connectionLastActivity.delete(clientId);
      }
    }
  }
};

// Setup periodic idle checking
const idleCheckInterval = setInterval(checkIdleConnections, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown handling
process.on('SIGINT', () => {
  clearInterval(idleCheckInterval);
  console.log('Cleaning up Sogni connections before shutdown...');
  cleanupSogniClient({ logout: true })
    .then(() => {
      console.log('Completed Sogni cleanup on shutdown');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error during shutdown cleanup:', error);
      process.exit(1);
    });
});

process.on('SIGTERM', () => {
  clearInterval(idleCheckInterval);
  console.log('Cleaning up Sogni connections before shutdown...');
  cleanupSogniClient({ logout: true })
    .then(() => {
      console.log('Completed Sogni cleanup on shutdown');
    })
    .catch((error) => {
      console.error('Error during shutdown cleanup:', error);
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('Promise object:', promise);
  }
});
