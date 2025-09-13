// Background script for Sogni Photobooth Extension
console.log('Sogni Photobooth Extension: Background script loaded');

// Generate a stable client app ID for the extension (like main photobooth frontend)
let extensionClientAppId = `photobooth-extension-fallback-${Date.now()}`;
let resolveClientIdReady = null;
const clientIdReady = new Promise((resolve) => { resolveClientIdReady = resolve; });
const DEFAULT_API_BASE_URL = 'https://photobooth-api.sogni.ai';

// Initialize client app ID using chrome.storage.local (async)
chrome.storage.local.get(['sogni_extension_app_id'], (result) => {
  if (result.sogni_extension_app_id) {
    extensionClientAppId = result.sogni_extension_app_id;
  } else {
    extensionClientAppId = `photobooth-extension-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    chrome.storage.local.set({ 'sogni_extension_app_id': extensionClientAppId });
  }
  
  console.log('Extension client app ID initialized (single shared ID like main frontend):', extensionClientAppId);
  
  try { if (resolveClientIdReady) resolveClientIdReady(); } catch (e) {}
  
  // Use client-based SSE connection like main photobooth frontend
  try {
    sseManager.connect(DEFAULT_API_BASE_URL);
  } catch (e) {
    console.warn('Background: initial SSE connect failed, will retry on demand', e);
  }
});

// Shared SSE Connection Manager for multiple concurrent projects
class SSEConnectionManager {
  constructor() {
    this.eventSource = null;
    this.activeProjects = new Map(); // projectId -> { resolve, reject, imageUrl }
    this.isConnected = false;
    this.isConnecting = false;
    this.apiBaseUrl = null;
    this.pendingEvents = new Map(); // projectId -> [events]
    this.reconnectTimer = null;
    this.backoffMs = 1000;
    this.maxBackoffMs = 10000;
    this.openWaiters = [];
  }

  // Connect to client-based SSE stream (one connection for all projects from same client)
  connect(apiBaseUrl) {
    if (this.eventSource || this.isConnecting || this.isConnected) {
      console.log('Background: SSE connect called but connection exists or is in progress');
      return;
    }

    this.apiBaseUrl = apiBaseUrl;
    // Use session-based SSE for browser extension (handles multiple projects with different routing)
    const progressUrl = `${apiBaseUrl}/api/sogni/progress/session?_t=${Date.now()}`;
    console.log('Background: Connecting to SESSION SSE stream (multiple projects, shared SDK):', progressUrl);

    this.isConnecting = true;
    this.eventSource = new EventSource(progressUrl, { withCredentials: true });

    this.eventSource.onopen = () => {
      console.log('Background: Shared SESSION SSE connection established');
      this.isConnected = true;
      this.isConnecting = false;
      // reset backoff on successful open
      this.backoffMs = 1000;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      // resolve any waiters
      if (this.openWaiters.length) {
        const waiters = this.openWaiters.slice();
        this.openWaiters = [];
        waiters.forEach((fn) => { try { fn(); } catch (e) {} });
      }
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`Background: [CONCURRENT-DEBUG] SSE message received:`, {
          type: data.type,
          projectId: data.projectId,
          jobId: data.jobId,
          activeProjects: Array.from(this.activeProjects.keys()),
          pendingProjects: Array.from(this.pendingEvents.keys())
        });
        
        // Route event to correct project
        if (data.projectId) {
          if (this.activeProjects.has(data.projectId)) {
            this.handleProjectEvent(data.projectId, data);
          } else {
            // Buffer events until the project is tracked
            if (!this.pendingEvents.has(data.projectId)) {
              this.pendingEvents.set(data.projectId, []);
            }
            this.pendingEvents.get(data.projectId).push(data);
            console.log('Background: [CONCURRENT-DEBUG] Buffering SSE for untracked project', {
              projectId: data.projectId,
              type: data.type,
              bufferedCount: this.pendingEvents.get(data.projectId).length,
              activeProjectKeys: Array.from(this.activeProjects.keys()),
              totalActiveProjects: this.activeProjects.size
            });
          }
        } else {
          console.warn('Background: SSE message missing projectId, ignoring', data);
        }
      } catch (error) {
        console.error('Background: Error parsing SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('Background: SESSION SSE connection error:', error);
      this.isConnected = false;
      this.isConnecting = false;
      // Clean up and schedule reconnect with backoff
      this.cleanupEventSource();
      this.scheduleReconnect();
    };
  }

  // Wait until connection is open or timeout
  waitForOpen(timeoutMs = 2000) {
    if (this.isConnected) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // timeout, resolve anyway; server will buffer and flush pending
        resolve();
      }, timeoutMs);
      this.openWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // Ensure there is an active connection (attempt if not connected)
  ensureConnected(apiBaseUrl) {
    if (!this.isConnected && !this.isConnecting) {
      console.log('Background: Ensuring SSE connection...');
      this.connect(apiBaseUrl || this.apiBaseUrl || DEFAULT_API_BASE_URL);
    }
  }

  // Close and null current EventSource safely
  cleanupEventSource() {
    try {
      if (this.eventSource) {
        this.eventSource.close();
      }
    } catch (e) {}
    this.eventSource = null;
  }

  // Exponential backoff reconnect
  scheduleReconnect() {
    if (this.reconnectTimer || this.isConnecting || this.isConnected) return;
    const delay = Math.min(this.backoffMs, this.maxBackoffMs);
    console.log(`Background: Scheduling SSE reconnect in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.apiBaseUrl || DEFAULT_API_BASE_URL);
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    }, delay);
  }

  // Register a project for tracking
  trackProject(projectId, imageUrl, resolve, reject) {
    console.log('Background: [CONCURRENT-DEBUG] Tracking new project', {
      projectId,
      imageUrl,
      totalActive: this.activeProjects.size + 1,
      allActiveProjects: [...Array.from(this.activeProjects.keys()), projectId]
    });
    this.activeProjects.set(projectId, { resolve, reject, imageUrl, isResolved: false });
    // Flush any buffered events for this project in arrival order
    if (this.pendingEvents.has(projectId)) {
      const events = this.pendingEvents.get(projectId);
      this.pendingEvents.delete(projectId);
      console.log('Background: Flushing buffered events', { projectId, count: events.length });
      for (const evt of events) {
        this.handleProjectEvent(projectId, evt);
      }
    }
  }

  // Wait for project completion and return result
  waitForProjectCompletion(projectId, imageUrl) {
    return new Promise((resolve, reject) => {
      this.trackProject(projectId, imageUrl, (result) => {
        resolve({ imageUrl: result.pirateImageUrl || result.imageUrl });
      }, reject);
      
      // Set up timeout for the entire process (2 minutes)
      setTimeout(() => {
        console.error(`Background: ⏰ Conversion timeout reached for project ${projectId}`);
        this.activeProjects.delete(projectId);
        reject(new Error('Conversion timeout (2 minutes)'));
      }, 120000);
    });
  }

  // Handle events for a specific project
  handleProjectEvent(projectId, data) {
    const project = this.activeProjects.get(projectId);
    if (!project) return;

    const { resolve, reject, imageUrl } = project;

    console.log('Background: [CONCURRENT-DEBUG] Routing event to project', {
      projectId,
      type: data.type,
      imageUrl,
      activeCount: this.activeProjects.size,
      allActiveProjects: Array.from(this.activeProjects.keys())
    });

    switch (data.type) {
      case 'connected':
      case 'queued':
        console.log(`Background: Project ${projectId} ${data.type.toUpperCase()} for image: ${imageUrl}`);
        break;

      case 'started':
        console.log(`Background: Project ${projectId} STARTED for image: ${imageUrl}`);
        break;

      case 'progress':
        const progressPercent = Math.round(data.progress * 100);
        console.log(`Background: Project ${projectId} progress: ${progressPercent}% for image: ${imageUrl}`);
        
        // Send progress to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateProgress',
              imageUrl: imageUrl,
              progress: data.progress,
              step: data.step,
              stepCount: data.stepCount
            });
          }
        });
        break;

      case 'jobCompleted':
        console.log(`Background: ✅ Job completed! Final result: ${data.resultUrl} for image: ${imageUrl}`);
        // Resolve once, but keep tracking until 'completed' to avoid buffering late events
        if (!project.isResolved) {
          project.isResolved = true;
          resolve({
            pirateImageUrl: data.resultUrl,
            originalUrl: imageUrl
          });
        }
        break;

      case 'completed':
        console.log(`Background: Project ${projectId} completed for image: ${imageUrl}`);
        // Now it is safe to stop tracking this project
        this.activeProjects.delete(projectId);
        break;

      case 'failed':
      case 'error':
        console.error(`Background: Project ${projectId} failed:`, data.error || data.message);
        // Stop tracking on error
        this.activeProjects.delete(projectId);
        if (!project.isResolved) {
          reject(new Error(data.error || data.message || 'Generation failed'));
        }
        break;
    }
  }

  // Clean up connection
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.isConnecting = false;
    }
    this.activeProjects.clear();
  }
}

