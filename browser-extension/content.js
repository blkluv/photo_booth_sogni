// Content Script for Sogni Photobooth Extension
console.log('Sogni Photobooth Extension: Content script loaded');

// Initialize components
let api = null;
let progressOverlay = null;
let isDevMode = true; // Default to dev mode
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
    
    console.log('Extension initialized successfully - waiting for activation');
    
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
    // Add the style selector icon when extension is activated
    addStyleSelectorIcon();
    
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
  }
  
  if (message.action === 'activateExtension') {
    console.log('Extension activation requested');
    // Add the style selector icon when extension is activated
    addStyleSelectorIcon();
    
    // Make logo visible immediately
    setTimeout(() => {
      const logo = document.getElementById('sogni-style-selector-icon');
      if (logo) {
        logo.style.opacity = '1';
        logo.style.transform = 'scale(1)';
      }
    }, 100);
    
    sendResponse({ success: true, message: 'Extension activated, logo added' });
    return false;
  }
  
  if (message.action === 'updateDevMode') {
    console.log('Dev mode update received:', message.devMode);
    isDevMode = message.devMode;
    console.log('🔧 Dev mode updated to:', isDevMode);
    sendResponse({ success: true, message: 'Dev mode updated' });
    return false;
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
      
      // Create download icon
      const downloadIcon = document.createElement('div');
      downloadIcon.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 10L12 15L17 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 15V3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      
      // Position download icon relative to image
      const updateIconPosition = () => {
        const imageRect = originalImage.getBoundingClientRect();
        downloadIcon.style.position = 'fixed';
        downloadIcon.style.top = `${imageRect.top + 10}px`;
        downloadIcon.style.left = `${imageRect.right - 50}px`;
      };
      
      downloadIcon.style.cssText = `
        position: fixed;
        width: 40px;
        height: 40px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s ease, background-color 0.2s ease;
        z-index: 999999;
        pointer-events: none;
      `;
      
      // Set initial position
      updateIconPosition();
      
      // Update position on scroll and resize
      const updatePosition = () => updateIconPosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
      downloadIcon.id = `download-icon-${Date.now()}`;
      
      // Add hover event listeners for comparison and download icon
      const showOriginal = () => {
        originalImage.src = originalUrl;
        originalImage.style.filter = 'brightness(1.1)';
        originalImage.title = 'Original image - mouse out to see transformed version';
        // Keep download icon visible even when showing original
        downloadIcon.style.opacity = '1';
        downloadIcon.style.pointerEvents = 'auto';
      };
      
      const showTransformed = () => {
        originalImage.src = pirateImageUrl;
        originalImage.style.filter = '';
        originalImage.title = 'Transformed image - hover to download or see original';
        downloadIcon.style.opacity = '1';
        downloadIcon.style.pointerEvents = 'auto';
      };
      
      // Download functionality
      const downloadTransformedImage = async () => {
        try {
          const filename = `sogni-transformed-${Date.now()}.jpg`;
          await downloadImageFromUrl(pirateImageUrl, filename);
        } catch (error) {
          console.error('Download failed:', error);
        }
      };
      
      // Download icon event listeners
      downloadIcon.addEventListener('mouseenter', () => {
        // Keep showing transformed image when hovering over download icon
        showTransformed();
        downloadIcon.style.background = 'rgba(0, 0, 0, 0.9)';
      });
      
      downloadIcon.addEventListener('mouseleave', () => {
        downloadIcon.style.background = 'rgba(0, 0, 0, 0.7)';
      });
      
      downloadIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        downloadTransformedImage();
      });
      
      // Clean up existing download icon if it exists
      if (originalImage._downloadIcon && originalImage._downloadIcon.parentNode) {
        originalImage._downloadIcon.parentNode.removeChild(originalImage._downloadIcon);
      }
      
      // Clean up existing event listeners
      if (originalImage._updatePosition) {
        window.removeEventListener('scroll', originalImage._updatePosition);
        window.removeEventListener('resize', originalImage._updatePosition);
      }
      
      // Remove any existing listeners to avoid duplicates
      originalImage.removeEventListener('mouseenter', originalImage._showOriginal);
      originalImage.removeEventListener('mouseleave', originalImage._showPirate);
      
      // Store references for removal
      originalImage._showOriginal = showOriginal;
      originalImage._showPirate = showTransformed;
      
      // Add new listeners
      originalImage.addEventListener('mouseenter', showOriginal);
      originalImage.addEventListener('mouseleave', showTransformed);
      
      // Add download icon to page
      document.body.appendChild(downloadIcon);
      
      // Store references for cleanup
      originalImage._downloadIcon = downloadIcon;
      originalImage._updatePosition = updatePosition;
      
      // Set initial state
      showTransformed();
      
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

