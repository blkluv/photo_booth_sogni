/**
 * API service for communicating with the backend
 */
import urls from '../config/urls';
import { v4 as uuidv4 } from 'uuid';

// Use the configured API URL from the urls config
const API_BASE_URL = urls.apiUrl;

// App ID management
const APP_ID_COOKIE_NAME = 'sogni_app_id';

// Function to get or generate an app ID and store it in a cookie
const getOrCreateAppId = (): string => {
  if (typeof document === 'undefined') return '';

  // Try to get existing app ID from cookie
  const cookies = document.cookie.split(';');
  const appIdCookie = cookies.find(cookie => cookie.trim().startsWith(`${APP_ID_COOKIE_NAME}=`));
  
  if (appIdCookie) {
    const appId = appIdCookie.split('=')[1].trim();
    console.log(`Using existing app ID from cookie: ${appId}`);
    return appId;
  }
  
  // Generate a new app ID if none exists
  const appPrefix = 'photobooth';
  const newAppId = `${appPrefix}-${uuidv4()}`;
  
  // Store in cookie with long expiration (30 days)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);
  
  // Set the cookie with secure attributes
  const isSecure = window.location.protocol === 'https:';
  document.cookie = `${APP_ID_COOKIE_NAME}=${newAppId};path=/;max-age=${30*24*60*60};${isSecure ? 'secure;' : ''}samesite=lax`;
  
  console.log(`Generated new app ID and stored in cookie: ${newAppId}`);
  return newAppId;
};

// Get the app ID on module load
export const clientAppId = typeof window !== 'undefined' ? getOrCreateAppId() : '';

// Keep track of last status check to avoid duplicate calls
let lastStatusCheckTime = 0;
const STATUS_CHECK_THROTTLE_MS = 2000; // 2 seconds

// Track if we've connected to Sogni at least once in this session
let hasConnectedToSogni = false;

// Use a pending promise mechanism to avoid duplicate status checks
let pendingStatusCheck: Promise<unknown> | null = null;

// Track if we've already sent a disconnect signal
let hasDisconnectedBeforeUnload = false;

// Track recent disconnect attempts by client ID to prevent duplicates
const recentDisconnects = new Set<string>();
const DISCONNECT_CACHE_TTL = 3000; // 3 seconds

