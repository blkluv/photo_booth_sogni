import { styleIdToDisplay } from './index';

/**
 * Converts camelCase prompt key to lowercase filename (no hyphens)
 * @param {string} promptKey - The camelCase prompt key
 * @returns {string} The lowercase filename part
 */
const promptKeyToFilename = (promptKey) => {
  return promptKey
    // Convert to lowercase
    .toLowerCase()
    // Remove any special characters
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Generates the expected gallery filename for a prompt key
 * @param {string} promptKey - The prompt key
 * @returns {string} The expected filename
 */
const generateGalleryFilename = (promptKey) => {
  const kebabCase = promptKeyToFilename(promptKey);
  return `sogni-photobooth-${kebabCase}-raw.jpg`;
};

/**
 * Loads all gallery images and converts them to photo objects
 * @param {Object} stylePrompts - The available style prompts
 * @returns {Promise<Array>} Array of photo objects for the gallery
 */
export const loadGalleryImages = async (stylePrompts) => {
  try {
    const galleryPhotos = [];
    
    // Create gallery photos for all prompts
    let photoIndex = 0;
    
    Object.keys(stylePrompts).forEach(promptKey => {
      // Skip special prompts
      if (['custom', 'random', 'randomMix', 'oneOfEach'].includes(promptKey)) {
        return;
      }
      
      // Generate the expected filename using strict naming convention
      const expectedFilename = generateGalleryFilename(promptKey);
      const imagePath = `/gallery/prompts/${expectedFilename}`;
      
      // Create photo object - will show placeholder if file doesn't exist
      const galleryPhoto = {
        id: `gallery-${promptKey}-${Date.now()}-${photoIndex}`,
        generating: false,
        loading: false,
        images: [imagePath],
        originalDataUrl: imagePath,
        newlyArrived: false,
        isOriginal: false,
        sourceType: 'gallery',
        // Add prompt information for the polaroid tag
        promptKey: promptKey,
        promptDisplay: styleIdToDisplay(promptKey),
        promptText: stylePrompts[promptKey] || '',
        // Assign frame numbers for equal distribution (1-6)
        taipeiFrameNumber: (photoIndex % 6) + 1,
        framePadding: 0,
        // Mark as gallery image to prevent custom frame application
        isGalleryImage: true,
        // Add expected filename for debugging
        expectedFilename: expectedFilename
      };
      
      galleryPhotos.push(galleryPhoto);
      photoIndex++;
    });

    console.log(`Created ${galleryPhotos.length} gallery photo objects using strict naming convention`);
    return galleryPhotos;
    
  } catch (error) {
    console.error('Error loading gallery images:', error);
    return [];
  }
};

/**
 * Checks if an image file exists at the given path
 * @param {string} imagePath - Path to the image
 * @returns {Promise<boolean>} True if image exists and loads successfully
 * 
 * Note: This function is kept for potential future use but is not used
 * in the gallery loading to avoid preloading delays
 */
export const checkImageExists = (imagePath) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imagePath;
  });
};

// Export the utility functions for use in renaming scripts
export { promptKeyToFilename, generateGalleryFilename };