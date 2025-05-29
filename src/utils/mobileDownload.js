/**
 * Mobile Download Utilities
 * Provides mobile-optimized download functionality for saving photos to camera roll
 */

import { isIOS, isMobile } from './index';

/**
 * Detect if device is Android
 */
export const isAndroid = () => {
  return /Android/i.test(navigator.userAgent);
};

/**
 * Create an optimized image element for mobile downloads
 * This enables native context menu and long press functionality
 */
export const createMobileOptimizedImage = (imageUrl, alt = 'Photo') => {
  const img = document.createElement('img');
  
  // Set image source and attributes
  img.src = imageUrl;
  img.alt = alt;
  img.crossOrigin = 'anonymous';
  
  // Enable native mobile context menu and long press
  img.style.cssText = `
    -webkit-user-select: auto !important;
    user-select: auto !important;
    -webkit-touch-callout: default !important;
    touch-action: auto !important;
    -webkit-user-drag: auto !important;
    user-drag: auto !important;
    pointer-events: auto !important;
    max-width: 100%;
    height: auto;
    display: block;
  `;
  
  return img;
};

/**
 * Enhanced download function for mobile devices
 * Attempts to trigger native photo saving behavior
 */
export const downloadImageMobile = async (imageUrl, filename) => {
  try {
    if (isMobile()) {
      // For mobile devices, try multiple approaches
      
      // Method 1: Try native share API first (most reliable for camera roll)
      if (navigator.share && navigator.canShare) {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], filename, { type: blob.type });
          
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Save Photo',
              text: 'From my latest photoshoot in Sogni Photobooth! https://photobooth.sogni.ai'
            });
            return true;
          }
        } catch (shareError) {
          // Check if the error is due to user cancellation
          if (shareError.name === 'AbortError' || 
              shareError.message.includes('abort') || 
              shareError.message.includes('cancel') ||
              shareError.message.includes('dismissed') ||
              shareError.name === 'NotAllowedError') {
            // User cancelled the share dialog - this is expected behavior, don't fallback
            console.log('User cancelled share dialog');
            return true; // Return true to indicate the operation completed (user chose to cancel)
          }
          
          // Only fallback if it's a real error (not user cancellation)
          console.log('Native share not supported, trying fallback methods:', shareError.message);
        }
      }
      
      // Method 2: For iOS Safari, create a popup with optimized image
      if (isIOS()) {
        return await downloadImageIOS(imageUrl, filename);
      }
      
      // Method 3: For Android Chrome, use enhanced download
      if (isAndroid()) {
        return await downloadImageAndroid(imageUrl, filename);
      }
    }
    
    // Fallback to standard download
    return await downloadImageStandard(imageUrl, filename);
    
  } catch (error) {
    console.error('Mobile download failed:', error);
    // Return false to indicate failure - let the calling code decide on fallback behavior
    return false;
  }
};

/**
 * iOS-specific download implementation
 * Creates a popup with optimized image for long press to save
 */
const downloadImageIOS = async (imageUrl, filename) => {
  try {
    // Create popup window
    const popup = window.open('', '_blank', 'width=400,height=600,scrollbars=yes,resizable=yes');
    
    if (!popup) {
      // Popup blocked, fallback to standard download
      return await downloadImageStandard(imageUrl, filename);
    }
    
    popup.document.close();
    return true;
    
  } catch (error) {
    console.error('iOS download popup failed:', error);
    return await downloadImageStandard(imageUrl, filename);
  }
};

/**
 * Android-specific download implementation
 * Uses enhanced download with proper MIME type for photo apps
 */
const downloadImageAndroid = async (imageUrl, filename) => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    // Ensure proper MIME type for photo recognition
    const imageBlob = new Blob([blob], { type: 'image/png' });
    const blobUrl = URL.createObjectURL(imageBlob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    
    // Add attributes that help with photo app recognition
    link.setAttribute('type', 'image/png');
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);
    
    return true;
    
  } catch (error) {
    console.error('Android download failed:', error);
    return await downloadImageStandard(imageUrl, filename);
  }
};

/**
 * Standard download implementation (fallback)
 */
const downloadImageStandard = async (imageUrl, filename) => {
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
    
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
    return true;
  } catch (error) {
    console.error('Standard download failed:', error);
    window.open(imageUrl, '_blank');
    return false;
  }
};

/**
 * Apply mobile-optimized CSS to existing images
 */
export const enableMobileImageDownload = (imgElement) => {
  if (!imgElement || !isMobile()) return;
  
  // Apply mobile-optimized styles
  imgElement.style.cssText += `
    -webkit-user-select: auto !important;
    user-select: auto !important;
    -webkit-touch-callout: default !important;
    touch-action: auto !important;
    -webkit-user-drag: auto !important;
    user-drag: auto !important;
    pointer-events: auto !important;
  `;
  
  // Only set crossOrigin if the image hasn't loaded yet to avoid triggering a reload
  // Setting crossOrigin after load can cause mobile Chrome to re-evaluate and fail
  if (!imgElement.crossOrigin && !imgElement.complete) {
    imgElement.crossOrigin = 'anonymous';
  }
};

export default {
  downloadImageMobile,
  createMobileOptimizedImage,
  enableMobileImageDownload,
  isAndroid
}; 