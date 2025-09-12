// Content Script for Sogni Photobooth Extension
console.log('Sogni Photobooth Extension: Content script loaded');

// Initialize components
let api = null;
let progressOverlay = null;
let isProcessing = false;
let processingQueue = [];
const MAX_CONCURRENT_CONVERSIONS = 1; // Reduced to 1 to eliminate auth conflicts

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

async function initialize() {
  console.log('Initializing Sogni Photobooth Extension');
  
  try {
    // Check if required classes are available
    if (typeof PhotoboothAPI === 'undefined') {
      console.error('PhotoboothAPI class not found. Retrying in 100ms...');
      setTimeout(initialize, 100);
      return;
    }
    
    if (typeof ProgressOverlay === 'undefined') {
      console.error('ProgressOverlay class not found. Retrying in 100ms...');
      setTimeout(initialize, 100);
      return;
    }
    
    // Initialize API and progress overlay
    api = new PhotoboothAPI();
    progressOverlay = new ProgressOverlay();
    
    // Initialize session
    await api.initializeSession();
    
    // Listen for scroll and resize to update overlay positions
    window.addEventListener('scroll', () => progressOverlay.updatePositions());
    window.addEventListener('resize', () => progressOverlay.updatePositions());
    
    console.log('Extension initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize extension:', error);
    // Retry initialization after a delay
    setTimeout(initialize, 500);
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'scanPageForProfiles') {
    handleScanPageForProfiles()
      .then(result => {
        console.log('Scan completed:', result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Scan failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (message.action === 'convertSingleImage') {
    handleConvertSingleImage(message.imageUrl)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (message.action === 'updateProgress') {
    // Update progress overlay for the specific image
    updateImageProgress(message.imageUrl, message.progress, message.step, message.stepCount);
  }
  
  return false;
});

// Update progress overlay for a specific image
function updateImageProgress(imageUrl, progress, step, stepCount) {
  try {
    // Find the image element by original URL stored in data attribute
    const imageElement = document.querySelector(`img[data-original-url="${imageUrl}"]`);
    if (!imageElement) {
      console.warn('Could not find image element for progress update:', imageUrl);
      return;
    }
    
    // Find progress overlay
    let overlay = imageElement.parentElement?.querySelector('.sogni-progress-overlay');
    if (!overlay) {
      // Try looking in different locations
      overlay = imageElement.nextElementSibling?.classList?.contains('sogni-progress-overlay') ? imageElement.nextElementSibling : null;
      if (!overlay) {
        overlay = document.querySelector('.sogni-progress-overlay'); // Look anywhere on page
      }
      
      if (!overlay) {
        console.warn('Could not find progress overlay for image:', imageUrl);
        return;
      }
    }
    
    // Update progress using the progressOverlay utility
    if (progressOverlay) {
      progressOverlay.updateProgress(imageElement, Math.round(progress * 100), `Step ${step}/${stepCount}`);
    } else {
      // Fallback: update manually
      const progressBar = overlay.querySelector('.sogni-progress-bar');
      const progressText = overlay.querySelector('.sogni-progress-text');
      
      if (progressBar) {
        progressBar.style.width = `${Math.round(progress * 100)}%`;
      }
      
      if (progressText) {
        progressText.textContent = `Step ${step}/${stepCount} (${Math.round(progress * 100)}%)`;
      }
    }
    
    console.log(`Updated progress for image: ${Math.round(progress * 100)}% (${step}/${stepCount})`);
  } catch (error) {
    console.error('Error updating image progress:', error);
  }
}

// Scan page for profile photos
async function handleScanPageForProfiles() {
  console.log('Scanning page for profile photos...');
  
  // Show scan indicator
  const scanIndicator = showScanIndicator('Scanning for profile photos...');
  
  try {
    if (isProcessing) {
      throw new Error('Already processing images. Please wait for current conversion to complete.');
    }
    
    // Check if API is initialized
    if (!api) {
      console.log('API not initialized, initializing now...');
      
      // Check if PhotoboothAPI class is available
      if (typeof PhotoboothAPI === 'undefined') {
        throw new Error('PhotoboothAPI class not available. Extension may not have loaded properly.');
      }
      
      api = new PhotoboothAPI();
      await api.initializeSession();
    }
    
    // Check if progress overlay is initialized
    if (!progressOverlay) {
      console.log('ProgressOverlay not initialized, initializing now...');
      
      if (typeof ProgressOverlay === 'undefined') {
        throw new Error('ProgressOverlay class not available. Extension may not have loaded properly.');
      }
      
      progressOverlay = new ProgressOverlay();
    }
    
    const profileImages = findProfileImages();
    console.log(`Found ${profileImages.length} potential profile images`);
    
    // Update scan indicator
    updateScanIndicator(scanIndicator, `Found ${profileImages.length} images`);
    
    if (profileImages.length < 2) {
      updateScanIndicator(scanIndicator, 'No profile photos found', 'error');
      setTimeout(() => removeScanIndicator(scanIndicator), 3000);
      throw new Error('No profile photos found. This extension looks for speaker/profile photo grids on pages.');
    }
    
    // Highlight detected images briefly
    profileImages.forEach(img => {
      img.classList.add('sogni-detected-image');
      setTimeout(() => img.classList.remove('sogni-detected-image'), 2000);
    });
    
    // Update scan indicator
    updateScanIndicator(scanIndicator, `Converting ${profileImages.length} images to pirates...`, 'success');
    
    // Process all found images
    console.log(`Found ${profileImages.length} images, processing all images`);
    
    // Process images in batches
    await processImagesBatch(profileImages);
    
    // Remove scan indicator after completion
    removeScanIndicator(scanIndicator);
    
    return { 
      success: true, 
      imagesFound: testImages.length,
      message: `Attempted to convert ${testImages.length} images to pirates!`
    };
    
  } catch (error) {
    console.error('Error scanning page:', error);
    updateScanIndicator(scanIndicator, `Error: ${error.message}`, 'error');
    setTimeout(() => removeScanIndicator(scanIndicator), 5000);
    throw error;
  }
}

// Find profile images on the page
function findProfileImages() {
  const profileImages = [];
  
  // Look for containers with "speakers" or "speaker" in class/id
  const speakerContainers = document.querySelectorAll([
    '[class*="speaker" i]',
    '[id*="speaker" i]',
    '[class*="profile" i]',
    '[id*="profile" i]',
    '[class*="team" i]',
    '[id*="team" i]',
    '[class*="member" i]',
    '[id*="member" i]'
  ].join(', '));
  
  console.log(`Found ${speakerContainers.length} potential speaker containers`);
  
  for (const container of speakerContainers) {
    const images = container.querySelectorAll('img');
    console.log(`Container has ${images.length} images`);
    
    for (const img of images) {
      if (isProfileImage(img)) {
        profileImages.push(img);
      }
    }
  }
  
  // If no speaker containers found, look for grid patterns
  if (profileImages.length === 0) {
    console.log('No speaker containers found, looking for image grids...');
    profileImages.push(...findImageGrids());
  }
  
  return profileImages;
}

// Check if an image looks like a profile photo
function isProfileImage(img) {
  // Skip if image is too small or too large
  const rect = img.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return false;
  if (rect.width > 800 || rect.height > 800) return false;
  
  // Skip if image is not visible
  if (rect.width === 0 || rect.height === 0) return false;
  
  // Skip if image is hidden
  const style = window.getComputedStyle(img);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  // Check aspect ratio (profile photos are usually square-ish)
  const aspectRatio = rect.width / rect.height;
  if (aspectRatio < 0.5 || aspectRatio > 2) return false;
  
  // Check if image source looks like a profile photo
  const src = img.src.toLowerCase();
  if (src.includes('logo') || src.includes('icon') || src.includes('banner')) {
    return false;
  }
  
  // Check alt text
  const alt = img.alt.toLowerCase();
  if (alt.includes('logo') || alt.includes('icon') || alt.includes('banner')) {
    return false;
  }
  
  return true;
}

// Find image grids (fallback method)
function findImageGrids() {
  const gridImages = [];
  const allImages = document.querySelectorAll('img');
  
  // Group images by similar size and position
  const imageGroups = new Map();
  
  for (const img of allImages) {
    if (!isProfileImage(img)) continue;
    
    const rect = img.getBoundingClientRect();
    const sizeKey = `${Math.round(rect.width / 50) * 50}x${Math.round(rect.height / 50) * 50}`;
    
    if (!imageGroups.has(sizeKey)) {
      imageGroups.set(sizeKey, []);
    }
    imageGroups.get(sizeKey).push(img);
  }
  
  // Find the largest group (likely to be profile photos)
  let largestGroup = [];
  for (const group of imageGroups.values()) {
    if (group.length > largestGroup.length && group.length >= 2) {
      largestGroup = group;
    }
  }
  
  return largestGroup;
}

// Process images in batches
async function processImagesBatch(images) {
  isProcessing = true;
  processingQueue = [...images];
  
  console.log(`Starting batch processing of ${images.length} images`);
  
  // Track success/failure counts
  let successCount = 0;
  let failureCount = 0;
  
  // Process in chunks of MAX_CONCURRENT_CONVERSIONS
  const chunks = [];
  for (let i = 0; i < images.length; i += MAX_CONCURRENT_CONVERSIONS) {
    chunks.push(images.slice(i, i + MAX_CONCURRENT_CONVERSIONS));
  }
  
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} images)`);
      
      // Process chunk in parallel
      const promises = chunk.map(img => convertImageToPirate(img));
      const results = await Promise.allSettled(promises);
      
      // Count successes and failures
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          console.log(`✅ Image ${index + 1} converted successfully`);
        } else {
          failureCount++;
          console.error(`❌ Image ${index + 1} conversion failed:`, result.reason);
        }
      });
      
      // Small delay between chunks to avoid overwhelming the API
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Batch processing completed: ${successCount} succeeded, ${failureCount} failed`);
    
    // Log results without showing alerts for successful conversions
    if (successCount > 0 && failureCount === 0) {
      console.log(`✅ All ${successCount} profile photos converted to pirates successfully! 🏴‍☠️`);
    } else if (successCount > 0 && failureCount > 0) {
      console.log(`⚠️ ${successCount} images converted successfully, ${failureCount} failed. Check console for errors.`);
      alert(`${successCount} images converted successfully, ${failureCount} failed. Check console for errors.`);
    } else {
      console.log(`❌ All ${failureCount} conversions failed. Check console for errors.`);
      alert(`All ${failureCount} conversions failed. Check console for errors.`);
    }
    
  } catch (error) {
    console.error('Batch processing error:', error);
    alert(`Batch processing failed: ${error.message}`);
  } finally {
    isProcessing = false;
    processingQueue = [];
  }
}

