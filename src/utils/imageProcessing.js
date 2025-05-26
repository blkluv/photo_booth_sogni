/**
 * Returns dimensions based on the selected aspect ratio or device orientation.
 * Supports multiple aspect ratios:
 * - portrait (896x1152) - 7:9 ratio
 * - narrow (832x1216) - 13:19 ratio  
 * - ultranarrow (768x1344) - 4:7 ratio
 * - landscape (1152x896) - 9:7 ratio
 * - wide (1216x832) - 19:13 ratio
 * - ultrawide (1344x768) - 7:4 ratio
 * - square (1024x1024) - 1:1 ratio
 * @param {string} aspectRatio - 'portrait', 'narrow', 'ultranarrow', 'landscape', 'wide', 'ultrawide', or 'square'
 */
export function getCustomDimensions(aspectRatio) {
  // If no aspectRatio is provided, determine based on screen orientation
  const isPortrait = window.innerHeight > window.innerWidth;
  
  // If no aspectRatio is provided, determine based on screen orientation
  if (!aspectRatio) {
    return isPortrait ? 
      { width: 896, height: 1152 } : // Portrait: 896:1152 (ratio ~0.778)
      { width: 1152, height: 896 }; // Landscape: 1152:896 (ratio ~1.286)
  }
  
  // Otherwise use the explicitly provided aspectRatio
  switch (aspectRatio) {
    case 'portrait':
      return { width: 896, height: 1152 }; // Portrait: 896:1152 (7:9 ratio ~0.778)
    case 'narrow':
      return { width: 832, height: 1216 }; // Narrow: 832:1216 (13:19 ratio ~0.684)
    case 'ultranarrow':
      return { width: 768, height: 1344 }; // Ultra Narrow: 768:1344 (4:7 ratio ~0.571)
    case 'landscape':
      return { width: 1152, height: 896 }; // Landscape: 1152:896 (9:7 ratio ~1.286)
    case 'wide':
      return { width: 1216, height: 832 }; // Wide: 1216:832 (19:13 ratio ~1.462)
    case 'ultrawide':
      return { width: 1344, height: 768 }; // Ultra Wide: 1344:768 (7:4 ratio ~1.75)
    case 'square':
      return { width: 1024, height: 1024 }; // Square: 1024x1024 (ratio 1:1)
    default:
      // Fallback to orientation-based default if invalid option provided
      return isPortrait ? 
        { width: 896, height: 1152 } : 
        { width: 1152, height: 896 };
  }
}

/** 
 * Helper: resize dataURL so original matches the Sogni dimension 
 * for easy side-by-side comparison (no skew).
 */
export async function resizeDataUrl(dataUrl, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.addEventListener('load', () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      // fill black to avoid any transparent edges
      context.fillStyle = 'black';
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png', 1.0));
    });
    img.src = dataUrl;
  });
}

/**
 * Creates a polaroid framed version of an image for social sharing
 * @param {string} imageUrl - URL or data URL of the image to frame
 * @param {string} label - Optional label to display at the bottom of the polaroid
 * @param {Object} options - Additional options
 * @param {number} options.frameWidth - Width of the polaroid border sides (default: 24px)
 * @param {number} options.frameTopWidth - Width of the polaroid border top (default: 24px)
 * @param {number} options.frameBottomWidth - Width of the polaroid border bottom (default: 64px)
 * @param {string} options.frameColor - Color of the polaroid frame (default: white)
 * @param {string} options.labelFont - Font for the label (default: 16px "Permanent Marker", cursive)
 * @param {string} options.labelColor - Color for the label text (default: #333)
 * @returns {Promise<string>} Data URL of the generated polaroid image
 */
