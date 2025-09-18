// API Service for Sogni Photobooth Integration
class PhotoboothAPI {
  constructor() {
    this.productionApiUrl = 'https://photobooth-api.sogni.ai'; // Production API domain
    this.localApiUrl = 'https://photobooth-api-local.sogni.ai'; // Local development API
    this.apiBaseUrl = this.productionApiUrl; // Default to production
    this.sessionId = null;
    this.clientAppId = null; // Will be set from background script's stable ID
    this.clientAppIdReady = this.initializeClientAppId();
    this.isDevMode = false;
  }

  // Get the stable client app ID from background script
  async initializeClientAppId() {
    try {
      // Get the stable client app ID from chrome storage (same as background script)
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['sogni_extension_app_id'], resolve);
      });
      
      if (result.sogni_extension_app_id) {
        this.clientAppId = result.sogni_extension_app_id;
        console.log('API Service: Using stable client app ID:', this.clientAppId);
      } else {
        // Fallback: create and store a new stable ID
        this.clientAppId = `photobooth-extension-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        chrome.storage.local.set({ 'sogni_extension_app_id': this.clientAppId });
        console.log('API Service: Created new stable client app ID:', this.clientAppId);
      }
    } catch (error) {
      console.error('API Service: Failed to get stable client app ID, using fallback:', error);
      this.clientAppId = `browser-extension-fallback-${Date.now()}`;
    }
  }

  // Detect API endpoint based on dev mode
  async detectApiEndpoint() {
    // Check dev mode from storage
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['devMode'], resolve);
      });
      this.isDevMode = result.devMode || false;
    } catch (error) {
      console.log('Could not read dev mode setting, defaulting to production');
      this.isDevMode = false;
    }

    if (this.isDevMode) {
      // Try local API first in dev mode
      try {
        const response = await fetch(`${this.localApiUrl}/api/health`, {
          method: 'GET',
          timeout: 3000
        });
        if (response.ok) {
          console.log('Using local development API:', this.localApiUrl);
          this.apiBaseUrl = this.localApiUrl;
          return this.localApiUrl;
        }
      } catch (error) {
        console.error('❌ LOCAL API NOT AVAILABLE - NOT FALLING BACK TO PRODUCTION');
        console.error('Please ensure your local API server is running at:', this.localApiUrl);
        throw new Error('Local development API server not available');
      }
    }

    // Use production API only if not in dev mode
    console.log('Using production API:', this.productionApiUrl);
    this.apiBaseUrl = this.productionApiUrl;
    return this.productionApiUrl;
  }

  // Initialize session
  async initializeSession() {
    try {
      const endpoint = await this.detectApiEndpoint();
      this.apiBaseUrl = endpoint;
      
      // Generate session ID
      this.sessionId = `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`Initialized session: ${this.sessionId}`);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize session:', error);
      return false;
    }
  }

  // Upload image to the hosting service
  async uploadImage(imageBlob, filename = null) {
    // Ensure client app ID is initialized
    await this.clientAppIdReady;
    
    if (!filename) {
      const timestamp = Date.now();
      const extension = imageBlob.type.includes('png') ? '.png' : '.jpg';
      filename = `extension-upload-${timestamp}${extension}`;
    }

    const formData = new FormData();
    formData.append('image', imageBlob, filename);

    console.log(`Uploading image: ${filename}, size: ${imageBlob.size} bytes`);

    const response = await fetch(`${this.apiBaseUrl}/api/images/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Session-ID': this.sessionId,
        'X-Client-App-ID': this.clientAppId
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Image uploaded successfully:', result);
    return result.imageUrl;
  }

  // Convert image to pirate using the photobooth API
  async convertToPirate(imageUrl, progressCallback = null) {
    // Ensure client app ID is initialized
    await this.clientAppIdReady;
    
    console.log('Converting image to pirate:', imageUrl);

    // First, fetch the image and convert to the format expected by the API
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    
    // Convert blob to array buffer for the API
    const arrayBuffer = await imageBlob.arrayBuffer();
    const imageData = Array.from(new Uint8Array(arrayBuffer));

    // Prepare the generation parameters
    const params = {
      selectedModel: 'flux1-schnell-fp8', // Fast model for browser extension
      stylePrompt: 'Attractive, friendly storybook pirate portrait, watercolor-ink blend, weathered treasure map frame, parrot sidekick.',
      positivePrompt: '',
      negativePrompt: 'lowres, worst quality, low quality',
      width: 768,
      height: 768,
      promptGuidance: 2,
      numberImages: 1,
      controlNetStrength: 0.7,
      controlNetGuidanceEnd: 0.6,
      imageData: imageData,
      clientAppId: this.clientAppId,
      sourceType: 'upload',
      outputFormat: 'jpg',
      sensitiveContentFilter: false
    };

    console.log('Sending generation request with params:', {
      ...params,
      imageData: `[${imageData.length} bytes]`
    });

    // Make the generation request
    const response = await fetch(`${this.apiBaseUrl}/api/sogni/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': this.sessionId,
        'X-Client-App-ID': this.clientAppId
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Generation failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const data = JSON.parse(line);
            console.log('Received streaming data:', data);

            if (progressCallback) {
              progressCallback(data);
            }

            // Check for completion
            if (data.status === 'completed' && data.images && data.images.length > 0) {
              finalResult = data.images[0]; // Take first image
              console.log('Generation completed, final image:', finalResult);
            }
          } catch (parseError) {
            console.warn('Failed to parse streaming line:', line, parseError);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!finalResult) {
      throw new Error('No final result received from generation');
    }

    return finalResult;
  }

  // Convert AVIF to JPEG if needed
  async convertAvifToJpegIfNeeded(imageBlob) {
    // Check if the image is AVIF format
    if (!imageBlob.type.includes('avif')) {
      return imageBlob; // Not AVIF, return as-is
    }

    console.log('Converting AVIF image to JPEG...');
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Draw the AVIF image to canvas
        ctx.drawImage(img, 0, 0);

        // Convert to JPEG blob
        canvas.toBlob((jpegBlob) => {
          if (jpegBlob) {
            console.log(`AVIF converted to JPEG: ${imageBlob.size} bytes -> ${jpegBlob.size} bytes`);
            resolve(jpegBlob);
          } else {
            reject(new Error('Failed to convert AVIF to JPEG'));
          }
        }, 'image/jpeg', 0.9); // 90% quality JPEG
      };

      img.onerror = () => {
        reject(new Error('Failed to load AVIF image for conversion'));
      };

      img.src = URL.createObjectURL(imageBlob);
    });
  }

  // Resize image if it's too large
  async resizeImageIfNeeded(imageBlob, maxSize = 1080) {
    return new Promise((resolve) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        let { width, height } = img;

        // Check if resize is needed
        if (width <= maxSize && height <= maxSize) {
          resolve(imageBlob);
          return;
        }

        // Calculate new dimensions maintaining aspect ratio
        if (width > height) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and resize
        ctx.drawImage(img, 0, 0, width, height);

        // Always output as JPEG for consistency
        canvas.toBlob((resizedBlob) => {
          resolve(resizedBlob);
        }, 'image/jpeg', 0.9);
      };

      img.src = URL.createObjectURL(imageBlob);
    });
  }

  // Health check
  async checkHealth() {
    try {
      const endpoint = await this.detectApiEndpoint();
      const response = await fetch(`${endpoint}/api/health`);
      
      if (response.ok) {
        const data = await response.json();
        return { connected: true, endpoint, data };
      } else {
        return { connected: false, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhotoboothAPI;
} else {
  window.PhotoboothAPI = PhotoboothAPI;
}
