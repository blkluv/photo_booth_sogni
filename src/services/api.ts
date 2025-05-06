/**
 * API service for communicating with the backend
 */

// Use a relative path instead of absolute URL for flexibility across environments
const API_BASE_URL = '/api';

/**
 * Check Sogni connection status
 */
export async function checkSogniStatus() {
  try {
    console.log('Checking Sogni status...');
    const response = await fetch(`${API_BASE_URL}/sogni/status`, {
      credentials: 'include', // Include credentials for cross-origin requests
      headers: {
        'Accept': 'application/json',
      }
    });
    
    // Handle error responses
    if (!response.ok) {
      // Try to get the error details from the response
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.message || errorData.error || 'Unknown error';
        console.error('Status check failed:', errorData);
      } catch (e) {
        // If we can't parse the JSON, just use the status text
        errorDetails = response.statusText;
        console.error('Error parsing response:', e);
      }
      
      // Throw an error with status code and message
      throw new Error(`${response.status} ${errorDetails}`);
    }
    
    const data = await response.json();
    console.log('Sogni status check successful:', data);
    return data;
  } catch (error) {
    console.error('Error checking Sogni status:', error);
    throw error;
  }
}

/**
 * Create a project directly through the backend service
 * 
 * @param params All the parameters needed to create a Sogni project
 * @param progressCallback Optional callback for progress updates
 * @returns Promise that resolves with the complete project data
 */
export async function createProject(params: any, progressCallback?: (data: any) => void): Promise<any> {
  try {
    // Process the image data based on the request type (enhancement or generation)
    let imageData;
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
    else if (params.controlNet && params.controlNet.image) {
      if (params.controlNet.image instanceof Uint8Array) {
        // Check image size and compress if needed
        const originalSize = params.controlNet.image.length;
        console.log(`Original image size: ${originalSize / 1024 / 1024} MB`);
        
        // For large images, send chunks or downsize
        if (originalSize > 10 * 1024 * 1024) { // If over 10MB
          console.log('Image is large, optimizing size...');
          
          // Option 1: Just use the array directly without Array.from
          // This is more memory efficient
          imageData = [...params.controlNet.image]; 
          
          // Log the compressed size
          console.log(`Optimized image size: ${imageData.length / 1024 / 1024} MB`);
        } else {
          // For smaller images, use standard approach
          imageData = Array.from(params.controlNet.image);
        }
      } else if (Array.isArray(params.controlNet.image)) {
        // Already in array form
        imageData = params.controlNet.image;
      } else {
        throw new Error('ControlNet requires image as Array or Uint8Array');
      }
    } else {
      throw new Error('Invalid image data format - missing controlNet.image or startingImage');
    }
    
    // Format the parameters for the backend based on request type
    let projectParams;
    
    if (isEnhancement) {
      // Enhancement parameters
      projectParams = {
        selectedModel: params.modelId,
        stylePrompt: params.positivePrompt,
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfImages,
        startingImage: imageData,
        startingImageStrength: params.startingImageStrength || 0.85
      };
    } else {
      // Generation parameters with controlNet
      projectParams = {
        selectedModel: params.modelId,
        stylePrompt: params.positivePrompt,
        width: params.width,
        height: params.height,
        promptGuidance: params.guidance,
        numberImages: params.numberOfImages,
        controlNetStrength: params.controlNet.strength,
        controlNetGuidanceEnd: params.controlNet.guidanceEnd,
        imageData
      };
    }
    
    return generateImage(projectParams, progressCallback);
  } catch (error) {
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
export async function cancelProject(projectId: string): Promise<any> {
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
    
    const result = await response.json();
    console.log('Project cancellation result:', result);
    return result;
  } catch (error) {
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
export async function generateImage(params: any, progressCallback?: (progress: any) => void): Promise<any> {
  try {
    // Start the generation process
    const response = await fetch(`${API_BASE_URL}/sogni/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include', // Include credentials for cross-origin requests
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const { projectId, status } = await response.json();
    
    if (status !== 'processing' || !projectId) {
      throw new Error('Failed to start image generation');
    }
    
    // If no progress callback is provided, just return the project ID
    if (!progressCallback) {
      return { projectId };
    }
    
    // Set up SSE for progress tracking
    return new Promise((resolve, reject) => {
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
      
      const connectSSE = () => {
        // Clean up any existing connection first
        clearAllTimers();
        safelyCloseEventSource();
        
        console.log(`Connecting to progress stream for project ${projectId}... (attempt ${retryCount + 1})`);
        
        // Create the EventSource with the with-credentials flag for CORS
        try {
          eventSource = new EventSource(`${API_BASE_URL}/sogni/progress/${projectId}`, { 
            withCredentials: true 
          });
          
          // Set a connection timeout
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
          }, 15000); // Increased from 10s to 15s timeout for slower connections
          
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
              const data = JSON.parse(event.data);
              // Add more detailed logging for message types
              console.log(`SSE message received: Type=${data.type}, ProjectID=${data.projectId || 'N/A'}`);
              
              // For any message type, extend the connection timeout as we're getting data
              if (connectionTimeout !== undefined) {
                clearTimeout(connectionTimeout);
                connectionTimeout = undefined;
              }
              
              // Handle all Sogni event types
              switch (data.type) {
                case 'connected':
                  // Connection confirmation
                  console.log('SSE confirmed connection for project:', data.projectId);
                  break;
                  
                case 'project-progress':
                  // Handle project-level progress
                  if (progressCallback) {
                    console.log('Project level progress update:', data.progress);
                    // Forward the progress only if it's a valid number
                    if (data.progress !== null && data.progress !== undefined && typeof data.progress === 'number') {
                      progressCallback(data.progress); 
                    }
                  }
                  break;
                  
                case 'progress':
                  // Handle job-level progress updates - always forward these to callbacks 
                  if (progressCallback) {
                    const eventWithWorker = {
                      ...data,
                      progress: data.progress !== undefined && typeof data.progress === 'number' 
                        ? data.progress 
                        : undefined
                    };
                    
                    console.log('Job progress from server:', data.jobId, data.progress, data.workerName || 'unknown');
                    progressCallback(eventWithWorker);
                  }
                  break;
                  
                case 'jobCompleted':
                  // Handle job completion event
                  console.log('Job completed via SSE:', data);
                  if (progressCallback) {
                    // Pass the full job completion data to the callback
                    progressCallback(data); 
                  }
                  break;
                  
                case 'jobFailed':
                  // Handle job failure event
                  console.log('Job failed via SSE:', data);
                  if (progressCallback) {
                    // Pass the full job failure data to the callback
                    progressCallback(data);
                  }
                  break;
                  
                case 'complete':
                  // Handle overall project completion (all jobs finished)
                  console.log('Generation complete via SSE, closing EventSource');
                  if (connectionTimeout !== undefined) {
                    clearTimeout(connectionTimeout);
                    connectionTimeout = undefined;
                  }
                  if (eventSource) {
                    eventSource.close();
                  }
                  resolve(data.result);
                  break;
                  
                case 'error':
                  // Clean up and reject with the error
                  console.error('Error message from SSE:', data.error);
                  if (connectionTimeout !== undefined) {
                    clearTimeout(connectionTimeout);
                    connectionTimeout = undefined;
                  }
                  if (eventSource) {
                    eventSource.close();
                  }
                  reject(new Error(data.error || 'Unknown server error'));
                  break;
                  
                default:
                  // Log unknown events but don't stop processing
                  console.warn('Received unknown SSE message type:', data.type);
                  break;
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
                (err.target as any)?.readyState === EventSource.CLOSED;
              
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
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
} 