// Add style selector icon to the page
// Global variables for interactive animations
let slothElement = null;
let promptTags = [];
let animationsActive = false;
let speechBubble = null;

// Format style key to display name (replicated from photobooth)
function styleIdToDisplay(styleId) {
  if (!styleId) return '';
  
  // Handle special case
  if (styleId === 'y2kRaverKid') {
    return 'Y2K Raver Kid';
  }
  
  return styleId
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between lowercase and uppercase
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')  // Add space between letters and numbers
    .replace(/(\d+)([a-zA-Z])/g, (match, numbers, letters) => {
      // Don't separate common patterns like F1, 1990s, 90s, 3D, etc.
      const commonPatterns = /^(f1|1990s|90s|3d|2d|8k|4k|24x24|128x112)$/i;
      if (commonPatterns.test(numbers + letters)) {
        return match; // Keep as-is
      }
      return `${numbers} ${letters}`; // Add space after numbers
    })
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Download functionality (replicated from photobooth)
async function downloadImageFromUrl(imageUrl, filename) {
  try {
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      return await downloadImageMobile(imageUrl, filename);
    } else {
      return await downloadImageStandard(imageUrl, filename);
    }
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  }
}

// Mobile download with share sheet
async function downloadImageMobile(imageUrl, filename) {
  try {
    // Method 1: Try native Web Share API first (works on modern iOS and Android)
    if (navigator.share && navigator.canShare) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: blob.type });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Sogni Transformed Image',
            text: 'Check out this AI-transformed image!'
          });
          return true;
        }
      } catch (shareError) {
        console.log('Web Share API failed, trying fallback:', shareError);
      }
    }
    
    // Fallback to standard download
    return await downloadImageStandard(imageUrl, filename);
    
  } catch (error) {
    console.error('Mobile download failed:', error);
    return false;
  }
}

// Standard download implementation
async function downloadImageStandard(imageUrl, filename) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    
    return true;
  } catch (error) {
    console.error('Standard download failed:', error);
    return false;
  }
}


// Show interactive animations (sloth only)
function showInteractiveAnimations() {
  if (animationsActive) return;
  animationsActive = true;
  
  console.log('🎭 Showing interactive animations - HOVER DETECTED');
  
  // Show sloth animation
  showSlothAnimation();
}

// Hide interactive animations
function hideInteractiveAnimations() {
  if (!animationsActive) return;
  animationsActive = false;
  
  console.log('🎭 Hiding interactive animations');
  
  // Hide sloth
  if (slothElement) {
    slothElement.style.opacity = '0';
    setTimeout(() => {
      if (slothElement && slothElement.parentNode) {
        slothElement.parentNode.removeChild(slothElement);
      }
      slothElement = null;
    }, 500);
  }
  
  // Hide SuperApps link
  const superAppsLink = document.getElementById('sogni-superapps-link');
  if (superAppsLink) {
    superAppsLink.style.opacity = '0';
    setTimeout(() => {
      if (superAppsLink && superAppsLink.parentNode) {
        superAppsLink.parentNode.removeChild(superAppsLink);
      }
    }, 500);
  }
  
  // Hide prompt tags
  promptTags.forEach((tag, index) => {
    setTimeout(() => {
      if (tag && tag.parentNode) {
        tag.style.opacity = '0';
        tag.style.transform = 'scale(0.5) translateY(-20px)';
        setTimeout(() => {
          if (tag.parentNode) {
            tag.parentNode.removeChild(tag);
          }
        }, 300);
      }
    }, index * 20); // Stagger the exit
  });
  promptTags = [];
}

