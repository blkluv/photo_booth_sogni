/**
 * Handles photo enhancement using Sogni API
 */

/**
 * Enhances a photo using Sogni API
 * 
 * @param {Object} options
 * @param {Object} options.photo - Current photo object
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {number} options.subIndex - Sub-index of the image within the photo
 * @param {number} options.width - Target width for enhancement
 * @param {number} options.height - Target height for enhancement
 * @param {Object} options.sogniClient - Sogni client instance
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @param {(projectId: string | null) => void} options.onSetActiveProject - Callback to set active project reference
 * @returns {Promise<void>}
 */
export const enhancePhoto = async (options) => {
  const {
    photo,
    photoIndex,
    subIndex,
    width,
    height,
    sogniClient,
    setPhotos,
    onSetActiveProject
  } = options;

  try {
    // Get image data
    const imageUrl = photo.images[subIndex] || photo.originalDataUrl;
    const response = await fetch(imageUrl);
    const imageBlob = await response.blob();
    
    // Set loading state
    setPhotos(prev => {
      console.log(`[ENHANCE] Setting loading state for photo #${photoIndex}`);
      const updated = [...prev];
      
      // Store the original image if not already stored
      let originalImage = null;
      if (!updated[photoIndex].originalEnhancedImage) {
        originalImage = updated[photoIndex].images[subIndex] || updated[photoIndex].originalDataUrl;
      }
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: true,
        enhancing: true,
        progress: 0,
        error: null, // Clear any previous errors
        originalEnhancedImage: originalImage || updated[photoIndex].originalEnhancedImage // Store original for undo
      };
      return updated;
    });
    
    // Start enhancement
    const arrayBuffer = await imageBlob.arrayBuffer();
    console.log(`[ENHANCE] Creating enhancement project with Sogni API`, photo, width, height);
    
    // Check if we have the new backend proxy client or old direct SDK
    if (sogniClient.projects && typeof sogniClient.projects.create === 'function') {
      // Use the backend proxy client
      const project = await sogniClient.projects.create({
        modelId: "flux1-schnell-fp8",
        positivePrompt: `Detailed portrait, ${photo.positivePrompt || 'Portrait masterpiece'}`,
        sizePreset: 'custom',
        width,
        height,
        steps: 4,
        guidance: 1,
        numberOfImages: 1,
        startingImage: Array.from(new Uint8Array(arrayBuffer)),
        startingImageStrength: 0.75,
      });
      
      // Track progress
      onSetActiveProject(project.id);
      console.log(`[ENHANCE] Project created with ID: ${project.id}`);
      
      // Set up listeners for the backend proxy client
      project.on('progress', (progress) => {
        // Ensure progress is a number between 0-1
        const progressValue = typeof progress === 'number' ? progress : 
          (typeof progress === 'object' && progress.progress !== undefined) ? progress.progress : 0;
        
        console.log('Job progress full payload:', { jobId: project.id, progress: progressValue });
        const progressPercent = Math.floor(progressValue * 100);
        console.log(`[ENHANCE] Progress: ${progressPercent}%`);
        
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            progress: progressValue
          };
          return updated;
        });
      });
      
      // Listen for jobCompleted event (not completed)
      project.on('jobCompleted', (job) => {
        console.log('Enhance jobCompleted full payload:', job);
        onSetActiveProject(null);
        if (job.resultUrl) {
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            const updatedImages = [...updated[photoIndex].images];
            const indexToReplace = subIndex < updatedImages.length ? subIndex : updatedImages.length - 1;
            if (indexToReplace >= 0) {
              updatedImages[indexToReplace] = job.resultUrl;
            } else {
              updatedImages.push(job.resultUrl);
            }
            updated[photoIndex] = {
              ...updated[photoIndex],
              loading: false,
              enhancing: false,
              images: updatedImages,
              newlyArrived: true,
              enhanced: true
            };
            return updated;
          });
        } else {
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            updated[photoIndex] = {
              ...updated[photoIndex],
              loading: false,
              enhancing: false,
              error: 'No enhanced image generated'
            };
            return updated;
          });
        }
      });

      // Listen for jobFailed event (not failed)
      project.on('jobFailed', (job) => {
        console.error('Enhance jobFailed full payload:', job);
        onSetActiveProject(null);
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            loading: false,
            enhancing: false,
            error: 'Enhancement failed'
          };
          return updated;
        });
      });
    } else {
      throw new Error("Sogni client is not initialized correctly");
    }
  } catch (error) {
    console.error(`[ENHANCE] Error enhancing image:`, error);
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: false,
        enhancing: false,
        error: error?.message || 'Enhancement failed'
      };
      return updated;
    });
    
    // Add visual indicator of failure
    alert(`Enhancement error: ${error?.message || 'Unknown error'}`);
  }
};

/**
 * Undoes enhancement by restoring the original image
 * 
 * @param {Object} options
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {number} options.subIndex - Sub-index of the image within the photo
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @returns {void}
 */
export const undoEnhancement = ({ photoIndex, subIndex, setPhotos }) => {
  console.log(`[ENHANCE] Undoing enhancement for photo #${photoIndex}`);
  setPhotos(prev => {
    const updated = [...prev];
    const photo = updated[photoIndex];
    
    // Restore the original image if we have it
    if (photo.originalEnhancedImage) {
      const updatedImages = [...photo.images];
      // Make sure we have a valid subIndex
      const indexToRestore = subIndex < updatedImages.length 
        ? subIndex 
        : updatedImages.length - 1;
      
      if (indexToRestore >= 0) {
        updatedImages[indexToRestore] = photo.originalEnhancedImage;
      }
      
      updated[photoIndex] = {
        ...photo,
        enhanced: false,
        images: updatedImages
      };
    } else {
      // If we don't have the original, just remove the enhanced flag
      updated[photoIndex] = {
        ...photo,
        enhanced: false
      };
    }
    
    return updated;
  });
}; 