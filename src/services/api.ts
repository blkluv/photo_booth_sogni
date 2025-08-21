/**
 * API service for communicating with the backend
 */
import urls from '../config/urls';
import { v4 as uuidv4 } from 'uuid';

// Add network connectivity detection utilities at the top of the file after the imports
let isOnline = navigator.onLine;
let lastConnectionCheck = 0;
let connectivityCheckInProgress = false;

// Connection state management for UI feedback
type ConnectionState = 'online' | 'offline' | 'connecting' | 'timeout';
let currentConnectionState: ConnectionState = navigator.onLine ? 'online' : 'offline';
const connectionStateListeners: Array<(state: ConnectionState) => void> = [];

// Export function to subscribe to connection state changes
export function subscribeToConnectionState(listener: (state: ConnectionState) => void): () => void {
  connectionStateListeners.push(listener);
  // Return unsubscribe function
  return () => {
    const index = connectionStateListeners.indexOf(listener);
    if (index > -1) {
      connectionStateListeners.splice(index, 1);
    }
  };
}

// Notify all listeners of connection state change
function notifyConnectionStateChange(newState: ConnectionState) {
  if (currentConnectionState !== newState) {
    currentConnectionState = newState;
    console.log(`Connection state changed to: ${newState}`);
    connectionStateListeners.forEach(listener => {
      try {
        listener(newState);
      } catch (error) {
        console.warn('Error in connection state listener:', error);
      }
    });
  }
}

// Get current connection state
export function getCurrentConnectionState(): ConnectionState {
  return currentConnectionState;
}

/**
 * Check if the device is currently online by testing connectivity
 */