// Show sloth hop animation
function showSlothAnimation() {
  if (slothElement) return;
  
  const sloth = document.createElement('img');
  sloth.src = chrome.runtime.getURL('icons/sloth_cam_hop_trnsparent.png');
  sloth.alt = 'Sloth Animation';
  sloth.className = 'sogni-sloth-animation';
  
  // Responsive sizing
  const isMobile = window.innerWidth <= 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  
  let size;
  if (isMobile && isPortrait) {
    size = Math.min(window.innerWidth * 0.27, window.innerHeight * 0.2); // 2/3 of original
  } else {
    size = Math.min(window.innerHeight * 0.6, 267); // 2/3 of original (400 * 2/3 = 267)
  }
  
  sloth.style.cssText = `
    position: fixed;
    right: 50px;
    bottom: ${size * 0.3}px;
    width: ${size}px;
    height: auto;
    z-index: 999998;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.3));
    animation: sogni-sloth-float 3s ease-in-out infinite;
  `;
  
  document.body.appendChild(sloth);
  slothElement = sloth;
  
  // Add "SOGNI SUPERAPPS" link below the sloth
  const superAppsLink = document.createElement('a');
  superAppsLink.href = 'https://www.sogni.ai/super-apps';
  superAppsLink.target = '_blank';
  superAppsLink.textContent = 'Powered by Sogni Supernet';
  superAppsLink.id = 'sogni-superapps-link';
  
  superAppsLink.style.cssText = `
    position: fixed;
    right: 80px;
    bottom: 80px;
    background: #ffffff;
    color: #111827;
    padding: 12px 20px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    text-decoration: none;
    z-index: 999998;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(0, 0, 0, 0.1);
    white-space: nowrap;
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    cursor: pointer;
  `;
  
  // Hover effects
  superAppsLink.addEventListener('mouseenter', () => {
    superAppsLink.style.transform = 'translateY(15px) scale(1.05)';
    superAppsLink.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.2)';
  });
  
  superAppsLink.addEventListener('mouseleave', () => {
    superAppsLink.style.transform = 'translateY(20px) scale(1)';
    superAppsLink.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  });
  
  document.body.appendChild(superAppsLink);
  
  // Fade in and start floating immediately
  setTimeout(() => {
    sloth.style.opacity = '1';
    superAppsLink.style.opacity = '1';
    superAppsLink.style.transform = 'translateY(20px)';
  }, 100);
}

// Show speech bubble with "EXPLORE STYLES"
function showSpeechBubble() {
  if (speechBubble) return; // Already showing
  
  const logo = document.getElementById('sogni-style-selector-icon');
  if (!logo) return;
  
  speechBubble = document.createElement('div');
  speechBubble.id = 'sogni-speech-bubble';
  speechBubble.textContent = 'EXPLORE STYLES';
  
  const logoRect = logo.getBoundingClientRect();
  
  speechBubble.style.cssText = `
    position: fixed;
    left: ${logoRect.right + 10}px;
    top: ${logoRect.top - 5}px;
    background: #ffffff;
    color: #111827;
    padding: 8px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(0, 0, 0, 0.1);
    white-space: nowrap;
    opacity: 0;
    transform: scale(0.8) translateY(5px);
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: none;
  `;
  
  // Add speech bubble tail
  const tail = document.createElement('div');
  tail.style.cssText = `
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 6px solid #ffffff;
  `;
  speechBubble.appendChild(tail);
  
  document.body.appendChild(speechBubble);
  
  // Animate in
  setTimeout(() => {
    speechBubble.style.opacity = '1';
    speechBubble.style.transform = 'scale(1) translateY(0)';
  }, 10);
}

// Hide speech bubble
function hideSpeechBubble() {
  if (!speechBubble) return;
  
  speechBubble.style.opacity = '0';
  speechBubble.style.transform = 'scale(0.8) translateY(5px)';
  
  setTimeout(() => {
    if (speechBubble && speechBubble.parentNode) {
      speechBubble.parentNode.removeChild(speechBubble);
    }
    speechBubble = null;
  }, 200);
}