// Convert single image to pirate
async function handleConvertSingleImage(imageUrl) {
  if (isProcessing) {
    alert('Already processing images. Please wait for current conversion to complete.');
    return;
  }
  
  // Find the image element
  const img = document.querySelector(`img[src="${imageUrl}"]`);
  if (!img) {
    alert('Could not find the image on the page.');
    return;
  }
  
  await convertImageToPirate(img);
}

// Convert individual image to pirate
async function convertImageToPirate(imageElement) {
  console.log('Converting image to pirate:', imageElement.src);
  
  try {
    // Store original URL for progress tracking and hover comparison
    const originalUrl = imageElement.src;
    imageElement.dataset.originalUrl = originalUrl;
    
    // Create progress overlay (without black background)
    progressOverlay.createOverlay(imageElement);
    progressOverlay.updateProgress(imageElement, 10, 'Processing image...');
    
    // Use background script to handle the conversion (avoids CORS issues)
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Background script timeout (5 minutes)'));
      }, 300000); // 5 minute timeout
      
      chrome.runtime.sendMessage({
        action: 'convertImage',
        imageUrl: imageElement.src,
        imageSize: {
          width: imageElement.naturalWidth || imageElement.width,
          height: imageElement.naturalHeight || imageElement.height
        }
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
        } else if (response && response.success) {
          console.log('Background script success:', response.result);
          resolve(response.result);
        } else {
          console.error('Background script error:', response);
          reject(new Error(response?.error || 'Unknown error from background script'));
        }
      });
    });
    
    progressOverlay.updateProgress(imageElement, 95, 'Replacing image...');
    
    // Replace the original image and add hover functionality
    await replaceImageWithHoverComparison(imageElement, result.pirateImageUrl);
    
    // Show success
    progressOverlay.showSuccess(imageElement);
    
    console.log('Image conversion completed successfully');
    
  } catch (error) {
    console.error('Image conversion failed:', error);
    progressOverlay.showError(imageElement, error.message);
    throw error; // Re-throw so Promise.allSettled can catch it
  }
}