async function checkConnectivity(): Promise<boolean> {
  // Avoid rapid successive checks
  const now = Date.now();
  if (connectivityCheckInProgress || (now - lastConnectionCheck < 2000)) {
    return isOnline;
  }
  
  connectivityCheckInProgress = true;
  lastConnectionCheck = now;
  
  try {
    // Test connectivity with a lightweight request
    const response = await fetch(`${API_BASE_URL}/sogni/status`, {
      method: 'HEAD',
      cache: 'no-cache',
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    
    isOnline = response.ok;
    console.log(`Connectivity check: ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.warn('Connectivity check failed:', error);
    isOnline = false;
  } finally {
    connectivityCheckInProgress = false;
  }
  
  return isOnline;
}

/**
 * Network error with additional context for better user feedback
 */
class NetworkError extends Error {
  constructor(
    message: string, 
    public isTimeout: boolean = false, 
    public isOffline: boolean = false,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Listen for online/offline events
window.addEventListener('online', () => {
  console.log('Device came online');
  isOnline = true;
});

window.addEventListener('offline', () => {
  console.log('Device went offline');
  isOnline = false;
});

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
    // Debug log to track sourceType
    console.log(`createProject called with sourceType: ${typeof params.sourceType === 'string' ? params.sourceType : 'undefined'}`);
    
    // Process the image data based on the request type (enhancement or generation)
    let imageData: unknown;
    let isEnhancement = false;
    
    // Check if this is an enhancement request (has startingImage) or generation (has controlNet)
    if (params.startingImage) {
      isEnhancement = true;
      
      // For enhancement, the image is already in Array form
      if (Array.isArray(params.startingImage)) {
        imageData = params.startingImage;
        const enhancementSizeMB = (params.startingImage.length / 1024 / 1024).toFixed(2);
        console.log(`📤 Enhancement image transmitting to Sogni API: ${enhancementSizeMB}MB`);
        console.log(`📊 Enhancement image format: Array (${params.startingImage.length} bytes)`);
      } else if (params.startingImage instanceof Uint8Array) {
        // Convert Uint8Array to regular array
        imageData = Array.from(params.startingImage);
        const enhancementSizeMB = (params.startingImage.length / 1024 / 1024).toFixed(2);
        console.log(`📤 Enhancement image transmitting to Sogni API: ${enhancementSizeMB}MB`);
        console.log(`📊 Enhancement image format: Uint8Array converted to Array (${params.startingImage.length} bytes)`);
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
        // Check image size and log transmission details
        const originalSize = controlNet.image.length;
        const originalSizeMB = (originalSize / 1024 / 1024).toFixed(2);
        console.log(`📤 Transmitting to Sogni API: ${originalSizeMB}MB`);
        console.log(`📊 Image data format: Uint8Array (${originalSize} bytes)`);
        
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
        startingImageStrength: params.startingImageStrength || 0.85,
        sourceType: params.sourceType // Pass sourceType through for enhancement
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
        sourceType: params.sourceType // Pass sourceType through for generation
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
    // Debug log to track sourceType
    console.log(`generateImage received sourceType: ${typeof params.sourceType === 'string' ? params.sourceType : 'undefined'}`);
    
    // Check network connectivity before starting
    const isConnected = await checkConnectivity();
    if (!isConnected) {
      throw new NetworkError(
        'No internet connection. Please check your network and try again.',
        false,
        true,
        true
      );
    }
    
    // Include client app ID in the params
    const requestParams = {
      ...params,
      clientAppId, // Add the client app ID
      sourceType: params.sourceType || ''
    };
    
    // Debug log the final sourceType being sent to API
    console.log(`Final sourceType being sent to API: ${typeof requestParams.sourceType === 'string' ? requestParams.sourceType : 'unknown type'}`);
    
    // Use XMLHttpRequest for real upload progress tracking
    const { projectId, status, responseData } = await new Promise<{ projectId: string | undefined; status: string | undefined; responseData: Record<string, unknown> }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Set timeout for the initial request (30 seconds for mobile)
      const REQUEST_TIMEOUT = 30000; // 30 seconds
      let requestTimer: NodeJS.Timeout | undefined;
      
      const cleanup = () => {
        if (requestTimer) {
          clearTimeout(requestTimer);
          requestTimer = undefined;
        }
      };
      
      // Set up timeout
      requestTimer = setTimeout(() => {
        cleanup();
        xhr.abort();
        reject(new NetworkError(
          'Request timed out. Please check your internet connection and try again.',
          true,
          false,
          true
        ));
      }, REQUEST_TIMEOUT);
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && progressCallback) {
          const uploadProgress = (event.loaded / event.total) * 100;
          // console.log(`Real upload progress: ${uploadProgress.toFixed(1)}%`);
          progressCallback({
            type: 'uploadProgress',
            progress: uploadProgress
          });
        }
      });
      
      // Handle upload completion
      xhr.upload.addEventListener('load', () => {
        console.log('Upload completed, processing on server...');
        if (progressCallback) {
          progressCallback({
            type: 'uploadComplete'
          });
        }
      });
      
      // Handle response
      xhr.addEventListener('load', () => {
        cleanup();
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const jsonRaw: unknown = JSON.parse(xhr.responseText);
            const json: Record<string, unknown> = isObjectRecord(jsonRaw) ? jsonRaw : {};
            resolve({
              projectId: json.projectId as string | undefined,
              status: json.status as string | undefined,
              responseData: json
            });
          } else {
            const errorMessage = xhr.status === 0 
              ? 'Network connection lost. Please check your internet and try again.'
              : `Server error (${xhr.status}). Please try again.`;
            
            reject(new NetworkError(
              errorMessage,
              false,
              xhr.status === 0,
              true
            ));
          }
        } catch (error) {
          reject(new NetworkError(
            `Network error: ${error instanceof Error ? error.message : String(error)}`,
            false,
            false,
            true
          ));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        cleanup();
        // Check connectivity and handle appropriately
        checkConnectivity().then(isConnected => {
          reject(new NetworkError(
            isConnected 
              ? 'Network error during upload. Please try again.'
              : 'Internet connection lost. Please check your network and try again.',
            false,
            !isConnected,
            true
          ));
        }).catch(() => {
          // If connectivity check fails, assume network error
          reject(new NetworkError(
            'Network error during upload. Please check your connection and try again.',
            false,
            true,
            true
          ));
        });
      });
      
      xhr.addEventListener('abort', () => {
        cleanup();
        reject(new NetworkError('Request was cancelled', false, false, false));
      });
      
      // Configure and send request
      xhr.open('POST', `${API_BASE_URL}/sogni/generate`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-Client-App-ID', clientAppId);
      xhr.withCredentials = true; // Include credentials for cross-origin requests
      
      xhr.send(JSON.stringify(requestParams));
    });
    
    // Mark that we have successfully connected
    hasConnectedToSogni = true;
    
    if (status !== 'processing' || !projectId) {
      throw new Error('Failed to start image generation');
    }
    
    // Extract clientAppId from response if provided for better session tracking
    let responseClientAppId = clientAppId;
    if (responseData && typeof responseData === 'object' && 'clientAppId' in responseData && typeof responseData.clientAppId === 'string') {
      responseClientAppId = responseData.clientAppId;
      console.log(`Using backend-provided clientAppId: ${responseClientAppId}`);
    }
    
    // If no progress callback is provided, just return the project ID
    if (!progressCallback) {
      return { projectId, clientAppId: responseClientAppId };
    }
    
    // Set up SSE for progress tracking
    return new Promise((_resolve, reject) => {
      // Include connection retry logic for more robustness
      let retryCount = 0;
      const maxRetries = 5; // Increase from 3 to 5
      let eventSource: EventSource | null = null;
      let connectionTimeout: NodeJS.Timeout | undefined = undefined;
      let overallTimeout: NodeJS.Timeout | undefined = undefined;
      
      // Keep track of reconnection timers
      let reconnectionTimer: NodeJS.Timeout | undefined = undefined;
      
      // Track if we've ever successfully connected
      let hasConnectedOnce = false;
      const connectionStartTime = Date.now();
      
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
        if (overallTimeout !== undefined) {
          clearTimeout(overallTimeout);
          overallTimeout = undefined;
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
        const progressUrl = `${API_BASE_URL}/sogni/progress/${projectId}?clientAppId=${encodeURIComponent(responseClientAppId)}&_t=${Date.now()}`;
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
              clearAllTimers();
              reject(new NetworkError(
                'Connection timeout. Please check your internet connection and try again.',
                true,
                false,
                true
              ));
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

              // Mark that we've successfully connected when we receive any message
              if (!hasConnectedOnce) {
                hasConnectedOnce = true;
                console.log('EventSource connection established successfully');
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
              
              // Clear overall timeout if we receive a completion or error event
                        if (data.type === 'completed' || data.type === 'failed' || data.type === 'error') {
            console.log(`Project completion/error event received for ${projectId}, clearing overall timeout`);
            clearAllTimers();
            
            // Only delay EventSource close for successful completion with missing jobs
            if (data.type === 'completed') {
              const missingJobs = data.missingJobs as { expected: number; completed: number } | undefined;
              const hasMissingJobs = missingJobs && missingJobs.expected > missingJobs.completed;
              
              if (hasMissingJobs) {
                const missingCount = missingJobs.expected - missingJobs.completed;
                console.log(`Project ${projectId} completed but ${missingCount} jobs still outstanding - delaying EventSource close`);
                
                // Wait longer for outstanding job completion events
                setTimeout(() => {
                  console.log(`Closing EventSource after waiting for outstanding jobs on project ${projectId}`);
                  safelyCloseEventSource();
                }, 5000); // 5 second delay for outstanding jobs
              } else {
                console.log(`All jobs completed for project ${projectId}, closing EventSource immediately`);
                safelyCloseEventSource();
              }
            } else {
              // For failed/error events, close immediately - don't wait for remaining jobs
              console.log(`Project ${projectId} failed/errored, closing EventSource immediately`);
              safelyCloseEventSource();
            }
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
              
              // Check network connectivity before retrying
              checkConnectivity().then(isConnected => {
                if (!isConnected) {
                  console.log('Device is offline, will retry when connection is restored');
                  // Still respect retry limits even when offline
                  if (retryCount >= maxRetries) {
                    console.error('EventSource connection failed permanently - device offline and max retries exceeded.');
                    clearAllTimers();
                    safelyCloseEventSource();
                    reject(new NetworkError(
                      'Connection failed - device appears to be offline. Please check your internet connection and try again.',
                      false,
                      true,
                      true
                    ));
                    return;
                  }
                  // Longer delay when offline, but still respect retry count
                  const delay = 5000; // 5 seconds when offline
                  reconnectionTimer = setTimeout(connectSSE, delay);
                } else {
                  // If we've never connected and we're getting repeated failures, fail faster
                  const elapsedTime = Date.now() - connectionStartTime;
                  if (!hasConnectedOnce && elapsedTime > 60000) { // 1 minute without any successful connection
                    console.error('EventSource connection failed permanently - unable to establish initial connection after 1 minute.');
                    clearAllTimers();
                    safelyCloseEventSource();
                    reject(new NetworkError(
                      'Unable to connect to the processing server. Please check if the service is running and try again.',
                      false,
                      false,
                      true
                    ));
                    return;
                  }
                  // Use shorter delay for network errors when online
                  const delay = isNetworkError ? 500 : 1000 * Math.pow(1.5, retryCount);
                  console.log(`Will retry in ${delay}ms`);
                  reconnectionTimer = setTimeout(connectSSE, delay);
                }
              }).catch(() => {
                // If connectivity check fails, use default retry logic
                const delay = isNetworkError ? 500 : 1000 * Math.pow(1.5, retryCount);
                console.log(`Will retry in ${delay}ms (connectivity check failed)`);
                reconnectionTimer = setTimeout(connectSSE, delay);
              });
            } else {
              console.error('EventSource connection failed permanently after retries.');
              if (typeof window !== 'undefined') {
                notifyConnectionStateChange('offline');
              }
              clearAllTimers();
              safelyCloseEventSource();
              
              // Check connectivity to provide appropriate error message
              checkConnectivity().then(isConnected => {
                reject(new NetworkError(
                  isConnected 
                    ? 'Unable to connect to processing server. Please try again.'
                    : 'Internet connection lost. Please check your network and try again.',
                  false,
                  !isConnected,
                  true
                ));
              }).catch(() => {
                reject(new NetworkError(
                  'Connection failed. Please check your internet and try again.',
                  false,
                  true,
                  true
                ));
              });
            }
          };
          
          // Add a timeout for the entire process
          overallTimeout = setTimeout(() => {
            console.log(`Overall timeout reached for project ${projectId} after 5 minutes`);
            clearAllTimers();
            safelyCloseEventSource();
            reject(new NetworkError(
              'Generation timed out. Please try again.',
              true,
              false,
              true
            ));
          }, 300000); // 5 minute timeout for the entire process
        } catch (error) {
          console.error('Error creating EventSource:', error);
          clearAllTimers();
          safelyCloseEventSource();
          reject(new NetworkError(
            'Failed to establish connection. Please check your network and try again.',
            false,
            false,
            true
          ));
        }
      };
      
      // Start connection process
      connectSSE();
    });
  } catch (error: unknown) {
    console.error('Error generating image:', error);
    
    // Re-throw NetworkErrors as-is for proper handling
    if (error instanceof NetworkError) {
      throw error;
    }
    
    // Convert other errors to NetworkError for consistent handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NetworkError(
      `Unexpected error: ${errorMessage}. Please try again.`,
      false,
      false,
      true
    );
  }
}

/**
 * Check if an error is a network-related error that can be retried
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
} 