function addStyleSelectorIcon() {
  // Check if icon already exists
  if (document.getElementById('sogni-style-selector-icon')) {
    return;
  }
  
  const icon = document.createElement('div');
  icon.id = 'sogni-style-selector-icon';
  icon.className = 'sogni-style-selector-icon';
  icon.title = 'Open Sogni Style Explorer';
  
  // Create image element for the Sogni logo
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icons/logo.png');
  logoImg.alt = 'Sogni Logo';
  logoImg.className = 'sogni-logo-img';
  
  // Add error handling - no fallbacks, just log the error
  logoImg.onerror = function() {
    console.error('❌ Logo failed to load from:', this.src);
  };
  
  icon.appendChild(logoImg);
  
  // Add hover handlers for interactive animations
  let hoverTimeout;
  icon.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimeout);
    
    // Show speech bubble immediately
    showSpeechBubble();
    
    hoverTimeout = setTimeout(() => {
      showInteractiveAnimations();
    }, 200); // Small delay to prevent accidental triggers
  });
  
  icon.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimeout);
    
    // Hide speech bubble
    hideSpeechBubble();
    
    // Don't hide animations on mouse leave - they stay until interaction
  });
  
  // Add click handler to open style explorer
  icon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Style selector icon clicked');
    hideInteractiveAnimations();
    openStyleExplorer();
  });
  
  document.body.appendChild(icon);
  console.log('Style selector icon added to page');
}

// Get the correct base URL based on dev mode
function getBaseUrl() {
  // Configure your local development URL here
  const LOCAL_DEV_URL = 'https://photobooth-local.sogni.ai'; // Change this to your local setup
  // Alternative options:
  // const LOCAL_DEV_URL = 'http://localhost:5173';  // Vite dev server
  // const LOCAL_DEV_URL = 'http://localhost:3000';  // Create React App
  
  return isDevMode ? LOCAL_DEV_URL : 'https://photobooth.sogni.ai';
}

// Open the Sogni Style Explorer overlay
async function openStyleExplorer() {
  console.log('Opening Sogni Style Explorer...');
  
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'sogni-style-explorer-overlay';
  overlay.className = 'sogni-style-explorer-overlay';
  
  // Create iframe to load the main Sogni app directly to Style Explorer
  const iframe = document.createElement('iframe');
  // Get the correct base URL based on dev mode
  const baseUrl = getBaseUrl();
  console.log('🔧 Dev mode:', isDevMode);
  console.log('🔧 Using base URL:', baseUrl);
  const params = new URLSearchParams({
    page: 'prompts',
    extension: 'true',
    t: Date.now().toString()
  });
  iframe.src = `${baseUrl}/?${params.toString()}`;
  iframe.className = 'sogni-style-explorer-iframe';
  iframe.allow = 'camera; microphone';
  
  console.log('🔗 Loading Style Explorer with URL:', iframe.src);
  console.log('🔍 URL breakdown:');
  console.log('  - Base URL:', baseUrl);
  console.log('  - Parameters:', params.toString());
  console.log('  - Full URL:', `${baseUrl}/?${params.toString()}`);
  
  // Create close button (floating over iframe)
  const closeButton = document.createElement('button');
  closeButton.className = 'sogni-style-explorer-close';
  closeButton.innerHTML = '✕';
  closeButton.title = 'Close Style Explorer';
  closeButton.addEventListener('click', closeStyleExplorer);
  
  // Assemble overlay - just iframe and floating close button
  overlay.appendChild(iframe);
  overlay.appendChild(closeButton);
  
  // Add to page
  document.body.appendChild(overlay);
  
  // Listen for messages from the iframe
  console.log('🎧 Adding message listener for style explorer');
  window.addEventListener('message', handleStyleExplorerMessage);
  
  // Test message listener is working
  console.log('🧪 Testing message listener setup...');
  
  // Send a test message to the iframe after it loads
  iframe.onload = function() {
    console.log('📡 Iframe loaded successfully');
    console.log('🔗 Iframe URL:', iframe.src);
    console.log('📄 Iframe document:', iframe.contentDocument ? 'accessible' : 'not accessible (cross-origin)');
    
    setTimeout(() => {
      console.log('📤 Sending extensionReady message to iframe...');
      try {
        iframe.contentWindow.postMessage({ type: 'extensionReady' }, '*');
        console.log('✅ Message sent successfully');
        
        
      } catch (error) {
        console.error('❌ Error sending message to iframe:', error);
      }
    }, 2000); // Increased delay to 2 seconds
  };
  
  iframe.onerror = function(error) {
    console.error('❌ Iframe failed to load:', error);
  };
  
  // Prevent body scrolling
  document.body.style.overflow = 'hidden';
}