export async function createPolaroidImage(imageUrl, label, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      frameWidth = 56,
      frameTopWidth = 56,
      frameBottomWidth = 196, // Updated to match Twitter sharing settings (150px)
      frameColor = 'white',
      labelFont = '72px "Permanent Marker", cursive',
      labelColor = '#333'
    } = options;

    // Load the Permanent Marker font if it's not already loaded
    if (!document.querySelector('link[href*="Permanent+Marker"]')) {
      // Create a link element for the Google Font
      const fontLink = document.createElement('link');
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
      fontLink.rel = 'stylesheet';
      document.head.appendChild(fontLink);
      
      console.log('Loaded Permanent Marker font for polaroid label');
    }

    const img = new Image();
    img.crossOrigin = 'anonymous'; // Handle CORS for image loading
    
    img.onload = () => {
      // Ensure any text to draw exists
      const textToDraw = label ? label.trim() : '';
      console.log(`Drawing polaroid with label: "${textToDraw}"`);
      
      // Create a canvas for the polaroid
      const canvas = document.createElement('canvas');
      
      // Calculate dimensions to maintain aspect ratio
      const aspectRatio = img.width / img.height;
      
      // Set a reasonable max size for the polaroid
      const maxImageWidth = 1600;
      const maxImageHeight = 1600;
      
      let imageWidth, imageHeight;
      
      if (img.width > img.height) {
        // Landscape orientation
        imageWidth = Math.min(img.width, maxImageWidth);
        imageHeight = imageWidth / aspectRatio;
      } else {
        // Portrait or square orientation
        imageHeight = Math.min(img.height, maxImageHeight);
        imageWidth = imageHeight * aspectRatio;
      }
      
      // Calculate full polaroid dimensions including frame
      const polaroidWidth = imageWidth + (frameWidth * 2);
      const polaroidHeight = imageHeight + frameTopWidth + frameBottomWidth;
      
      // Set canvas size to the polaroid dimensions
      canvas.width = polaroidWidth;
      canvas.height = polaroidHeight;
      
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Draw polaroid frame (white background)
      ctx.fillStyle = frameColor;
      ctx.fillRect(0, 0, polaroidWidth, polaroidHeight);
      
      // Draw the image centered in the frame
      ctx.drawImage(img, frameWidth, frameTopWidth, imageWidth, imageHeight);
      
      // Add subtle inner shadow to make it look more realistic
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.shadowOffsetX = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.strokeRect(frameWidth, frameTopWidth, imageWidth, imageHeight);
      
      // Reset shadow for text
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      
      // Add label if provided and not empty
      if (textToDraw) {
        // Set font with Permanent Marker
        ctx.font = labelFont;
        ctx.fillStyle = labelColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Position label in the bottom white area, a bit higher from the bottom for better visual balance
        const labelY = polaroidHeight - (frameBottomWidth / 2);
        
        // Constrain label length if too long
        const maxLabelWidth = polaroidWidth - 20; // Increased padding
        let displayLabel = textToDraw;
        
        if (ctx.measureText(textToDraw).width > maxLabelWidth) {
          // Truncate and add ellipsis if too long
          for (let i = textToDraw.length; i > 0; i--) {
            const truncated = textToDraw.substring(0, i) + '...';
            if (ctx.measureText(truncated).width <= maxLabelWidth) {
              displayLabel = truncated;
              break;
            }
          }
        }
        
        ctx.fillText(displayLabel, polaroidWidth / 2, labelY);
        
        console.log(`Drew label: "${displayLabel}" at y=${labelY} with bottom width ${frameBottomWidth}`);
      }
      
      // Convert to data URL with maximum quality
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      
      // For debugging: display the image in the console
      console.log(`Generated polaroid with dimensions: ${polaroidWidth}x${polaroidHeight}`);
      
      resolve(dataUrl);
    };
    
    img.onerror = (err) => {
      console.error('Error creating polaroid image:', err);
      reject(new Error('Failed to load image for polaroid frame'));
    };
    
    img.src = imageUrl;
  });
}

/** 
 * Center crop an image to match portrait aspect ratio on mobile
 * This is specifically for photos selected from the camera roll
 */
export async function centerCropImage(imageBlob, targetWidth, targetHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      
      // Enable high-quality image resampling for best results
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Fill with black background to avoid transparency
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      
      // Calculate dimensions for center crop
      const imageAspect = img.width / img.height;
      const targetAspect = targetWidth / targetHeight;
      
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = img.width;
      let sourceHeight = img.height;
      
      // If image is wider than target, crop width
      if (imageAspect > targetAspect) {
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } 
      // If image is taller than target, crop height
      else if (imageAspect < targetAspect) {
        sourceHeight = img.width / targetAspect;
        sourceY = (img.height - sourceHeight) / 2;
      }
      
      // Draw the cropped image onto the canvas
      ctx.drawImage(
        img, 
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, targetWidth, targetHeight
      );
      
      // Convert to blob with maximum quality
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png', 1.0);
    };
    
    img.src = URL.createObjectURL(imageBlob);
  });
}

/**
 * Convert a blob to a data URL
 */
export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}; 