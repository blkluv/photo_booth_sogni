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
    outputFormat,
    clearFrameCache,
    // onSetActiveProject - not used for enhancement to avoid interfering with main generation
  } = options;

  let timeoutId; // Declare timeoutId in outer scope

  try {
    console.log(`🚀 [ENHANCE-DEBUG] UPDATED PhotoEnhancer.js loaded! Starting enhancement for photo #${photoIndex}`, { photo, width, height, outputFormat });
    console.log(`[ENHANCE] Photo state:`, {
      enhanced: photo.enhanced,
      hasOriginalEnhancedImage: !!photo.originalEnhancedImage,
      imagesLength: photo.images?.length,
      hasOriginalDataUrl: !!photo.originalDataUrl
    });
    
    // Get image data - always use the original generated image for enhancement, not the current (potentially enhanced) image
    // Priority: 1) stored original from first enhancement, 2) generated image from grid, 3) fallback to camera original
    const imageUrl = photo.originalEnhancedImage || photo.images[subIndex] || photo.originalDataUrl;
    console.log(`[ENHANCE] Using image URL: ${imageUrl?.substring(0, 100)}...`);
    console.log(`[ENHANCE] Image source priority: originalEnhancedImage=${!!photo.originalEnhancedImage}, images[${subIndex}]=${!!photo.images[subIndex]}, originalDataUrl=${!!photo.originalDataUrl}`);
    
    if (!imageUrl) {
      throw new Error(`No image URL found for enhancement. Photo #${photoIndex}, subIndex: ${subIndex}`);
    }
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const imageBlob = await response.blob();
    console.log(`[ENHANCE] Image blob size: ${imageBlob.size} bytes`);
    
    // Set loading state
    setPhotos(prev => {
      console.log(`[ENHANCE] Setting loading state for photo #${photoIndex}`);
      const updated = [...prev];
      
      // Store the original image if not already stored
      let originalImage = null;
      if (!updated[photoIndex].originalEnhancedImage) {
        // Store the generated image from the grid (not the raw camera image) for consistent enhancement
        originalImage = updated[photoIndex].images[subIndex] || updated[photoIndex].originalDataUrl;
        console.log(`[ENHANCE] Storing original generated image for first enhancement: ${originalImage?.substring(0, 100)}...`);
        console.log(`[ENHANCE] Original source priority: images[${subIndex}]=${!!updated[photoIndex].images[subIndex]}, originalDataUrl=${!!updated[photoIndex].originalDataUrl}`);
      } else {
        console.log(`[ENHANCE] Original image already stored: ${updated[photoIndex].originalEnhancedImage?.substring(0, 100)}...`);
      }
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: true,
        enhancing: true,
        progress: 0,
        enhancementProgress: 0,
        error: null, // Clear any previous errors
        enhancementError: null, // Clear any previous enhancement errors
        originalEnhancedImage: originalImage || updated[photoIndex].originalEnhancedImage, // Store original for undo
      };
      return updated;
    });

    // Set a timeout fallback to reset enhancing state if something goes wrong
    timeoutId = setTimeout(() => {
      console.warn(`[ENHANCE] Enhancement timeout reached for photo #${photoIndex}, resetting state`);
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        updated[photoIndex] = {
          ...updated[photoIndex],
          loading: false,
          enhancing: false,
          error: 'ENHANCEMENT FAILED: timeout',
          enhancementError: 'Enhancement timed out. Please try again.'
        };
        return updated;
      });
    }, 120000); // 2 minute timeout
    
    // Start enhancement
    const arrayBuffer = await imageBlob.arrayBuffer();
    console.log(`[ENHANCE] Creating enhancement project with Sogni API`, { photoIndex, width, height, arrayBufferSize: arrayBuffer.byteLength });
    
    if (!sogniClient || !sogniClient.projects || !sogniClient.projects.create) {
      throw new Error('Sogni client is not properly initialized');
    }
    
    // Use the same API path as regular generation to get proper upload handling
    const project = await sogniClient.projects.create({
      testnet: false,
      tokenType: 'spark',
      modelId: "flux1-krea-dev_fp8_scaled",
      positivePrompt: `(Extra detailed and contrasty portrait) ${photo.positivePrompt || 'Portrait masterpiece'}`,
      sizePreset: 'custom',
      width,
      height,
      steps: 30,
      guidance: 5.5,
      numberOfImages: 1,
      outputFormat: outputFormat || 'jpg', // Use settings from context
      sensitiveContentFilter: false, // enhance jobs are not sensitive content
      // Note: Flux models use their own optimal scheduler/timeStepSpacing defaults
      // so we don't override them here
      startingImage: new Uint8Array(arrayBuffer),
      startingImageStrength: 0.75,
      sourceType: 'enhancement', // Add sourceType for backend tracking
      // scheduler: 'Euler a',
    });
      
      // Wait for upload completion like regular generation does
      await new Promise((resolve) => {
        let uploadCompleted = false;
        
        const uploadCompleteHandler = () => {
          if (!uploadCompleted) {
            uploadCompleted = true;
            console.log(`[ENHANCE] Starting image upload completed, enhancement can proceed`);
            project.off('uploadComplete', uploadCompleteHandler);
            resolve();
          }
        };
        
        // Listen for upload completion
        project.on('uploadComplete', uploadCompleteHandler);
        
        // Fallback timeout in case upload complete event doesn't fire
        setTimeout(() => {
          if (!uploadCompleted) {
            uploadCompleted = true;
            console.log(`[ENHANCE] Upload timeout reached, proceeding with enhancement`);
            project.off('uploadComplete', uploadCompleteHandler);
            resolve();
          }
        }, 5000); // 5 second timeout
      });
      
      // Don't set activeProjectReference for enhancement to avoid interfering with main generation
      // onSetActiveProject(project.id); // Commented out to prevent interference
      console.log(`[ENHANCE] Enhancement project created with ID: ${project.id} (not setting as active to avoid interference)`);
      
      // Now update with project ID after creation
      setPhotos(prev => {
        const updated = [...prev];
        if (!updated[photoIndex]) return prev;
        
        updated[photoIndex] = {
          ...updated[photoIndex],
          projectId: project.id // Store the project ID for proper failure handling
        };
        return updated;
      });
      
      // Set up listeners for the backend proxy client - listen to job events like main generation
      project.on('job', (event) => {
        const { type, jobId, progress } = event;
        
        console.log(`[ENHANCE] Job event received:`, { type, jobId, progress, projectId: project.id });
        
        // Handle progress events
        if (type === 'progress' && progress !== undefined) {
          const progressValue = typeof progress === 'number' ? progress : 0;
          const progressPercent = Math.floor(progressValue * 100);
          console.log(`[ENHANCE] Job progress: ${progressPercent}%`);
          
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            
            updated[photoIndex] = {
              ...updated[photoIndex],
              progress: progressValue,
              enhancementProgress: progressValue
            };
            return updated;
          });
        }
      });
      
      // Also listen to project-level progress events as fallback
      project.on('progress', (progress) => {
        // Ensure progress is a number between 0-1
        const progressValue = typeof progress === 'number' ? progress : 
          (typeof progress === 'object' && progress.progress !== undefined) ? progress.progress : 0;
        
        console.log('[ENHANCE] Project progress full payload:', { projectId: project.id, progress: progressValue });
        const progressPercent = Math.floor(progressValue * 100);
        console.log(`[ENHANCE] Project progress: ${progressPercent}%`);
        
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            progress: progressValue,
            enhancementProgress: progressValue
          };
          return updated;
        });
      });
      
      // Listen for jobCompleted event (not completed)
      project.on('jobCompleted', (job) => {
        console.log('Enhance jobCompleted full payload:', job);
        // Don't clear activeProjectReference since we didn't set it for enhancement
        // onSetActiveProject(null); // Commented out since we don't set it
        if (job.resultUrl) {
          // Clear timeout since enhancement is completing
          clearTimeout(timeoutId);
          
          // Preload the enhanced image to prevent pixelation during loading
          const preloadImage = new Image();
          preloadImage.onload = () => {
            console.log(`[ENHANCE] Enhanced image preloaded successfully: ${job.resultUrl.substring(0, 100)}...`);
            
            // Clear frame cache for this photo since the image has changed
            if (clearFrameCache) {
              clearFrameCache(photoIndex);
            }
            
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
                enhanced: true,
                enhancementProgress: 1,
                enhancementError: null,
                canRedo: false // Reset redo state when new enhancement completes
              };
              return updated;
            });
          };
          
          preloadImage.onerror = () => {
            console.error(`[ENHANCE] Failed to preload enhanced image: ${job.resultUrl}`);
            // Still update the state even if preload fails
            if (clearFrameCache) {
              clearFrameCache(photoIndex);
            }
            
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
          };
          
          // Start preloading the image
          preloadImage.src = job.resultUrl;
        } else {
          // Clear timeout since enhancement is completing (even with error)
          clearTimeout(timeoutId);
          
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
        // Clear timeout since enhancement is failing
        clearTimeout(timeoutId);
        // Don't clear activeProjectReference since we didn't set it for enhancement
        // onSetActiveProject(null); // Commented out since we don't set it
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          updated[photoIndex] = {
            ...updated[photoIndex],
            loading: false,
            enhancing: false,
            error: 'ENHANCEMENT FAILED: processing error',
            enhancementError: 'Enhancement failed during processing. Please try again.'
          };
          return updated;
        });
      });
      
  } catch (error) {
    console.error(`[ENHANCE] Error enhancing image:`, error);
    // Clear timeout since enhancement is failing
    clearTimeout(timeoutId);
    
    setPhotos(prev => {
      const updated = [...prev];
      if (!updated[photoIndex]) return prev;
      
      updated[photoIndex] = {
        ...updated[photoIndex],
        loading: false,
        enhancing: false,
        error: error?.message && error.message.includes('Insufficient') ? 'ENHANCEMENT FAILED: replenish tokens' : 'ENHANCEMENT FAILED: processing error',
        enhancementError: error?.message && error.message.includes('Insufficient') ? 'Insufficient tokens. Please replenish your account.' : `Enhancement failed: ${error?.message || 'Unknown error'}`
      };
      return updated;
    });
    
    // Error message is now displayed inline in the UI instead of alert
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
export const undoEnhancement = ({ photoIndex, subIndex, setPhotos, clearFrameCache }) => {
  console.log(`[ENHANCE] Undoing enhancement for photo #${photoIndex}`);
  
  // Clear frame cache for this photo since the image is changing back
  if (clearFrameCache) {
    clearFrameCache(photoIndex);
  }
  setPhotos(prev => {
    const updated = [...prev];
    const photo = updated[photoIndex];
    
    // Restore the original image if we have it
    if (photo.originalEnhancedImage) {
      console.log(`[ENHANCE] Restoring original image: ${photo.originalEnhancedImage.substring(0, 100)}...`);
      const updatedImages = [...photo.images];
      console.log(`[ENHANCE] Current enhanced image being replaced: ${updatedImages[subIndex]?.substring(0, 100)}...`);
      
      // Make sure we have a valid subIndex
      const indexToRestore = subIndex < updatedImages.length 
        ? subIndex 
        : updatedImages.length - 1;
      
      // Store the enhanced image URL for redo functionality BEFORE restoring
      const enhancedImageUrl = indexToRestore >= 0 ? updatedImages[indexToRestore] : null;
      
      if (indexToRestore >= 0) {
        updatedImages[indexToRestore] = photo.originalEnhancedImage;
        console.log(`[ENHANCE] Restored image at index ${indexToRestore}`);
      }
      
      updated[photoIndex] = {
        ...photo,
        enhanced: false,
        images: updatedImages,
        canRedo: true,
        enhancedImageUrl: enhancedImageUrl, // Store for redo
        enhancementError: null // Clear any error when undoing
        // Keep originalEnhancedImage for future enhancements
      };
    } else {
      // If we don't have the original, just remove the enhanced flag
      updated[photoIndex] = {
        ...photo,
        enhanced: false,
        canRedo: false,
        enhancementError: null
      };
    }
    
    return updated;
  });
};

/**
 * Redoes enhancement by restoring the previously enhanced image
 * 
 * @param {Object} options
 * @param {number} options.photoIndex - Index of the photo in the photos array
 * @param {number} options.subIndex - Sub-index of the image within the photo
 * @param {(updater: (prev: any[]) => any[]) => void} options.setPhotos - React setState function for photos
 * @returns {void}
 */
export const redoEnhancement = ({ photoIndex, subIndex, setPhotos, clearFrameCache }) => {
  console.log(`[ENHANCE] Redoing enhancement for photo #${photoIndex}`);
  
  // Clear frame cache for this photo since the image is changing
  if (clearFrameCache) {
    clearFrameCache(photoIndex);
  }
  
  setPhotos(prev => {
    const updated = [...prev];
    const photo = updated[photoIndex];
    
    // Restore the enhanced image if we have it
    if (photo.enhancedImageUrl && photo.canRedo) {
      console.log(`[ENHANCE] Restoring enhanced image: ${photo.enhancedImageUrl.substring(0, 100)}...`);
      const updatedImages = [...photo.images];
      
      // Make sure we have a valid subIndex
      const indexToRestore = subIndex < updatedImages.length 
        ? subIndex 
        : updatedImages.length - 1;
      
      if (indexToRestore >= 0) {
        updatedImages[indexToRestore] = photo.enhancedImageUrl;
        console.log(`[ENHANCE] Restored enhanced image at index ${indexToRestore}`);
      }
      
      updated[photoIndex] = {
        ...photo,
        enhanced: true,
        images: updatedImages,
        canRedo: false, // Can't redo again until next undo
        enhancementError: null
      };
    }
    
    return updated;
  });
}; 