// Close the style explorer
function closeStyleExplorer() {
  const overlay = document.getElementById('sogni-style-explorer-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  // Remove message listener
  window.removeEventListener('message', handleStyleExplorerMessage);
  
  // Restore body scrolling
  document.body.style.overflow = '';
  
  console.log('Style explorer closed');
}

// Handle messages from the style explorer iframe
function handleStyleExplorerMessage(event) {
  console.log('🔔 Message received from origin:', event.origin);
  console.log('📦 Message data:', JSON.stringify(event.data, null, 2));
  console.log('🔍 Message type:', event.data?.type);
  console.log('🔍 Is this a style-related message?', ['styleSelected', 'useThisStyle'].includes(event.data?.type));
  
  // Only accept messages from our domain (including localhost for dev)
  console.log('🔍 Checking message origin:', event.origin);
  console.log('🔍 Origin includes sogni.ai?', event.origin.includes('sogni.ai'));
  console.log('🔍 Origin includes localhost?', event.origin.includes('localhost'));
  console.log('🔍 Expected origins: photobooth.sogni.ai, photobooth-local.sogni.ai, localhost');
  
  const isValidOrigin = event.origin.includes('sogni.ai') || 
                       event.origin.includes('localhost') ||
                       event.origin.includes('127.0.0.1');
  
  // Temporarily allow all origins for debugging
  if (!isValidOrigin && !['styleSelected', 'useThisStyle'].includes(event.data?.type)) {
    console.log('❌ Message rejected - not from valid domain and not a style message');
    return;
  }
  
  if (!isValidOrigin && ['styleSelected', 'useThisStyle'].includes(event.data?.type)) {
    console.log('⚠️ ALLOWING style message from invalid origin for debugging:', event.origin);
  }
  
  console.log('✅ Message accepted from valid domain');
  
  console.log('✅ Message accepted from style explorer');
  
  if (event.data.type === 'styleSelected') {
    const { styleKey, stylePrompt } = event.data;
    console.log(`🎨 Style selected: ${styleKey}`);
    console.log(`📝 Style prompt: ${stylePrompt}`);
    
    // Close the style explorer
    closeStyleExplorer();
    
    // Start processing images with the selected style
    processImagesWithStyle(styleKey, stylePrompt);
  } else if (event.data.type === 'useThisStyle') {
    // Handle "Use This Style" button clicks from the gallery
    const { promptKey, stylePrompt } = event.data;
    console.log(`🎯 Use This Style clicked for: ${promptKey}`);
    console.log(`📝 Style prompt: ${stylePrompt}`);
    
    // Use the provided stylePrompt or get it from our lookup
    const finalStylePrompt = stylePrompt || getStylePromptForKey(promptKey);
    console.log(`🔧 Final style prompt: ${finalStylePrompt}`);
    
    // Close the style explorer
    closeStyleExplorer();
    
    // Start processing images with the selected style
    processImagesWithStyle(promptKey, finalStylePrompt);
  } else {
    console.log('❓ Unknown message type:', event.data.type);
    console.log('🔍 Available message types: styleSelected, useThisStyle');
  }
}

// Helper function to get style prompt for a given key
function getStylePromptForKey(promptKey) {
  // This is a simplified version - in a real implementation, you'd want to 
  // load the actual prompts.json data or get it from the iframe
  const commonPrompts = {
    'pirateClassic': 'Attractive, friendly storybook pirate portrait, watercolor-ink blend, weathered tricorn hat, eye patch, flowing beard, nautical background',
    'animeKawaii': 'Attractive, anime-style cute portrait, large expressive eyes, floating heart symbols, cute cat ears, kawaii style, vibrant, psychedlic',
    'vintageSepia': 'Attractive, antique daguerreotype portrait, subtle silvering, believable plate blur',
    'comicManga': 'Attractive, color manga portrait, dramatic shōnen eyes, action panels, comic strip',
    // Add more as needed, or implement a proper lookup
  };
  
  return commonPrompts[promptKey] || `Transform into ${promptKey} style`;
}

// Process images with selected style
async function processImagesWithStyle(styleKey, stylePrompt) {
  console.log(`Processing images with style: ${styleKey}`);
  
  // Show scan indicator
  const styleDisplayName = styleIdToDisplay(styleKey);
  const scanIndicator = showScanIndicator(`Finding profile photos for ${styleDisplayName} conversion...`);
  
  try {
    // Find profile images
    const profileImages = findProfileImages();
    
    if (profileImages.length === 0) {
      updateScanIndicator(scanIndicator, 'No profile photos found on this page', 'error');
      setTimeout(() => removeScanIndicator(scanIndicator), 3000);
      return;
    }
    
    console.log(`Found ${profileImages.length} profile images`);
    updateScanIndicator(scanIndicator, `Converting ${profileImages.length} images with ${styleDisplayName}...`, 'success');
    
    // Process all found images with the selected style
    await processImagesBatchWithStyle(profileImages, styleKey, stylePrompt);
    
    // Remove scan indicator after completion
    removeScanIndicator(scanIndicator);
    
    console.log(`Completed ${styleKey} conversion for ${profileImages.length} images`);
    
  } catch (error) {
    console.error('Error processing images with style:', error);
    updateScanIndicator(scanIndicator, `Error: ${error.message}`, 'error');
    setTimeout(() => removeScanIndicator(scanIndicator), 5000);
  }
}

// Process images in batches with custom style
async function processImagesBatchWithStyle(images, styleKey, stylePrompt) {
  isProcessing = true;
  processingQueue = [...images];
  
  console.log(`Starting batch processing of ${images.length} images with style: ${styleKey}`);
  
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
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} images) with ${styleKey}`);
      
      // Process chunk in parallel with custom style
      const promises = chunk.map(img => convertImageWithStyle(img, styleKey, stylePrompt));
      const results = await Promise.allSettled(promises);
      
      // Count successes and failures
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          console.log(`✅ Image ${index + 1} converted successfully with ${styleKey}`);
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
    
    console.log(`Batch processing completed with ${styleKey}: ${successCount} succeeded, ${failureCount} failed`);
    
  } catch (error) {
    console.error('Error in batch processing with style:', error);
  } finally {
    isProcessing = false;
    processingQueue = [];
  }
}

// Convert individual image with custom style
async function convertImageWithStyle(imageElement, styleKey, stylePrompt) {
  console.log(`Converting image with style: ${styleKey}`, imageElement.src);
  
  try {
    // Store original URL for progress tracking and hover comparison
    const originalUrl = imageElement.src;
    imageElement.dataset.originalUrl = originalUrl;
    
    // Create progress overlay
    progressOverlay.createOverlay(imageElement);
    const styleDisplayName = styleIdToDisplay(styleKey);
    progressOverlay.updateProgress(imageElement, 10, `Processing with ${styleDisplayName}...`);
    
    // Use background script to handle the conversion with custom style
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Background script timeout (5 minutes)'));
      }, 300000); // 5 minute timeout
      
      chrome.runtime.sendMessage({
        action: 'convertImageWithStyle',
        imageUrl: imageElement.src,
        styleKey: styleKey,
        stylePrompt: stylePrompt,
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
    await replaceImageWithHoverComparison(imageElement, result.convertedImageUrl);
    
    // Show success
    progressOverlay.showSuccess(imageElement);
    
    console.log(`Image conversion completed successfully with ${styleKey}`);
    
  } catch (error) {
    console.error(`Image conversion failed with ${styleKey}:`, error);
    progressOverlay.showError(imageElement, error.message);
    throw error; // Re-throw so Promise.allSettled can catch it
  }
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