// Global SSE connection manager instance
const sseManager = new SSEConnectionManager();


// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sogni Photobooth Extension: Creating context menu');
  
  chrome.contextMenus.create({
    id: "convert-single-image",
    title: "Convert to Pirate",
    contexts: ["image"]
  });
  
  chrome.contextMenus.create({
    id: "scan-page-for-profiles",
    title: "Scan Page for Profile Photos",
    contexts: ["page"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('Context menu clicked:', info.menuItemId);
  
  if (info.menuItemId === "convert-single-image") {
    // Convert single image
    chrome.tabs.sendMessage(tab.id, {
      action: "convertSingleImage",
      imageUrl: info.srcUrl
    });
  } else if (info.menuItemId === "scan-page-for-profiles") {
    // Scan page for profile photos
    chrome.tabs.sendMessage(tab.id, {
      action: "scanPageForProfiles"
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action, 'from:', sender.tab ? 'content script' : 'popup');
  
  if (message.action === "scanPageForProfiles") {
    // Forward to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  } else if (message.action === "getApiStatus") {
    // Check API status
    checkApiStatus().then(status => {
      sendResponse(status);
    });
    return true; // Keep message channel open for async response
  } else if (message.action === "convertImage") {
    // Handle image conversion (avoids CORS issues)
    handleImageConversion(message.imageUrl, message.imageSize)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Image conversion failed in background:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (message.action === "convertImageWithStyle") {
    // Handle image conversion with custom style
    handleImageConversionWithStyle(message.imageUrl, message.imageSize, message.style, message.stylePrompt)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Image conversion with style failed in background:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (message.action === "checkApiHealth") {
    console.log('Background: Handling API health check request');
    // Check API health
    checkApiHealthInBackground()
      .then(result => {
        console.log('Background: API health check completed, sending response:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('API health check failed in background:', error);
        const errorResponse = { connected: false, error: error.message };
        console.log('Background: Sending error response:', errorResponse);
        sendResponse(errorResponse);
      });
    return true; // Keep message channel open for async response
  }
  
  return false;
});

// Check API status (legacy function - keeping for compatibility)
async function checkApiStatus() {
  return await checkApiHealthInBackground();
}

// Check API health in background script
async function checkApiHealthInBackground() {
  try {
    // Use correct local API domain
    const apiBaseUrl = 'https://photobooth-api.sogni.ai';
    console.log('Background: Checking API health at:', apiBaseUrl);
    
    const response = await fetch(`${apiBaseUrl}/api/health`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-Client-App-ID': extensionClientAppId
      },
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Background: API health check successful:', data);
      return { connected: true, endpoint: apiBaseUrl, data };
    } else {
      console.error('Background: API health check failed:', response.status, response.statusText);
      return { connected: false, error: `HTTP ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    console.error('Background: API health check error:', error);
    return { connected: false, error: error.message };
  }
}

// Client app ID is defined at the top of the file

// Handle image conversion with custom style in background
async function handleImageConversionWithStyle(imageUrl, imageSize, styleKey, stylePrompt) {
  console.log('Background: Converting image with style:', styleKey, imageUrl);
  
  // Use the SAME client app ID for all conversions (like main photobooth frontend)
  console.log('Background: Using shared client app ID for this conversion:', extensionClientAppId);
  
  try {
    // Use correct local API domain
    const apiBaseUrl = 'https://photobooth-api.sogni.ai';
    console.log('Background: Using local API domain for image conversion:', apiBaseUrl);

    // Ensure shared SSE is connected (or reconnecting) before/while we generate
    // Wait for stable client ID first to avoid ID mismatch between SSE and generate
    try { await clientIdReady; } catch (e) {}
    sseManager.ensureConnected(apiBaseUrl);
    // Optionally wait briefly for SSE to open; server will buffer if not yet
    await sseManager.waitForOpen(1000);
    
    // Fetch the image (background script can bypass CORS)
    console.log('Background: Fetching image...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBlob = await imageResponse.blob();
    console.log('Background: Image fetched, size:', imageBlob.size);
    
    // Resize if needed (simple check)
    let finalBlob = imageBlob;
    if (imageSize && (imageSize.width > 1080 || imageSize.height > 1080)) {
      // For now, just use original - we can add canvas resizing later if needed
      console.log('Background: Image is large, but using original for now');
    }
    
    // Convert with custom style using image data directly
    console.log(`Background: Starting ${styleKey} conversion with:`, `${apiBaseUrl}/api/sogni/generate`);
    const imageArrayBuffer = await finalBlob.arrayBuffer();
    const imageData = Array.from(new Uint8Array(imageArrayBuffer));

    // Add default preferred workers to style prompt (matching main app behavior)
    const workerPreferences = '--preferred-workers=SPICE.MUST.FLOW';
    const finalStylePrompt = `${stylePrompt} ${workerPreferences}`;

    const generateParams = {
      selectedModel: 'coreml-sogniXLturbo_alpha1_ad', // Sogni.XLT SDXL Turbo
      stylePrompt: finalStylePrompt,
      numberImages: 1,
      outputFormat: 'jpg',
      sensitiveContentFilter: false,
      sourceType: 'extension',
      imageData: imageData,
      // Required dimensions for SDXL models
      sizePreset: 'custom',
      width: 1024,
      height: 1024,
      // SDXL Turbo optimized settings
      promptGuidance: 2.0,
      scheduler: 'DPM++ SDE',
      timeStepSpacing: 'Karras',
      inferenceSteps: 7,
      controlNetStrength: 0.7,
      controlNetGuidanceEnd: 0.6
    };

    console.log(`Background: Sending ${styleKey} generation request...`);
    const generateResponse = await fetch(`${apiBaseUrl}/api/sogni/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App-ID': extensionClientAppId
      },
      body: JSON.stringify(generateParams)
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(`Generate request failed: ${generateResponse.status} ${errorText}`);
    }

    const generateResult = await generateResponse.json();
    console.log(`Background: ${styleKey} generation started:`, generateResult.projectId);

    // Wait for completion via SSE
    const finalResult = await sseManager.waitForProjectCompletion(generateResult.projectId, imageUrl);
    console.log(`Background: ${styleKey} conversion completed:`, finalResult);

    return {
      convertedImageUrl: finalResult.imageUrl,
      projectId: generateResult.projectId,
      styleKey: styleKey
    };

  } catch (error) {
    console.error(`Background: ${styleKey} conversion failed:`, error);
    throw error;
  }
}

// Handle image conversion in background (avoids CORS issues)
async function handleImageConversion(imageUrl, imageSize) {
  console.log('Background: Converting image:', imageUrl);
  
  // Use the SAME client app ID for all conversions (like main photobooth frontend)
  // The server creates one Sogni SDK instance per clientAppId that handles multiple concurrent projects
  console.log('Background: Using shared client app ID for this conversion:', extensionClientAppId);
  
  try {
    // Use correct local API domain
    const apiBaseUrl = 'https://photobooth-api.sogni.ai';
    console.log('Background: Using local API domain for image conversion:', apiBaseUrl);

    // Ensure shared SSE is connected (or reconnecting) before/while we generate
    // Wait for stable client ID first to avoid ID mismatch between SSE and generate
    try { await clientIdReady; } catch (e) {}
    sseManager.ensureConnected(apiBaseUrl);
    // Optionally wait briefly for SSE to open; server will buffer if not yet
    await sseManager.waitForOpen(1000);
    
    // Fetch the image (background script can bypass CORS)
    console.log('Background: Fetching image...');
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBlob = await imageResponse.blob();
    console.log('Background: Image fetched, size:', imageBlob.size);
    
    // Resize if needed (simple check)
    let finalBlob = imageBlob;
    if (imageSize && (imageSize.width > 1080 || imageSize.height > 1080)) {
      // For now, just use original - we can add canvas resizing later if needed
      console.log('Background: Image is large, but using original for now');
    }
    
    // Convert to pirate using image data directly (no upload needed like main app)
    console.log('Background: Starting pirate conversion with:', `${apiBaseUrl}/api/sogni/generate`);
    const imageArrayBuffer = await finalBlob.arrayBuffer();
    const imageData = new Uint8Array(imageArrayBuffer); // Use Uint8Array directly like main app
    
    // Add default preferred workers to positive prompt (matching main app behavior)
    const basePrompt = 'Attractive, friendly storybook pirate portrait, watercolor-ink blend, weathered treasure map frame, parrot sidekick.';
    const workerPreferences = '--preferred-workers=SPICE.MUST.FLOW';
    const finalPositivePrompt = `${basePrompt} ${workerPreferences}`;

    const conversionParams = {
      testnet: false,
      tokenType: 'spark',
      selectedModel: 'coreml-sogniXLturbo_alpha1_ad', // Backend expects selectedModel
      positivePrompt: finalPositivePrompt,
      negativePrompt: 'lowres, worst quality, low quality',
      stylePrompt: '',
      sizePreset: 'custom',
      width: 768,
      height: 768,
      inferenceSteps: 7, // Backend expects inferenceSteps
      promptGuidance: 2, // Backend expects promptGuidance
      numberImages: 1, // Backend expects numberImages
      scheduler: 'DPM++ SDE',
      timeStepSpacing: 'Karras',
      outputFormat: 'jpg',
      sensitiveContentFilter: false,
      sourceType: 'upload', // Use upload instead of enhancement to avoid session conflicts
      imageData: Array.from(imageData), // Backend expects imageData as Array
      controlNetStrength: 0.7,
      controlNetGuidanceEnd: 0.6
    };
    
    // Log params without the raw image data
    const paramsForLogging = { ...conversionParams };
    if (paramsForLogging.imageData) {
      paramsForLogging.imageData = `[${paramsForLogging.imageData.length} bytes]`;
    }
    console.log('Background: Sending conversion params:', JSON.stringify(paramsForLogging, null, 2));
    
    console.log('Background: Sending project request for image:', imageUrl);
    
    // Use the SAME client app ID for all conversions (like main photobooth frontend)
    // The server creates one Sogni SDK instance per clientAppId that handles multiple concurrent projects
    console.log('Background: Using shared client app ID for this conversion:', extensionClientAppId);

    const conversionResponse = await fetch(`${apiBaseUrl}/api/sogni/generate`, {
      method: 'POST',
      credentials: 'include', // Include cookies like the main app
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Client-App-ID': extensionClientAppId,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(conversionParams)
    });
    
    if (!conversionResponse.ok) {
      const errorText = await conversionResponse.text();
      console.error('Background: Conversion request failed:', conversionResponse.status, conversionResponse.statusText, errorText);
      throw new Error(`Conversion failed: ${conversionResponse.status} ${conversionResponse.statusText} - ${errorText}`);
    }
    
    const conversionData = await conversionResponse.json();
    console.log('Background: Conversion started, got projectId:', conversionData.projectId);
    
    // Step 2: Use shared SSE manager for progress updates (connection is established at startup)
    
    const finalResult = await new Promise((resolve, reject) => {
      // Register this project with the shared SSE manager
      sseManager.trackProject(conversionData.projectId, imageUrl, (result) => {
        resolve(result.pirateImageUrl);
      }, reject);
      
      // Set up timeout for the entire process (2 minutes)
      setTimeout(() => {
        console.error(`Background: ⏰ Conversion timeout reached for project ${conversionData.projectId}`);
        sseManager.activeProjects.delete(conversionData.projectId);
        reject(new Error('Conversion timeout (2 minutes)'));
      }, 120000);
    });
    
    console.log('Background: Stream processing complete. Final result:', finalResult);
    
    if (!finalResult) {
      throw new Error('No final result received from conversion');
    }
    
    return {
      pirateImageUrl: finalResult,
      originalUrl: imageUrl
    };
    
  } catch (error) {
    console.error('Background: Image conversion failed:', error);
    throw error;
  }
}

// Handle extension icon click (when popup is not available)
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked, scanning page for profiles');
  chrome.tabs.sendMessage(tab.id, {
    action: "scanPageForProfiles"
  });
});