// Replace image with hover comparison functionality
async function replaceImageWithHoverComparison(originalImage, pirateImageUrl) {
  return new Promise((resolve, reject) => {
    // Create new image to preload
    const newImg = new Image();
    
    newImg.onload = () => {
      // Store both URLs for hover comparison
      const originalUrl = originalImage.dataset.originalUrl;
      originalImage.dataset.pirateUrl = pirateImageUrl;
      
      // Get original dimensions
      const originalRect = originalImage.getBoundingClientRect();
      
      // Replace source with pirate version
      originalImage.src = pirateImageUrl;
      
      // Maintain original size if it was explicitly set
      if (originalImage.style.width || originalImage.style.height) {
        // Keep existing styles
      } else if (originalImage.width || originalImage.height) {
        // Preserve original dimensions
        originalImage.style.width = `${originalRect.width}px`;
        originalImage.style.height = `${originalRect.height}px`;
        originalImage.style.objectFit = 'cover';
      }
      
      // Reset processing filter and add hover functionality
      originalImage.style.filter = '';
      originalImage.style.transition = 'opacity 0.2s ease, filter 0.2s ease';
      originalImage.style.cursor = 'pointer';
      
      // Add hover event listeners for comparison
      const showOriginal = () => {
        originalImage.src = originalUrl;
        originalImage.style.filter = 'brightness(1.1)';
        originalImage.title = 'Original image - mouse out to see pirate version';
      };
      
      const showPirate = () => {
        originalImage.src = pirateImageUrl;
        originalImage.style.filter = '';
        originalImage.title = 'Pirate version - mouse over to see original';
      };
      
      // Remove any existing listeners to avoid duplicates
      originalImage.removeEventListener('mouseenter', originalImage._showOriginal);
      originalImage.removeEventListener('mouseleave', originalImage._showPirate);
      
      // Store references for removal
      originalImage._showOriginal = showOriginal;
      originalImage._showPirate = showPirate;
      
      // Add new listeners
      originalImage.addEventListener('mouseenter', showOriginal);
      originalImage.addEventListener('mouseleave', showPirate);
      
      // Set initial title
      showPirate();
      
      // Add a subtle animation for the replacement
      originalImage.style.opacity = '0';
      setTimeout(() => {
        originalImage.style.opacity = '1';
        resolve();
      }, 100);
    };
    
    newImg.onerror = () => {
      reject(new Error('Failed to load converted image'));
    };
    
    newImg.src = pirateImageUrl;
  });
}