// Setup disconnect on page unload to prevent lingering WebSocket connections
const setupDisconnectHandlers = () => {
  if (typeof window !== 'undefined') {
    // Handle both beforeunload (user closing page) and unload (actual unload)
    const handleUnload = () => {
      // Avoid sending multiple disconnect requests
      if (hasDisconnectedBeforeUnload) {
        console.log('Already sent disconnect request, skipping additional request');
        return;
      }
      hasDisconnectedBeforeUnload = true;
      
      // Only try to disconnect if we've connected at least once
      if (!hasConnectedToSogni) {
        console.log('No Sogni connection established, skipping disconnect');
        return;
      }
      
      // Add to recent disconnects to prevent duplicate calls
      if (clientAppId) {
        recentDisconnects.add(clientAppId);
      }
      
      // Strategy 1: Use GET with query params to ensure app ID is included
      const url = `${API_BASE_URL}/sogni/disconnect?clientAppId=${encodeURIComponent(clientAppId)}&_t=${Date.now()}`;
      
      // Use the GET endpoint for more reliable unload handling
      // The browser will more reliably send GET requests during unload
      const img = new Image();
      img.src = url;
      
      // Strategy 2: For modern browsers that support Beacon API 
      if (navigator.sendBeacon) {
        // Create a blob with the client app ID
        const blob = new Blob([JSON.stringify({ clientAppId })], { type: 'application/json' });
        navigator.sendBeacon(`${API_BASE_URL}/sogni/disconnect`, blob);
      }
      
      // Strategy 3: As a last resort, try a synchronous XHR (might not work in modern browsers)
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // Synchronous request
        xhr.withCredentials = true; // Include cookies
        xhr.send();
      } catch {
        // Ignore errors - this is a best-effort attempt
      }
      
      console.log('Sent disconnect request before page unload');
    };
    
    // Throttled version of the unload handler
    const throttledUnload = (event: BeforeUnloadEvent | Event) => {
      handleUnload();
      
      // In case of beforeunload, allow the page to exit normally
      if (event.type === 'beforeunload') {
        delete event.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', throttledUnload);
    window.addEventListener('unload', throttledUnload);
    
    console.log('Disconnect handlers installed for window unload events');
    
    // Call checkSogniStatus once on page load to establish a session
    setTimeout(() => {
      checkSogniStatus()
        .then(() => {
          hasConnectedToSogni = true;
          console.log('Initial Sogni connection established');
        })
        .catch(err => {
          console.warn('Failed to establish initial Sogni connection:', err);
        });
    }, 1000); // Delay status check slightly to allow page to render first
  }
};

// Initialize disconnect handlers immediately
setupDisconnectHandlers();

// Utility type guard for Record<string, unknown>
function isObjectRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Explicitly disconnect the current session from the server
 * Useful when manually cleaning up resources
 */
export async function disconnectSession(): Promise<boolean> {
  try {
    // Skip if we never connected
    if (!hasConnectedToSogni) {
      console.log('No active Sogni connection to disconnect');
      return true;
    }
    
    // Avoid redundant disconnects for the same client ID
    if (clientAppId && recentDisconnects.has(clientAppId)) {
      console.log(`Skipping redundant disconnect for client ${clientAppId} (recently disconnected)`);
      return true;
    }
    
    console.log('Explicitly disconnecting from Sogni...');
    
    // Set the flag to avoid duplicate disconnects on unload
    hasDisconnectedBeforeUnload = true;
    
    // Add to recent disconnects to prevent duplicate calls
    if (clientAppId) {
      recentDisconnects.add(clientAppId);
      
      // Clear after timeout
      setTimeout(() => {
        recentDisconnects.delete(clientAppId);
      }, DISCONNECT_CACHE_TTL);
    }
    
    // Multiple strategies for reliable disconnection
    const results = await Promise.allSettled([
      // Strategy 1: POST with JSON body and headers
      fetch(`${API_BASE_URL}/sogni/disconnect`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Client-App-ID': clientAppId
        },
        body: JSON.stringify({ clientAppId })
      }),
      
      // Strategy 2: GET with query params as backup
      fetch(`${API_BASE_URL}/sogni/disconnect?clientAppId=${encodeURIComponent(clientAppId)}&_t=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'X-Client-App-ID': clientAppId
        }
      })
    ]);
    
    // Check if at least one method succeeded
    const anySuccess = results.some(result => 
      result.status === 'fulfilled' && 
      (result.value).ok
    );
    
    if (anySuccess) {
      console.log('Successfully disconnected from Sogni');
      return true;
    } else {
      // Check for auth errors and log them, but don't treat as failures
      const authErrors = results.filter(result => 
        result.status === 'fulfilled' && 
        (result.value).status === 401
      );
      
      if (authErrors.length > 0) {
        console.log('Disconnect received 401 authentication error, but this is common during cleanup');
        // Return true since the server will clean up the session regardless
        return true;
      }
      
      console.warn('Disconnect failed with errors on all methods');
      return false;
    }
  } catch (error) {
    console.error('Error during explicit disconnect:', error);
    return false;
  }
}

/**
 * Check Sogni connection status
 */
export async function checkSogniStatus() {
  const now = Date.now();
  
  // If there's already a pending check, return that promise
  if (pendingStatusCheck) {
    console.log('Using existing pending status check');
    return pendingStatusCheck;
  }
  
  // Throttle frequent calls - use cached result if within threshold
  if (now - lastStatusCheckTime < STATUS_CHECK_THROTTLE_MS) {
    console.log(`Status check throttled - last check was ${Math.floor((now - lastStatusCheckTime)/1000)}s ago`);
    // Instead of throwing, return a rejected promise with a specific error
    return Promise.reject(new Error('Status check throttled'));
  }
  
  // Mark the time of this check attempt
  lastStatusCheckTime = now;
  
  // Create a new promise for this check
  pendingStatusCheck = (async () => {
    try {
      console.log('Checking Sogni status...');
      const response = await fetch(`${API_BASE_URL}/sogni/status`, {
        credentials: 'include', // Include credentials for cross-origin requests
        headers: {
          'Accept': 'application/json',
          'X-Client-App-ID': clientAppId, // Add client app ID as header
        }
      });
      
      // Handle error responses
      if (!response.ok) {
        // Try to get the error details from the response
        let errorDetails = '';
        try {
          const errorData: unknown = await response.json();
          if (isObjectRecord(errorData)) {
            errorDetails = (errorData as { message?: string }).message || (errorData as { error?: string }).error || 'Unknown error';
          } else {
            errorDetails = response.statusText;
          }
          console.error('Status check failed:', errorData);
        } catch (err: unknown) {
          errorDetails = response.statusText;
          console.error('Error parsing response:', err);
        }
        
        // Throw an error with status code and message
        throw new Error(`${response.status} ${String(errorDetails)}`);
      }
      
      const dataRaw: unknown = await response.json();
      const data: Record<string, unknown> = isObjectRecord(dataRaw) ? dataRaw : {};
      console.log('Sogni status check successful:', data);
      
      // Mark that we have successfully connected at least once
      hasConnectedToSogni = true;
      
      return data;
    } catch (error) {
      console.error('Error checking Sogni status:', error);
      throw error;
    } finally {
      // Clear the pending promise after a short delay
      // This prevents immediate retries but allows future checks
      setTimeout(() => {
        pendingStatusCheck = null;
      }, 500);
    }
  })();
  
  return pendingStatusCheck;
}

/**
 * Create a project directly through the backend service
 * 
 * @param params All the parameters needed to create a Sogni project
 * @param progressCallback Optional callback for progress updates
 * @returns Promise that resolves with the complete project data
 */
export async function createProject(params: Record<string, unknown>, progressCallback?: (data: unknown) => void): Promise<unknown> {
  try {
    // Process the image data based on the request type (enhancement or generation)
    let imageData: unknown;
    let isEnhancement = false;
    
    // Check if this is an enhancement request (has startingImage) or generation (has controlNet)
    if (params.startingImage) {
      isEnhancement = true;
      
      // For enhancement, the image is already in Array form
      if (Array.isArray(params.startingImage)) {
        imageData = params.startingImage;
      } else if (params.startingImage instanceof Uint8Array) {
        // Convert Uint8Array to regular array
        imageData = Array.from(params.startingImage);
      } else {
        throw new Error('Enhancement requires startingImage as Array or Uint8Array');
      }
    } 
    // Process controlNet image for normal generation
    else if (
      typeof params.controlNet === 'object' && params.controlNet !== null &&
      'image' in params.controlNet &&
      (Array.isArray((params.controlNet as { image: unknown }).image) || (params.controlNet as { image: unknown }).image instanceof Uint8Array)
    ) {
      const controlNet = params.controlNet as { image: unknown };
      if (controlNet.image instanceof Uint8Array) {
        // Check image size and compress if needed
        const originalSize = controlNet.image.length;
        console.log(`Original image size: ${originalSize / 1024 / 1024} MB`);
        
        // For large images, send chunks or downsize
        if (originalSize > 10 * 1024 * 1024) { // If over 10MB
          console.log('Image is large, optimizing size...');
          // Option 1: Just use the array directly without Array.from
          // This is more memory efficient
          imageData = [...controlNet.image]; 
          // Log the compressed size
          if (Array.isArray(imageData)) {
            console.log(`Optimized image size: ${imageData.length / 1024 / 1024} MB`);
          }
        } else {
          // For smaller images, use standard approach
          imageData = Array.from(controlNet.image);
        }
      } else if (Array.isArray(controlNet.image)) {
        // Already in array form
        imageData = controlNet.image;
      } else {
        throw new Error('ControlNet requires image as Array or Uint8Array');
      }
    } else {
      throw new Error('Invalid image data format - missing controlNet.image or startingImage');
    }
    
    // Format the parameters for the backend based on request type
    let projectParams: Record<string, unknown>;
    
    if (isEnhancement) {
      // Enhancement parameters
      projectParams = {
        selectedModel: params.modelId,
        positivePrompt: params.positivePrompt || '',
        negativePrompt: params.negativePrompt || '',
        stylePrompt: params.stylePrompt || '',
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfImages,
        startingImage: Array.isArray(imageData) || imageData instanceof Uint8Array ? imageData : [],
        startingImageStrength: params.startingImageStrength || 0.85
      };
    } else {
      // Generation parameters with controlNet
      let controlNetStrength = undefined;
      let controlNetGuidanceEnd = undefined;
      if (typeof params.controlNet === 'object' && params.controlNet !== null) {
        controlNetStrength = (params.controlNet as { strength?: number }).strength;
        controlNetGuidanceEnd = (params.controlNet as { guidanceEnd?: number }).guidanceEnd;
      }
      projectParams = {
        selectedModel: params.modelId,
        positivePrompt: params.positivePrompt || '',
        negativePrompt: params.negativePrompt || '',
        stylePrompt: params.stylePrompt || '',
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfImages,
        controlNetStrength,
        controlNetGuidanceEnd,
        imageData: Array.isArray(imageData) || imageData instanceof Uint8Array ? imageData : [],
        seed: params.seed || undefined,
      };
    }
    
    return generateImage(projectParams, progressCallback);
  } catch (error: unknown) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Cancel an ongoing project
 * 
 * @param projectId The ID of the project to cancel
 * @returns Promise that resolves to the cancellation status
 */
export async function cancelProject(projectId: string): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/sogni/cancel/${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include credentials for cross-origin requests
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const resultRaw: unknown = await response.json();
    const result: Record<string, unknown> = isObjectRecord(resultRaw) ? resultRaw : {};
    console.log('Project cancellation result:', result);
    return result;
  } catch (error: unknown) {
    console.error('Error cancelling project:', error);
    throw error;
  }
}

/**
 * Generate image using Sogni with progress tracking
 * 
 * @param params Image generation parameters
 * @param progressCallback Callback function for progress updates
 * @returns Promise that resolves with the generated image URLs
 */
export async function generateImage(params: Record<string, unknown>, progressCallback?: (progress: unknown) => void): Promise<unknown> {
  try {
    console.log(`Making request to: ${API_BASE_URL}/sogni/generate`);
    
    // Include client app ID in the params
    const requestParams = {
      ...params,
      clientAppId // Add the client app ID
    };
    
    // Start the generation process
    const response = await fetch(`${API_BASE_URL}/sogni/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Client-App-ID': clientAppId, // Also add as header
      },
      credentials: 'include', // Include credentials for cross-origin requests
      body: JSON.stringify(requestParams),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const jsonRaw: unknown = await response.json();
    const json: Record<string, unknown> = isObjectRecord(jsonRaw) ? jsonRaw : {};
    const projectId = json.projectId as string | undefined;
    const status = json.status as string | undefined;
    
    // Mark that we have successfully connected
    hasConnectedToSogni = true;
    
    if (status !== 'processing' || !projectId) {
      throw new Error('Failed to start image generation');
    }
    
    // If no progress callback is provided, just return the project ID
    if (!progressCallback) {
      return { projectId };
    }
    
    // Set up SSE for progress tracking
    return new Promise((_resolve, reject) => {
      // Include connection retry logic for more robustness
      let retryCount = 0;
      const maxRetries = 5; // Increase from 3 to 5
      let eventSource: EventSource | null = null;
      let connectionTimeout: NodeJS.Timeout | undefined = undefined;
      
      // Keep track of reconnection timers
      let reconnectionTimer: NodeJS.Timeout | undefined = undefined;
      
      // Function to clear all timers
      const clearAllTimers = () => {
        if (connectionTimeout !== undefined) {
          clearTimeout(connectionTimeout);
          connectionTimeout = undefined;
        }
        if (reconnectionTimer !== undefined) {
          clearTimeout(reconnectionTimer);
          reconnectionTimer = undefined;
        }
      };
      
      // Function to safely close EventSource
      const safelyCloseEventSource = () => {
        if (eventSource) {
          try {
            eventSource.close();
          } catch (err) {
            console.warn('Error closing EventSource:', err);
          }
          eventSource = null;
        }
      };
      
      // Start connecting immediately without delay
      const connectSSE = () => {
        // Clean up any existing connection first
        clearAllTimers();
        safelyCloseEventSource();
        
        // Add client app ID to the URL as a query parameter for more reliable passing 
        // through proxies and better debugging
        const progressUrl = `${API_BASE_URL}/sogni/progress/${projectId}?clientAppId=${encodeURIComponent(clientAppId)}&_t=${Date.now()}`;
        console.log(`Connecting to progress stream: ${progressUrl} (attempt ${retryCount + 1})`);
        
        // Create the EventSource with the with-credentials flag for CORS
        try {
          eventSource = new EventSource(progressUrl, { 
            withCredentials: true 
          });
          
          // Set a shorter initial connection timeout
          connectionTimeout = setTimeout(() => {
            console.error('EventSource connection timeout');
            safelyCloseEventSource();
            
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying connection (${retryCount}/${maxRetries})...`);
              // Use exponential backoff
              reconnectionTimer = setTimeout(connectSSE, 1000 * Math.pow(1.5, retryCount));
            } else {
              reject(new Error('EventSource connection failed after multiple attempts'));
            }
          }, 7000); // Reduced from 15s to 7s for initial connection
          
          // Successfully connected
          eventSource.onopen = () => {
            console.log('EventSource connection established, clearing connection timeout.');
            clearTimeout(connectionTimeout);
            connectionTimeout = undefined;
            // Reset retry count on successful connection
            retryCount = 0;
          };
          
          eventSource.onmessage = (event) => {
            try {
              const parsed: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : {};
              const data: Record<string, unknown> = isObjectRecord(parsed) ? parsed : {};
              const projectIdStr = typeof data.projectId === 'string' ? data.projectId : 'N/A';
              console.log(`SSE message received: Type=${String(data.type)}, ProjectID=${projectIdStr}`);

              // For any message type, extend the connection timeout as we're getting data
              if (connectionTimeout !== undefined) {
                clearTimeout(connectionTimeout);
                connectionTimeout = undefined;
              }

              // Only handle connection/heartbeat events internally
              if (data.type === 'connected' || data.type === 'heartbeat') {
                // Optionally log or handle connection events
                return;
              }

              // For all other events, just forward to the callback
              if (progressCallback) {
                progressCallback(data);
              }
            } catch (error) {
              console.error('Error parsing SSE message:', error, 'Original data:', event.data);
              // Continue listening, don't fail on a single parse error
            }
          };
          
          eventSource.onerror = (err) => {
            // Log the specific error event if possible
            console.error('EventSource onerror event triggered:', err);
            
            // Clear any pending timeouts
            clearAllTimers();
            
            if (retryCount < maxRetries) {
              safelyCloseEventSource();
              retryCount++;
              
              // For ECONNRESET errors, we want to retry more quickly
              const isNetworkError = err instanceof Event && 
                (err.target && typeof ((err.target as unknown) as { readyState?: unknown }).readyState === 'number' && ((err.target as unknown) as { readyState: number }).readyState === EventSource.CLOSED);
              
              console.log(`EventSource connection error. Retrying (${retryCount}/${maxRetries})...`);
              
              // Use shorter delay for network errors
              const delay = isNetworkError ? 500 : 1000 * Math.pow(1.5, retryCount);
              console.log(`Will retry in ${delay}ms`);
              
              reconnectionTimer = setTimeout(connectSSE, delay);
            } else {
              console.error('EventSource connection failed permanently after retries.');
              safelyCloseEventSource();
              reject(new Error('EventSource connection failed'));
            }
          };
          
          // Add a timeout for the entire process
          setTimeout(() => {
            if (eventSource) {
              eventSource.close();
            }
            reject(new Error('Generation timed out'));
          }, 300000); // 5 minute timeout for the entire process
        } catch (error) {
          console.error('Error creating EventSource:', error);
          safelyCloseEventSource();
          reject(new Error('EventSource connection failed'));
        }
      };
      
      // Start connection process
      connectSSE();
    });
  } catch (error: unknown) {
    console.error('Error generating image:', error);
    throw error;
  }
} 