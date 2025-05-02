import { SogniClient } from "@sogni-ai/sogni-client";
import { getRandomStyle, getRandomMixPrompts, loadPrompts } from './prompts';
import { getCustomDimensions } from '../utils/imageProcessing';

/**
 * Generates images from a photo blob using Sogni API
 * 
 * @param {Object} options
 * @param {Blob} options.photoBlob - The blob of the photo to process
 * @param {number} options.photoIndex - Index in the photos array
 * @param {string} options.dataUrl - Data URL of the photo
 * @param {string} options.selectedStyle - Selected style ID
 * @param {string} options.customPrompt - Custom prompt text for custom style
 * @param {number} options.numberImages - Number of images to generate
 * @param {string} options.selectedModel - Model ID to use
 * @param {number} options.promptGuidance - Guidance value for prompt
 * @param {number} options.controlNetStrength - Strength for control net
 * @param {number} options.controlNetGuidanceEnd - Guidance end value
 * @param {boolean} options.keepOriginalPhoto - Whether to keep the original photo
 * @param {Object} options.defaultStylePrompts - Style prompts object
 * @param {SogniClient} options.sogniClient - The Sogni client instance
 * @param {Object} options.callbacks - Callback functions
 * @returns {Promise<void>}
 */
export const generateFromBlob = async (options) => {
  const {
    photoBlob,
    photoIndex,
    dataUrl,
    selectedStyle,
    customPrompt,
    numberImages,
    selectedModel,
    promptGuidance,
    controlNetStrength,
    controlNetGuidanceEnd,
    keepOriginalPhoto,
    defaultStylePrompts,
    sogniClient,
    callbacks = {}
  } = options;

  const {
    onSetLastPhotoData = () => {},
    onUpdateProjectState = () => {},
    onUpdatePhotos = () => {},
    onProjectComplete = () => {},
    onError = () => {},
    onPrepareUI = () => {},
  } = callbacks;

  try {
    // Save the last used photo data for "More" button functionality
    onSetLastPhotoData({ blob: photoBlob, dataUrl });
    
    // Check if we're on iOS - we'll need special handling
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    
    // Get the style prompt, generating random if selected
    let stylePrompt;
    
    if (selectedStyle === 'custom') {
      stylePrompt = customPrompt || 'A custom style portrait';
    } else if (selectedStyle === 'random') {
      // Ensure we have prompts loaded
      if (Object.keys(defaultStylePrompts).length <= 2) {
        // Reload prompts if they're not available
        try {
          const prompts = await loadPrompts();
          if (Object.keys(prompts).length > 0) {
            defaultStylePrompts = {
              custom: '',
              ...Object.fromEntries(
                Object.entries(prompts)
                  .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
              )
            };
            defaultStylePrompts.random = `{${Object.values(prompts).join('|')}}`;
          }
        } catch (error) {
          console.error('Error loading prompts on demand:', error);
        }
      }
      
      const randomStyle = getRandomStyle(defaultStylePrompts);
      stylePrompt = defaultStylePrompts[randomStyle] || 'A creative portrait style';
    } else if (selectedStyle === 'randomMix') {
      stylePrompt = getRandomMixPrompts(numberImages, defaultStylePrompts);
    } else {
      stylePrompt = defaultStylePrompts[selectedStyle] || 'A creative portrait style';
    }
    
    console.log('Style prompt:', stylePrompt);
    
    // Initialize project state
    const projectState = {
      currentPhotoIndex: photoIndex,
      pendingCompletions: new Map(),
      jobMap: new Map()
    };
    onUpdateProjectState(projectState);

    // Initialize photos with loading placeholders
    onUpdatePhotos(previousPhotos => {
      // Check if there are any existing photos with progress we need to preserve
      const existingProcessingPhotos = previousPhotos.filter(photo => 
        photo.generating && photo.jobId && photo.progress
      );
      console.log('Existing processing photos to preserve:', existingProcessingPhotos);
      
      const newPhotos = [];
      if (keepOriginalPhoto) {
        newPhotos.push({
          id: Date.now(),
          generating: false,
          loading: false,
          images: [dataUrl],
          originalDataUrl: dataUrl,
          newlyArrived: false,
          isOriginal: true
        });
      }
      
      for (let index = 0; index < numberImages; index++) {
        // Check if we have an existing photo in process
        const existingPhoto = existingProcessingPhotos[index];
        
        if (existingPhoto && existingPhoto.jobId) {
          console.log(`Preserving existing photo data for index ${index}:`, existingPhoto);
          newPhotos.push({
            ...existingPhoto,
            originalDataUrl: existingPhoto.originalDataUrl || dataUrl
          });
        } else {
          newPhotos.push({
            id: Date.now() + index + 1,
            generating: true,
            loading: true,
            progress: 0,
            images: [],
            error: null,
            originalDataUrl: dataUrl, // Use reference photo as placeholder
            newlyArrived: false,
            statusText: 'Finding Art Robot...'
          });
        }
      }
      return newPhotos;
    });

    // Prepare UI for generation
    onPrepareUI();
    
    // For iOS, ensure the blob is fully ready before sending to API
    let processedBlob = photoBlob;
    if (isIOS) {
      console.log("iOS detected, ensuring blob is properly processed");
      // Convert to array buffer and back to ensure it's fully loaded
      const arrayBuffer = await photoBlob.arrayBuffer();
      processedBlob = new Blob([arrayBuffer], {type: 'image/png'});
      
      // Give iOS a moment to fully process the image
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Create job tracking map and set of handled jobs
    const handledJobs = new Set();

    // Helper to set up job progress handler
    const setupJobProgress = (job, jobIndex) => {
      console.log('Setting up job progress handler for job:', job.id);
      
      // Only set up if we haven't already handled this job
      if (!handledJobs.has(job.id)) {
        projectState.jobMap.set(job.id, jobIndex);
        handledJobs.add(job.id);
        console.log('Job mapping created:', job.id, 'to index', jobIndex);
        
        job.on('progress', (progress) => {
          console.log('Job progress event received:', job.id, progress);
          const offset = keepOriginalPhoto ? 1 : 0;
          const photoIndex = jobIndex + offset;
          console.log('Updating photo at index:', photoIndex);
          
          onUpdatePhotos(previousPhotos => {
            const updated = [...previousPhotos];
            if (!updated[photoIndex]) {
              console.warn('No photo at index', photoIndex);
              return previousPhotos;
            }
            
            console.log('Current photo state:', updated[photoIndex]);
            updated[photoIndex] = {
              ...updated[photoIndex],
              generating: true,
              loading: true,
              progress,
              statusText: `${job.workerName} processing... ${Math.floor(progress)}%`,
              jobId: job.id
            };
            console.log('Updated photo state:', updated[photoIndex]);
            return updated;
          });
        });
      } else {
        console.log('Job already handled:', job.id);
      }
    };
    
    // Process the array buffer for iOS as a special precaution
    const blobArrayBuffer = await processedBlob.arrayBuffer();
    
    // Get dimensions based on current orientation
    const { width, height } = getCustomDimensions();
    
    // Create the project
    const project = await sogniClient.projects.create({
      modelId: selectedModel,
      positivePrompt: stylePrompt,
      sizePreset: 'custom',
      width,
      height,
      steps: 7,
      guidance: promptGuidance,
      numberOfImages: numberImages,
      scheduler: 'DPM Solver Multistep (DPM-Solver++)',
      timeStepSpacing: 'Karras',
      controlNet: {
        name: 'instantid',
        image: new Uint8Array(blobArrayBuffer),
        strength: controlNetStrength,
        mode: 'balanced',
        guidanceStart: 0,
        guidanceEnd: controlNetGuidanceEnd,
      }
    });

    onProjectComplete(project.id);
    console.log('Project created:', project.id, 'with jobs:', project.jobs);
    console.log('Initializing job map for project', project.id);

    // Set up handlers for any jobs that exist immediately
    console.log('Project jobs to set up:', project.jobs);
    if (project.jobs && project.jobs.length > 0) {
      project.jobs.forEach((job, index) => {
        console.log(`Initializing job ${job.id} for index ${index}`);
        // Initialize the job map with the job ID -> photo index mapping
        projectState.jobMap.set(job.id, index);
        // Set up progress handler
        setupJobProgress(job, index);
      });
    }

    // Watch for new jobs
    project.on('updated', (keys) => {
      if (keys.includes('jobs')) {
        project.jobs.forEach((job, index) => setupJobProgress(job, index));
      }
    });

    // Project level events
    project.on('progress', (progress) => {
      console.log('Project progress:', progress);
    });

    project.on('completed', (urls) => {
      console.log('Project completed:', urls);
      onProjectComplete(null); // Clear active project reference when complete
      if (urls.length === 0) return;
      
      for (const [index, url] of urls.entries()) {
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = index + offset;
        
        onUpdatePhotos(previousPhotos => {
          const updated = [...previousPhotos];
          if (!updated[photoIndex]) return previousPhotos;
          
          // Check if this photo has a permanent error - if so, don't update it
          if (updated[photoIndex].permanentError) {
            console.log(`Photo at index ${photoIndex} has permanent error, skipping update`);
            return previousPhotos;
          }
          
          if (updated[photoIndex].loading || updated[photoIndex].images.length === 0) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              generating: false,
              loading: false,
              images: [url],
              newlyArrived: true,
              statusText: `#${photoIndex-keepOriginalPhoto+1}`
            };
          }
          return updated;
        });
      }
    });

    project.on('failed', (error) => {
      console.error('Project failed:', error);
      onProjectComplete(null); // Clear active project reference when failed
    });

    // Individual job events
    project.on('jobCompleted', (job) => {
      console.log('Job completed:', job.id, job.resultUrl);
      if (!job.resultUrl) {
        console.error('Missing resultUrl for job:', job.id);
        return;
      }
      
      const jobIndex = projectState.jobMap.get(job.id);
      console.log('Looking up job index for completed job:', job.id, 'found:', jobIndex, 'in map:', projectState.jobMap);
      if (jobIndex === undefined) {
        console.error('Unknown job completed:', job.id);
        return;
      }
      
      const offset = keepOriginalPhoto ? 1 : 0;
      const photoIndex = jobIndex + offset;
      console.log(`Loading image for job ${job.id} into box ${photoIndex}, keepOriginalPhoto: ${keepOriginalPhoto}, offset: ${offset}`);
      
      const img = new Image();
      img.addEventListener('load', () => {
        onUpdatePhotos(previousPhotos => {
          const updated = [...previousPhotos];
          if (!updated[photoIndex]) {
            console.error(`No photo box found at index ${photoIndex}`);
            return previousPhotos;
          }
          
          // Check if this photo has a permanent error - if so, don't update it
          if (updated[photoIndex].permanentError) {
            console.log(`Photo at index ${photoIndex} has permanent error, skipping update`);
            return previousPhotos;
          }
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            progress: 100,
            images: [job.resultUrl],
            newlyArrived: true,
            statusText: `#${photoIndex-keepOriginalPhoto+1}`
          };
          
          // Check if all photos are done generating
          const stillGenerating = updated.some(photo => photo.generating);
          if (!stillGenerating) {
            // All photos are done, clear the active project
            console.log('All jobs completed, clearing active project');
            onProjectComplete(null);
          }
          
          return updated;
        });
      });
      img.src = job.resultUrl;
    });

    project.on('jobFailed', (job) => {
      console.error('Job failed:', job.id, job.error);
      const jobIndex = projectState.jobMap.get(job.id);
      if (jobIndex === undefined) return;
      
      const offset = keepOriginalPhoto ? 1 : 0;
      const photoIndex = jobIndex + offset;
      
      onUpdatePhotos(previousPhotos => {
        const updated = [...previousPhotos];
        if (!updated[photoIndex]) return previousPhotos;
        
        updated[photoIndex] = {
          ...updated[photoIndex],
          generating: false,
          loading: false,
          error: typeof job.error === 'object' ? 'Generation failed' : (job.error || 'Generation failed'),
          permanentError: true, // Add flag to prevent overwriting by other successful jobs
          statusText: 'Failed'
        };
        
        // Check if all photos are done generating
        const stillGenerating = updated.some(photo => photo.generating);
        if (!stillGenerating) {
          // All photos are done, clear the active project
          console.log('All jobs failed or completed, clearing active project');
          onProjectComplete(null);
        }
        
        return updated;
      });
    });

  } catch (error) {
    console.error('Generation failed:', error);
    
    if (error && error.code === 4015) {
      console.warn("Socket error (4015). Re-initializing Sogni.");
      onError(error);
    }

    onUpdatePhotos(previousPhotos => {
      const updated = [];
      if (keepOriginalPhoto) {
        const originalPhoto = previousPhotos.find(p => p.isOriginal);
        if (originalPhoto) {
          updated.push(originalPhoto);
        }
      }
      
      for (let index = 0; index < numberImages; index++) {
        updated.push({
          id: Date.now() + index,
          generating: false,
          loading: false,
          images: [],
          error: `Error: ${error.message || error}`,
          originalDataUrl: dataUrl, // Use reference photo as placeholder
          permanentError: true // Add permanent error flag
        });
      }
      return updated;
    });
    
    // Still show photo grid on error
    onPrepareUI();
  }
}; 