// Legacy function for compatibility (if needed elsewhere)
async function replaceImageOnPage(originalImage, newImageUrl) {
  return replaceImageWithHoverComparison(originalImage, newImageUrl);
}

// Scan indicator functions
function showScanIndicator(message) {
  const indicator = document.createElement('div');
  indicator.className = 'sogni-scan-indicator';
  indicator.innerHTML = `
    <span>🔍</span>
    <span class="message">${message}</span>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

function updateScanIndicator(indicator, message, type = 'processing') {
  if (!indicator) return;
  
  const messageEl = indicator.querySelector('.message');
  if (messageEl) {
    messageEl.textContent = message;
  }
  
  // Update icon based on type
  const iconEl = indicator.querySelector('span:first-child');
  if (iconEl) {
    switch (type) {
      case 'success':
        iconEl.textContent = '✅';
        indicator.classList.add('success');
        break;
      case 'error':
        iconEl.textContent = '❌';
        indicator.classList.add('error');
        break;
      default:
        iconEl.textContent = '🔍';
        break;
    }
  }
}

function removeScanIndicator(indicator) {
  if (indicator && indicator.parentNode) {
    indicator.style.opacity = '0';
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }
}

// Add some basic styles
const style = document.createElement('style');
style.textContent = `
  .sogni-converting {
    filter: brightness(0.7) saturate(0.8);
    transition: filter 0.3s ease;
  }
`;
document.head.appendChild(style);
