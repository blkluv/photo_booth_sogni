import React, { useRef, useEffect, useState, useCallback, useMemo, useReducer } from 'react';
import { API_CONFIG } from './config/cors';
import { SOGNI_URLS, DEFAULT_SETTINGS, modelOptions, getModelOptions, getValidModelValue, defaultStylePrompts as initialStylePrompts } from './constants/settings';
import { photoThoughts, randomThoughts } from './constants/thoughts';
import { getSettingFromCookie, saveSettingsToCookies } from './utils/cookies';
import { generateUUID } from './utils';
import { getCustomDimensions, resizeDataUrl, describeImage, centerCropImage, blobToDataURL } from './utils/imageProcessing';
import { getPreviousPhotoIndex, getNextPhotoIndex, goToPreviousPhoto, goToNextPhoto } from './utils/photoNavigation';
import { loadPrompts, initializeStylePrompts, getRandomStyle, getRandomMixPrompts } from './services/prompts';
import { initializeSogniClient } from './services/sogni';
import { enhancePhoto, undoEnhancement } from './services/PhotoEnhancer';
import clickSound from './click.mp3';
import cameraWindSound from './camera-wind.mp3';
import slothicornImage from './slothicorn-camera.png';
import light1Image from './light1.png';
import light2Image from './light2.png';
import './App.css';
import promptsData from './prompts.json';
import ReactDOM from 'react-dom';
import CameraView from './components/camera/CameraView';
import CameraStartMenu from './components/camera/CameraStartMenu';
import ControlPanel from './components/ControlPanel';
import StyleDropdown from './components/shared/StyleDropdown';
import { AppProvider, useApp } from './context/AppContext';

// Remove cookie utility functions (already imported)

// Remove loadPrompts function (already imported)

// Remove getCustomDimensions function (already imported)

// Remove resizeDataUrl function (already imported)

// Remove describeImage function (already imported)

// Remove generateUUID function (already imported)

// Remove centerCropImage function (already imported)

const App = () => {
  const videoReference = useRef(null);
  const canvasReference = useRef(null);
  const shutterSoundReference = useRef(null);
  const cameraWindSoundReference = useRef(null);
  const slothicornReference = useRef(null);

  // Style selection -- default to what's in cookies
  const [selectedStyle, setSelectedStyle] = useState(getSettingFromCookie('selectedStyle', DEFAULT_SETTINGS.selectedStyle));
  const [customPrompt, setCustomPrompt] = useState(getSettingFromCookie('customPrompt', ''));
  const [loadedImages, setLoadedImages] = useState({});
  
  // Add state for style prompts instead of modifying the imported constant
  const [stylePrompts, setStylePrompts] = useState(initialStylePrompts);

  // Info modal state - adding back the missing state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showRetakeModal, setShowRetakeModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [showPhotoGrid, setShowPhotoGrid] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [showCameraError, setShowCameraError] = useState(false);
  const [showImageError, setShowImageError] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Photos array
  // Each => { id, generating, images: string[], error, originalDataUrl?, newlyArrived?: boolean, generationCountdown?: number }
  const [photos, setPhotos] = useState([]);

  // Index of currently selected photo (null => show webcam)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  // Which sub-image are we showing from that photo?
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);
  // Remember last rendered index for toggling with spacebar
  const [lastViewedIndex, setLastViewedIndex] = useState(0);

  // Countdown 3..2..1 for shutter
  const [countdown, setCountdown] = useState(0);
  // Show flash overlay
  const [showFlash, setShowFlash] = useState(false);

  // advanced settings
  const [showSettings, setShowSettings] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(getSettingFromCookie('flashEnabled', DEFAULT_SETTINGS.flashEnabled));
  // Removed the single `realism` state in favor of styleRealism
  const [keepOriginalPhoto, setKeepOriginalPhoto] = useState(getSettingFromCookie('keepOriginalPhoto', DEFAULT_SETTINGS.keepOriginalPhoto));

  // Sogni
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // Camera devices
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(null);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  // Add missing state variables for camera stream
  const [isStreamStarted, setIsStreamStarted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // State for orientation handler cleanup
  const [orientationHandler, setOrientationHandler] = useState(null);

  // Determine the desired dimensions for Sogni (and camera constraints)
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions();

  // Drag-and-drop state
  const [dragActive, setDragActive] = useState(false);

  // Add state to store the last used photo blob and data URL for "More" button
  const [lastPhotoData, setLastPhotoData] = useState({ blob: null, dataUrl: null });

  // Add cleanup for orientation handler when component unmounts
  useEffect(() => {
    return () => {
      if (orientationHandler) {
        window.removeEventListener('orientationchange', orientationHandler);
      }
    };
  }, [orientationHandler]);

  // Update the useEffect that loads prompts
  useEffect(() => {
    // Try to load prompts from both import and fetch
    loadPrompts().then(prompts => {
      if (Object.keys(prompts).length > 0) {
        console.log('Successfully loaded prompts on component mount, loaded styles:', Object.keys(prompts).length);
        
        // Update the state variable instead of modifying the imported constant
        setStylePrompts(prev => {
          const newStylePrompts = {
            custom: '',
            ...Object.fromEntries(
              Object.entries(prompts)
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            )
          };
          
          // Add random style that uses all prompts
          newStylePrompts.random = `{${Object.values(prompts).join('|')}}`;
          
          return newStylePrompts;
        });
      } else {
        console.warn('Failed to load prompts from import or fetch');
      }
    }).catch(error => {
      console.error('Error loading prompts on component mount:', error);
    });
  }, []);

  // First, let's create a proper job tracking map at the top of the App component:
  const jobMapReference = useRef(new Map());

  // First, let's track project setup progress properly
  const [projectSetupProgress, setProjectSetupProgress] = useState(0);

  // At the top of App component, add a new ref for tracking project state
  const projectStateReference = useRef({
    currentPhotoIndex: 0,
    jobs: new Map(), // Map<jobId, {index: number, status: string, resultUrl?: string}>
    startedJobs: new Set(), // Track which indices have started jobs
    completedJobs: new Map(), // Store completed jobs that arrive before start
    pendingCompletions: new Map() // Store completions that arrive before we have the mapping
  });
  
  // Add a ref for handled jobs
  const handledJobsReference = useRef(new Set());

  // Calculate aspect ratio for loading boxes
  const isPortrait = desiredHeight > desiredWidth;
  const thumbnailWidth = 220; // Wider for landscape
  const thumbnailHeight = 130; // Shorter for landscape

  // Add useEffect for checking scrollability at top level
  useEffect(() => {
    const checkScrollable = () => {
      const filmStrip = document.querySelector('.film-strip-container');
      if (filmStrip) {
        // Only show if scrollHeight is greater than clientHeight (scrollable)
        const isScrollable = filmStrip.scrollHeight > filmStrip.clientHeight;
        setShowScrollIndicator(isScrollable && photos.length > 8);
      }
    };
    
    // Check after content has rendered
    setTimeout(checkScrollable, 100);
    
    // Also check on window resize
    window.addEventListener('resize', checkScrollable);
    return () => window.removeEventListener('resize', checkScrollable);
  }, [photos.length, showPhotoGrid]);

  // At the top of App component, add new state variables - now loaded from cookies
  const [selectedModel, setSelectedModel] = useState(
    getValidModelValue(getSettingFromCookie('selectedModel', DEFAULT_SETTINGS.selectedModel))
  );
  const [numberImages, setNumberImages] = useState(getSettingFromCookie('numImages', DEFAULT_SETTINGS.numImages));
  const [promptGuidance, setPromptGuidance] = useState(getSettingFromCookie('promptGuidance', DEFAULT_SETTINGS.promptGuidance));
  const [controlNetStrength, setControlNetStrength] = useState(getSettingFromCookie('controlNetStrength', DEFAULT_SETTINGS.controlNetStrength));
  const [controlNetGuidanceEnd, setControlNetGuidanceEnd] = useState(getSettingFromCookie('controlNetGuidanceEnd', DEFAULT_SETTINGS.controlNetGuidanceEnd));

  // Add a state to control the visibility of the overlay panel
  const [showControlOverlay, setShowControlOverlay] = useState(false);
  // Add a state to control the custom dropdown visibility
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);

  // Add state for controlling the animation
  const [photoViewerClosing, setPhotoViewerClosing] = useState(false);

  // Remove unneeded slothicorn state variables
  // Keep only what we need for other parts of the code
  const [showSlothicorn, setShowSlothicorn] = useState(true); // Just keep this for possible toggling

  // Add state for film strip visibility
  const [showFilmStrip, setShowFilmStrip] = useState(true);

  // Add new state for button cooldown
  const [isPhotoButtonCooldown, setIsPhotoButtonCooldown] = useState(false);
  // Ref to track current project
  const activeProjectReference = useRef(null);

  // Add state for current thought
  const [currentThought, setCurrentThought] = useState(null);

  // Add debug state
  const [debugInfo, setDebugInfo] = useState('');

  // Update showThought function
  let thoughtInProgress = false;
  const showThought = useCallback(() => {
    if (thoughtInProgress) return;
    thoughtInProgress = true;
    // Select thoughts based on whether there's an active project
    const thoughts = activeProjectReference.current ? photoThoughts : randomThoughts;
    const randomThought = thoughts[Math.floor(Math.random() * thoughts.length)];
    const isLeftSide = Math.random() < 0.5;
    
    setCurrentThought({
      text: randomThought,
      position: isLeftSide 
        ? { left: 'calc(50% - 70px)', transform: 'translateX(-100%)', textAlign: 'right' }  // Left side: position + transform for right alignment
        : { left: 'calc(50% + 70px)', textAlign: 'left' }  // Right side: direct positioning
    });

    setTimeout(() => {
      setCurrentThought(null);
      thoughtInProgress = false;
    }, 4500);
  }, []);

  // Update timing in useEffect
  useEffect(() => {
    // Initial delay between 5-15 seconds
    const initialDelay = 5000 + Math.random() * 15_000;
    const firstThought = setTimeout(() => {
      showThought();
    }, initialDelay);

    // Set up interval for random thoughts
    const interval = setInterval(() => {
      if (selectedPhotoIndex === null) {
        showThought();
      }
    }, 18_000); // Fixed 18 second interval

    return () => {
      clearTimeout(firstThought);
      clearInterval(interval);
    };
  }, [showThought, selectedPhotoIndex]);

  // Camera aspect ratio useEffect
  useEffect(() => {
    const handleVideoLoaded = () => {
      if (videoReference.current) {
        const { videoWidth, videoHeight } = videoReference.current;
        if (videoWidth && videoHeight) {
          // Set CSS variable for camera aspect ratio
          document.documentElement.style.setProperty(
            '--camera-aspect-ratio', 
            `${videoWidth}/${videoHeight}`
          );
          console.log(`Camera aspect ratio set to ${videoWidth}/${videoHeight}`);
        }
      }
    };

    // Add event listener for when video metadata is loaded
    const videoElement = videoReference.current;
    if (videoElement) {
      videoElement.addEventListener('loadedmetadata', handleVideoLoaded);
      // If already loaded, set it now
      if (videoElement.videoWidth) {
        handleVideoLoaded();
      }
    }

    // Cleanup
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('loadedmetadata', handleVideoLoaded);
      }
    };
  }, [videoReference.current]);

  // Fix for iOS viewport height issues
  useEffect(() => {
    // First, set the value to the actual viewport height
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    // Set it initially
    setVh();
    
    // Update on orientation change or resize
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', () => {
      // Small delay to ensure new dimensions are available
      setTimeout(setVh, 100);
    });
    
    // On iOS, add a class to handle content safely with notches
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      
      // When showing the photo viewer, prevent background scrolling
      if (selectedPhotoIndex === null) {
        document.body.classList.remove('prevent-scroll');
      } else {
        document.body.classList.add('prevent-scroll');
      }
    }
    
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, [selectedPhotoIndex]);

  // Initialize the slothicorn
  useEffect(() => {
    // Ensure slothicorn is properly initialized
    if (slothicornReference.current) {
      // Just initialize the transition property to prevent abrupt changes
      slothicornReference.current.style.transition = 'none';
      
      // Force a reflow to ensure style is applied
      void slothicornReference.current.offsetHeight;
    }
  }, []);

  // Add state for backend connection errors
  const [backendError, setBackendError] = useState(null);

  // -------------------------
  //   Sogni initialization
  // -------------------------
  const initializeSogni = async () => {
    try {
      // Reset any previous errors
      setBackendError(null);
      
      const client = await initializeSogniClient();
      setSogniClient(client);
      setIsSogniReady(true);

      client.projects.on('swarmModels', (event) => {
        console.log('Swarm models event payload:', event);
      });

      client.projects.on('project', (event) => {
        console.log('Project event full payload:', event);
      });

      client.projects.on('job', (event) => {
        console.log('Job event full payload:', event);
        const { type, projectId, jobId, workerName } = event;
        if ((type === 'initiating' || type === 'started') && !handledJobsReference.current.has(jobId)) {
          handledJobsReference.current.add(jobId);
          setPhotos((prevPhotos) => {
            return prevPhotos.map((photo, index) => {
              if (index === projectStateReference.current.jobMap.get(jobId)) {
                const statusText = type === 'initiating' 
                  ? `${workerName} loading model...`
                  : `${workerName} starting job`;
                return {
                  ...photo,
                  statusText,
                  jobId,
                };
              }
              return photo;
            });
          });
        }
      });
    } catch (error) {
      console.error('Failed initializing Sogni client:', error);
      
      // Set a user-friendly error message
      if (error.message && error.message.includes('Failed to fetch')) {
        setBackendError('The backend server is not running. Please start it using "npm run server:dev" in a separate terminal.');
      } else if (error.message && error.message.includes('401')) {
        setBackendError('Authentication failed: Invalid Sogni credentials. Please update the server/.env file with valid credentials.');
      } else {
        setBackendError(`Error connecting to the Sogni service: ${error.message}`);
      }
    }
  };

  /**
   * Start the camera stream for a given deviceId or fallback.
   * Try to capture at appropriate dimensions based on device and orientation.
   */
  const startCamera = useCallback(async (deviceId) => {
    // Check if we're on mobile and iOS
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isPortrait = window.matchMedia("(orientation: portrait)").matches || window.innerHeight > window.innerWidth;
    
    console.log(`Camera setup - isMobile: ${isMobile}, isIOS: ${isIOS}, isPortrait: ${isPortrait}`);
    
    // Determine appropriate constraints based on device/orientation
    let constraints;
    
    if (isMobile) {
      // For mobile devices, use 9:7 aspect ratio or 7:9 for portrait
      const aspectRatio = isPortrait ? 7/9 : 9/7;
      
      // On iOS, don't specify aspectRatio as it causes issues
      if (isIOS) {
        constraints = deviceId
          ? {
              video: {
                deviceId,
                facingMode: isFrontCamera ? 'user' : 'environment',
                width: { ideal: isPortrait ? 896 : 1152 },
                height: { ideal: isPortrait ? 1152 : 896 }
              }
            }
          : {
              video: {
                facingMode: isFrontCamera ? 'user' : 'environment',
                width: { ideal: isPortrait ? 896 : 1152 },
                height: { ideal: isPortrait ? 1152 : 896 }
              }
            };
      } else {
        constraints = deviceId
          ? {
              video: {
                deviceId,
                facingMode: isFrontCamera ? 'user' : 'environment',
                width: { ideal: isPortrait ? 896 : 1152 },
                height: { ideal: isPortrait ? 1152 : 896 },
                aspectRatio: { ideal: aspectRatio }
              }
            }
          : {
              video: {
                facingMode: isFrontCamera ? 'user' : 'environment',
                width: { ideal: isPortrait ? 896 : 1152 },
                height: { ideal: isPortrait ? 1152 : 896 },
                aspectRatio: { ideal: aspectRatio }
              }
            };
      }
    } else {
      // For desktop
      constraints = deviceId
        ? {
            video: {
              deviceId,
              width: { ideal: desiredWidth },
              height: { ideal: desiredHeight },
            }
          }
        : {
            video: {
              facingMode: 'user',
              width: { ideal: desiredWidth },
              height: { ideal: desiredHeight },
            }
          };
    }
    
    try {
      // Stop any existing stream first
      if (videoReference.current && videoReference.current.srcObject) {
        const stream = videoReference.current.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }

      // Request camera access with our constraints
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Add iOS-specific class if needed
      if (isIOS) {
        document.body.classList.add('ios-device');
        
        // Add a slight delay to ensure video element is ready
        setTimeout(() => {
          if (videoReference.current) {
            // Set proper classes for iOS orientation handling
            if (isPortrait) {
              videoReference.current.classList.add('ios-fix');
            } else {
              videoReference.current.classList.remove('ios-fix');
            }
          }
        }, 100);
      }
      
      // Set the stream and autoplay
      if (videoReference.current) {
        videoReference.current.srcObject = stream;
        videoReference.current.muted = true;
        
        // Force play on video to ensure it starts on iOS
        const playPromise = videoReference.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Error playing video:', error);
            // Try again after user interaction
            setTimeout(() => {
              if (videoReference.current) {
                videoReference.current.play().catch(e => console.error('Still cannot play video', e));
              }
            }, 1000);
          });
        }
      }
      
      // Listen for orientation changes
      const handleOrientationChange = () => {
        const isPortrait = window.matchMedia("(orientation: portrait)").matches;
        
        if (videoReference.current) {
          if (isIOS) {
            if (isPortrait) {
              videoReference.current.classList.add('ios-fix');
            } else {
              videoReference.current.classList.remove('ios-fix');
            }
          }
        }
      };
      
      window.addEventListener('orientationchange', handleOrientationChange);
      // Store function for cleanup
      setOrientationHandler(() => handleOrientationChange);
      
      setIsStreamStarted(true);
      setCameraEnabled(true);
    } catch (error) {
      console.error('Failed to get camera access', error);
      setCameraEnabled(false);
      setIsStreamStarted(false);
    }
  }, [desiredWidth, desiredHeight, isFrontCamera]);

  /**
   * Enumerate devices and store them in state.
   */
  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevices);
    } catch (error) {
      console.warn('Error enumerating devices', error);
    }
  }, []);

  // Modified useEffect to start camera automatically
  useEffect(() => {
    const initializeCamera = async () => {
      await listCameras();
      // Initialize Sogni and start camera simultaneously
      await Promise.all([
        initializeSogni(),
        startCamera(selectedCameraDeviceId)
      ]);
    };
    
    initializeCamera();
  }, [listCameras, startCamera, selectedCameraDeviceId]);

  // If we return to camera, ensure the video is playing
  useEffect(() => {
    if (selectedPhotoIndex === null && videoReference.current) {
      console.log("Restarting video playback");
      // Add a small delay to ensure DOM updates before attempting to play
      setTimeout(() => {
        if (videoReference.current && videoReference.current.srcObject) {
          videoReference.current.play().catch(error => {
            console.warn("Video re-play error:", error);
            // On iOS, sometimes we need to restart the camera completely
            if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
              console.log("iOS device detected, restarting camera completely");
              startCamera(selectedCameraDeviceId);
            }
          });
        } else {
          console.log("Video ref or srcObject not available, restarting camera");
          // If for some reason the video stream is lost, restart it
          startCamera(selectedCameraDeviceId);
        }
      }, 100);
    }
  }, [selectedPhotoIndex, startCamera, selectedCameraDeviceId]);

  // Preload images for the selected photo
  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]) {
      for (const url of photos[selectedPhotoIndex].images) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [selectedPhotoIndex, photos]);

  // Add debugging for photos state changes
  /*
  useEffect(() => {
    console.log('Photos state updated:', photos.map(p => ({
      id: p.id,
      loading: p.loading,
      generating: p.generating,
      progress: p.progress || 0,
      images: p.images.length,
      error: p.error
    })));
  }, [photos]);
  */

  // Update the close photo handler to simplify it
  const handleClosePhoto = () => {
    setPhotoViewerClosing(true);
    // Wait for animation to complete before actually changing view
    setTimeout(() => {
      setPhotoViewerClosing(false);
      setSelectedPhotoIndex(null);
      setSelectedSubIndex(0);
    }, 300); // Match animation duration in CSS
  };

  // Updated to use the utility function
  const handlePreviousPhoto = () => {
    const newIndex = goToPreviousPhoto(photos, selectedPhotoIndex);
    if (newIndex !== selectedPhotoIndex) {
      setSelectedPhotoIndex(newIndex);
      setSelectedSubIndex(0);
    }
  };

  // Updated to use the utility function
  const handleNextPhoto = () => {
    const newIndex = goToNextPhoto(photos, selectedPhotoIndex);
    if (newIndex !== selectedPhotoIndex) {
      setSelectedPhotoIndex(newIndex);
      setSelectedSubIndex(0);
    }
  };

  // Now update the keyboard handler to use these functions
  const handleKeyDown = useCallback((e) => {
    // Close settings with ESC if they're open
    if (e.key === 'Escape' && showControlOverlay) {
      e.preventDefault();
      setShowControlOverlay(false);
      return;
    }

    // Handle photo navigation
    if (selectedPhotoIndex !== null) {
      if (e.key === 'Escape') {
        setSelectedPhotoIndex(null);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePreviousPhoto();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextPhoto();
      }
    }
  }, [selectedPhotoIndex, photos, showControlOverlay]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Global 1s timer for generation countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setPhotos((previousPhotos) => {
        return previousPhotos.map((p) => {
          if (p.generating && p.generationCountdown > 0) {
            return { ...p, generationCountdown: p.generationCountdown - 1 };
          }
          return p;
        });
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // -------------------------
  //   Shared logic for generating images from a Blob
  // -------------------------
  const generateFromBlob = async (photoBlob, newPhotoIndex, dataUrl, isMoreOperation = false) => {
    try {
      // Save the last used photo data for "More" button functionality
      setLastPhotoData({ blob: photoBlob, dataUrl });
      
      // Check if we're on iOS - we'll need special handling
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      
      // Get the style prompt, generating random if selected
      let stylePrompt;
      
      if (selectedStyle === 'custom') {
        stylePrompt = customPrompt || 'A custom style portrait';
      } else if (selectedStyle === 'random') {
        // Ensure we have prompts loaded
        if (Object.keys(stylePrompts).length <= 2) {
          // Reload prompts if they're not available
          try {
            const prompts = await loadPrompts();
            if (Object.keys(prompts).length > 0) {
              // Update state with new prompts
              setStylePrompts(prev => {
                const newStylePrompts = {
                  custom: '',
                  ...Object.fromEntries(
                    Object.entries(prompts)
                      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                  )
                };
                newStylePrompts.random = `{${Object.values(prompts).join('|')}}`;
                return newStylePrompts;
              });
            }
          } catch (error) {
            console.error('Error loading prompts on demand:', error);
          }
        }
        
        const randomStyle = getRandomStyle(stylePrompts);
        stylePrompt = stylePrompts[randomStyle] || 'A creative portrait style';
      } else if (selectedStyle === 'randomMix') {
        stylePrompt = getRandomMixPrompts(numberImages, stylePrompts);
      } else {
        stylePrompt = stylePrompts[selectedStyle] || 'A creative portrait style';
      }
      
      console.log('Style prompt:', stylePrompt);
      projectStateReference.current = {
        currentPhotoIndex: newPhotoIndex,
        pendingCompletions: new Map(),
        jobMap: new Map() // Store jobMap in projectState
      };

      // Skip setting up photos state if this is a "more" operation
      // since we've already set up placeholders in handleGenerateMorePhotos
      if (!isMoreOperation) {
        // Set up photos state first
        setPhotos(previous => {
          // Check if there are any existing photos with progress we need to preserve
          const existingProcessingPhotos = previous.filter(photo => 
            photo.generating && photo.jobId && photo.progress
          );
          
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
      }

      // Only animate if this is the first time (not a "more" operation)
      if (!isMoreOperation) {
        // Animate camera and studio lights out
        setCameraAnimating(true);
        setLightsAnimating(true);
        
        // Wait for animation to complete before showing grid and hiding lights
        setTimeout(() => {
          setShowPhotoGrid(true);
          setCameraAnimating(false);
          setStudioLightsHidden(true);
          setTimeout(() => {
            setLightsAnimating(false);
          }, 800); // Match animation duration
        }, 700); // Match the duration of cameraFlyUp animation
      }

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
      const handledJobs = {current: new Set()};

      // Helper to set up job progress handler
      const setupJobProgress = (job) => {
        // Only set up if we haven't already handled this job
        if (!handledJobs.current.has(job.id)) {
          // Ensure we have a photo index that corresponds to a valid photo
          // This should match the order we've requested images
          let jobIndex;

          // First try to get it from an existing mapping
          if (projectStateReference.current.jobMap.has(job.id)) {
            jobIndex = projectStateReference.current.jobMap.get(job.id);
          } else {
            // Otherwise create a new mapping
            jobIndex = projectStateReference.current.jobMap.size;
            projectStateReference.current.jobMap.set(job.id, jobIndex);
          }

          // Mark this job as handled to prevent duplicate handlers
          handledJobs.current.add(job.id);
          
          job.on('progress', (progress) => {
            // Apply offset correctly depending on whether we're keeping the original photo
            const offset = keepOriginalPhoto ? 1 : 0;
            const photoIndex = jobIndex + offset;
            
            // Safety check - ensure a valid photo index
            setPhotos(previous => {
              const updated = [...previous];
              
              // Safety check - make sure the photo index is valid
              if (photoIndex >= updated.length) {
                // Skip updates for invalid indices
                return previous;
              }
              
              // Progress should be coming in as a 0-1 decimal, need to convert to percentage
              const displayProgress = Math.round(progress * 100);
              
              updated[photoIndex] = {
                ...updated[photoIndex],
                generating: true,
                loading: true,
                progress: displayProgress,
                statusText: `${job.workerName} processing... ${displayProgress}%`,
                jobId: job.id
              };
              return updated;
            });
          });
        }
      };
      
      // Process the array buffer for iOS as a special precaution
      const blobArrayBuffer = await processedBlob.arrayBuffer();
      
      // Create the project using our backend client interface
      // The API is the same but will use our secure backend instead of direct SDK calls
      const project = await sogniClient.projects.create({
        modelId: selectedModel,
        positivePrompt: stylePrompt,
        sizePreset: 'custom',
        width: desiredWidth,
        height: desiredHeight,
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

      activeProjectReference.current = project.id;
      console.log('Project created:', project.id, 'with jobs:', project.jobs);
      console.log('Initializing job map for project', project.id);

      // Set up handlers for any jobs that exist immediately
      console.log('Project jobs to set up:', project.jobs);
      if (project.jobs && project.jobs.length > 0) {
        project.jobs.forEach((job, index) => {
          console.log(`Initializing job ${job.id} for index ${index}`);
          // Initialize the job map with the job ID -> photo index mapping
          projectStateReference.current.jobMap.set(job.id, index);
          // Set up progress handler
          setupJobProgress(job);
        });
      }

      // Watch for new jobs
      project.on('updated', (keys) => {
        if (keys.includes('jobs')) {
          project.jobs.forEach(setupJobProgress);
        }
      });

      // Project level events
      project.on('progress', (progress) => {
        console.log('Project progress:', progress);
      });

      project.on('completed', (urls) => {
        console.log('Project completed:', urls);
        activeProjectReference.current = null; // Clear active project reference when complete
        if (urls.length === 0) return;
        
        for (const [index, url] of urls.entries()) {
          const offset = keepOriginalPhoto ? 1 : 0;
          const photoIndex = index + offset;
          
          setPhotos(previous => {
            const updated = [...previous];
            if (!updated[photoIndex]) return previous;
            
            // Check if this photo has a permanent error - if so, don't update it
            if (updated[photoIndex].permanentError) {
              console.log(`Photo at index ${photoIndex} has permanent error, skipping update`);
              return previous;
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
        activeProjectReference.current = null; // Clear active project reference when failed
      });

      // Individual job events
      project.on('jobCompleted', (job) => {
        console.log('Job completed:', job.id, job.resultUrl);
        if (!job.resultUrl) {
          console.error('Missing resultUrl for job:', job.id);
          return;
        }
        
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        console.log('Looking up job index for completed job:', job.id, 'found:', jobIndex, 'in map:', projectStateReference.current.jobMap);
        if (jobIndex === undefined) {
          console.error('Unknown job completed:', job.id);
          return;
        }
        
        if (cameraWindSoundReference.current) {
          cameraWindSoundReference.current.play().catch(error => {
            console.warn("Error playing camera wind sound:", error);
          });
        }
        
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        console.log(`Loading image for job ${job.id} into box ${photoIndex}, keepOriginalPhoto: ${keepOriginalPhoto}, offset: ${offset}`);
        
        const img = new Image();
        img.addEventListener('load', () => {
          setPhotos(previous => {
            const updated = [...previous];
            if (!updated[photoIndex]) {
              console.error(`No photo box found at index ${photoIndex}`);
              return previous;
            }
            
            // Check if this photo has a permanent error - if so, don't update it
            if (updated[photoIndex].permanentError) {
              console.log(`Photo at index ${photoIndex} has permanent error, skipping update`);
              return previous;
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
            if (!stillGenerating && activeProjectReference.current) {
              // All photos are done, clear the active project
              console.log('All jobs completed, clearing active project');
              activeProjectReference.current = null;
            }
            
            return updated;
          });
        });
        img.src = job.resultUrl;
      });

      project.on('jobFailed', (job) => {
        console.error('Job failed:', job.id, job.error);
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        if (jobIndex === undefined) return;
        
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        
        setPhotos(previous => {
          const updated = [...previous];
          if (!updated[photoIndex]) return previous;
          
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
          if (!stillGenerating && activeProjectReference.current) {
            // All photos are done, clear the active project
            console.log('All jobs failed or completed, clearing active project');
            activeProjectReference.current = null;
          }
          
          return updated;
        });
      });

    } catch (error) {
      console.error('Generation failed:', error);
      
      if (error && error.code === 4015) {
        console.warn("Socket error (4015). Re-initializing Sogni.");
        setIsSogniReady(false);
        initializeSogni();
      }

      setPhotos(previous => {
        const updated = [];
        if (keepOriginalPhoto) {
          const originalPhoto = previous.find(p => p.isOriginal);
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
      setCameraAnimating(true);
      setLightsAnimating(true);
      
      setTimeout(() => {
        setShowPhotoGrid(true);
        setCameraAnimating(false);
        setStudioLightsHidden(true);
        setTimeout(() => {
          setLightsAnimating(false);
        }, 800);
      }, 700);
    }
  };

  // -------------------------
  //   Drag and Drop handling
  // -------------------------
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);

    // Don't accept files if we're already processing another one
    if (activeProjectReference.current || isPhotoButtonCooldown) {
      alert('Please wait for the current image to finish processing.');
      return;
    }

    if (!isSogniReady) {
      alert('Sogni is not ready yet.');
      return;
    }

    // If user dropped multiple files, just take the first
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    // Hide the start menu if it's visible
    setShowStartMenu(false);

    // Create a new photo item with temporary placeholder
    const newPhoto = {
      id: Date.now(),
      generating: true,
      images: [],
      error: null,
      originalDataUrl: null, // Will be updated with cropped version
      newlyArrived: false,
      generationCountdown: 10,
    };
    
    setPhotos((previous) => [...previous, newPhoto]);
    const newPhotoIndex = photos.length;

    // First save the original image for reference
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
      const originalDataUrl = event.target.result;
      
      // Get current dimensions based on orientation
      const { width, height } = getCustomDimensions();
      
      try {
        // Process the image to ensure consistent aspect ratio across all devices
        const croppedBlob = await centerCropImage(file, width, height);
        
        // Create a data URL from the cropped blob to use as placeholder
        const croppedDataUrl = await blobToDataURL(croppedBlob);
        
        // Update the photo with the cropped data URL as placeholder
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[newPhotoIndex]) {
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              originalDataUrl: croppedDataUrl // Use cropped version as placeholder
            };
          }
          return updated;
        });
        
        // Use the cropped blob for generation
        generateFromBlob(croppedBlob, newPhotoIndex, croppedDataUrl);
      } catch (error) {
        console.error('Error cropping image:', error);
        // Fallback to original if cropping fails
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[newPhotoIndex]) {
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              originalDataUrl: originalDataUrl // Fall back to original as placeholder
            };
          }
          return updated;
        });
        generateFromBlob(file, newPhotoIndex, originalDataUrl);
      }
    });
    reader.readAsDataURL(file);
  };

  // -------------------------
  //   Capture (webcam)
  // -------------------------
  const handleTakePhoto = async () => {
    if (!isSogniReady || isPhotoButtonCooldown) {
      return;
    }

    // Cancel any existing project
    if (activeProjectReference.current) {
      console.log('Cancelling existing project:', activeProjectReference.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectReference.current);
        } catch (error) {
          console.warn('Error cancelling previous project:', error);
        }
      }
      activeProjectReference.current = null;
    }

    // Start cooldown
    setIsPhotoButtonCooldown(true);
    setTimeout(() => {
      setIsPhotoButtonCooldown(false);
    }, 5000);

    console.log('handleTakePhoto called - device type:', /iphone|ipad|ipod|android/i.test(navigator.userAgent) ? 'mobile' : 'desktop');
    
    // Start countdown without slothicorn initially
    for (let index = 3; index > 0; index--) {
      setCountdown(index);
      
      // Show slothicorn when countdown reaches 2, but only for front-facing camera
      if (index === 2 && slothicornReference.current && isFrontCamera) {
        // Force the slothicorn to be visible and animated
        slothicornReference.current.style.position = 'fixed'; // Ensure it's fixed positioning
        slothicornReference.current.style.zIndex = '999999'; // Very high z-index to appear above everything
        slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
        slothicornReference.current.style.transition = 'none';
        slothicornReference.current.classList.add('animating');
        
        // Force reflow
        void slothicornReference.current.offsetHeight;
        
        // After a small delay, start the upward animation
        setTimeout(() => {
          slothicornReference.current.style.transition = 'bottom 0.8s cubic-bezier(0.34, 1.2, 0.64, 1)';
          slothicornReference.current.style.setProperty('bottom', '0px', 'important');
        }, 50);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setCountdown(0);
    triggerFlashAndCapture();
    
    // Make slothicorn return more gradually, but only if front camera is active
    if (isFrontCamera) {
      setTimeout(() => {
        if (slothicornReference.current) {
          slothicornReference.current.style.transition = 'bottom 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
          slothicornReference.current.style.setProperty('bottom', '-340px', 'important');
          
          // Wait for animation to complete, then clean up
          setTimeout(() => {
            slothicornReference.current.style.transition = 'none';
            slothicornReference.current.classList.remove('animating');
            // Reset z-index after animation completes
            slothicornReference.current.style.zIndex = '10';
          }, 1500);
        }
      }, 1200);
    }
  };

  const triggerFlashAndCapture = () => {
    // Check if we're in countdown mode, and if so, abort
    if (countdown > 0) return;
    
    // Play camera shutter sound
    if (shutterSoundReference.current) {
      shutterSoundReference.current.play().catch(error => {
        console.warn("Error playing shutter sound:", error);
      });
    }
    
    // Count 3..2..1
    if (flashEnabled) {
      setShowFlash(true);
      // Keep flash visible longer for better exposure compensation
      setTimeout(() => {
        setShowFlash(false);
      }, 700); // Increased from the default 250ms to 700ms
    }
    // Process the capture
    captureAndSend();
  };

  const captureAndSend = async () => {
    const canvas = canvasReference.current;
    const video = videoReference.current;
    const isPortrait = window.innerHeight > window.innerWidth;
    
    // Set canvas dimensions to 1152x896 for landscape (or 896x1152 for portrait)
    if (isPortrait) {
      canvas.width = 896;
      canvas.height = 1152;
    } else {
      canvas.width = 1152;
      canvas.height = 896;
    }
    
    const context = canvas.getContext('2d');
    
    // Fill with black to prevent transparency
    context.fillStyle = 'black';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate dimensions to maintain aspect ratio without stretching
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let destinationX = 0;
    let destinationY = 0;
    let destinationWidth = canvas.width;
    let destinationHeight = canvas.height;
    
    // If video aspect is wider than desired, crop width
    if (videoAspect > canvasAspect) {
      sourceWidth = video.videoHeight * canvasAspect;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      context.drawImage(video, 
        sourceX, 0, sourceWidth, sourceHeight,
        destinationX, destinationY, destinationWidth, destinationHeight
      );
    } 
    // If video aspect is taller than desired, crop height
    else {
      sourceHeight = video.videoWidth / canvasAspect;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      context.drawImage(video, 
        0, sourceY, sourceWidth, sourceHeight,
        destinationX, destinationY, destinationWidth, destinationHeight
      );
    }

    // For iOS, ensure we capture a good frame by drawing again after a small delay
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      // Small delay to ensure the frame is fully captured before processing
      await new Promise(resolve => setTimeout(resolve, 100));
      // Redraw the frame
      if (videoAspect > canvasAspect) {
        sourceWidth = video.videoHeight * canvasAspect;
        const sourceX = (video.videoWidth - sourceWidth) / 2;
        context.drawImage(video, 
          sourceX, 0, sourceWidth, sourceHeight,
          destinationX, destinationY, destinationWidth, destinationHeight
        );
      } else {
        sourceHeight = video.videoWidth / canvasAspect;
        const sourceY = (video.videoHeight - sourceHeight) / 2;
        context.drawImage(video, 
          0, sourceY, sourceWidth, sourceHeight,
          destinationX, destinationY, destinationWidth, destinationHeight
        );
      }
    }

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    // Use a quality of 1.0 and explicitly use the PNG MIME type for iOS
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });
    
    if (!blob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // For iOS Chrome, ensure the blob is fully ready by creating a new copy
    if (isIOS) {
      const reader = new FileReader();
      reader.onload = async function() {
        const arrayBuffer = this.result;
        const newBlob = new Blob([arrayBuffer], {type: 'image/png'});
        generateFromBlob(newBlob, photos.length, dataUrl);
      };
      reader.readAsArrayBuffer(blob);
    } else {
      generateFromBlob(blob, photos.length, dataUrl);
    }
  };

  // -------------------------
  //   Delete photo
  // -------------------------
  const handleDeletePhoto = (photoIndex) => {
    setPhotos((previous) => {
      const newPhotos = [...previous];
      newPhotos.splice(photoIndex, 1);
      return newPhotos;
    });

    setSelectedPhotoIndex((current) => {
      if (current === null) return null;
      if (current === photoIndex) {
        const newIndex = current - 1;
        return newIndex < 0 ? null : newIndex;
      } else if (photoIndex < current) {
        return current - 1;
      }
      return current;
    });
    setSelectedSubIndex(0);
  };

  /**
   * Handle user selection of a different camera device.
   */
  const handleCameraSelection = async (e) => {
    const deviceId = typeof e === 'string' ? e : e.target.value;
    setSelectedCameraDeviceId(deviceId);
    await startCamera(deviceId);
  };

  // -------------------------
  //   Main area (video)
  // -------------------------
  const renderMainArea = () => (
    <div className="main-content-area">
      {/* Display backend error if present */}
      {backendError && (
        <div className="backend-error-message" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '20px',
          background: 'rgba(255, 0, 0, 0.1)',
          border: '1px solid #ff0000',
          borderRadius: '8px',
          maxWidth: '90%',
          width: '600px',
          zIndex: 99999,
          backdropFilter: 'blur(8px)',
          textAlign: 'center',
          fontWeight: 'bold',
          color: '#d32f2f',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Backend Connection Error</h3>
          <p style={{ margin: '0 0 15px 0' }}>{backendError}</p>
          <button onClick={() => window.location.reload()} style={{
            padding: '8px 16px',
            background: '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}>Reload Page</button>
        </div>
      )}

      {showStartMenu ? (
        <CameraStartMenu
          onTakePhoto={handleTakePhotoOption}
          onBrowsePhoto={handleBrowsePhotoOption}
          onDragPhoto={handleDragPhotoOption}
          isProcessing={!!activeProjectReference.current || isPhotoButtonCooldown}
          hasPhotos={photos.length > 0}
          onViewPhotos={() => {
            // Pre-scroll to top for smooth transition
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // Show photo grid
            setShowPhotoGrid(true);
          }}
        />
      ) : (
        <>
          {/* Show camera view only when start menu is not shown */}
          <CameraView
            videoRef={videoReference}
            isReady={isSogniReady && !isPhotoButtonCooldown}
            countdown={countdown}
            isDisabled={isPhotoButtonCooldown}
            buttonLabel={isPhotoButtonCooldown ? "Get Ready!" : "Take Photo"}
            onTakePhoto={handleTakePhoto}
            showPhotoGrid={showPhotoGrid}
            selectedStyle={selectedStyle}
            onStyleSelect={(style) => updateSetting(setSelectedStyle, 'selectedStyle')(style)}
            showSettings={showControlOverlay}
            onToggleSettings={() => setShowControlOverlay(!showControlOverlay)}
            testId="camera-view"
            stylePrompts={stylePrompts}
            customPrompt={customPrompt}
            onCustomPromptChange={(value) => updateSetting(setCustomPrompt, 'customPrompt')(value)}
            cameraDevices={cameraDevices}
            selectedCameraDeviceId={selectedCameraDeviceId}
            onCameraSelect={handleCameraSelection}
            onToggleCamera={handleToggleCamera}
            isFrontCamera={isFrontCamera}
            modelOptions={getModelOptions()}
            selectedModel={selectedModel}
            onModelSelect={(value) => updateSetting(setSelectedModel, 'selectedModel')(value)}
            numImages={numberImages}
            onNumImagesChange={(value) => updateSetting(setNumberImages, 'numImages')(value)}
            promptGuidance={promptGuidance}
            onPromptGuidanceChange={(value) => updateSetting(setPromptGuidance, 'promptGuidance')(value)}
            controlNetStrength={controlNetStrength}
            onControlNetStrengthChange={(value) => updateSetting(setControlNetStrength, 'controlNetStrength')(value)}
            controlNetGuidanceEnd={controlNetGuidanceEnd}
            onControlNetGuidanceEndChange={(value) => updateSetting(setControlNetGuidanceEnd, 'controlNetGuidanceEnd')(value)}
            flashEnabled={flashEnabled}
            onFlashEnabledChange={(value) => updateSetting(setFlashEnabled, 'flashEnabled')(value)}
            keepOriginalPhoto={keepOriginalPhoto}
            onKeepOriginalPhotoChange={(value) => updateSetting(setKeepOriginalPhoto, 'keepOriginalPhoto')(value)}
            onResetSettings={resetAllSettings}
          />
          
          {/* Other UI elements like canvas, flash effect, etc. */}
          <canvas ref={canvasReference} style={{ display: 'none' }} />
          
        </>
      )}
    </div>
  );

  // Determine if we're in portrait or landscape orientation
  const isPortraitOrientation = () => {
    // Check current orientation of device
    return window.matchMedia("(orientation: portrait)").matches;
  };

  // -------------------------
  //   Control Panel
  // -------------------------
  const renderControlPanel = () => {
    return null;
  };

  // -------------------------
  //   Thumbnails at bottom
  // -------------------------
  const renderGallery = () => {    
    if (photos.length === 0 || !showPhotoGrid) return null;
    
    // Track if any generation is in progress
    const isGenerating = photos.some(photo => photo.generating);
    
    return (
      <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'}`}
        style={{
          background: 'rgba(248, 248, 248, 0.85)',
          backgroundImage: `
            linear-gradient(125deg, rgba(255,138,0,0.8), rgba(229,46,113,0.8), rgba(185,54,238,0.8), rgba(58,134,255,0.8)),
            repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px)
          `,
          backgroundSize: '400% 400%, 20px 20px, 20px 20px',
          animation: 'psychedelic-shift 15s ease infinite',
        }}>
        {/* Style Dropdown in top left corner */}
        <div className="grid-style-selector" style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}>
          <div className="style-dropdown-label" style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '5px',
            textShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}>
          </div>
          <button
            className="header-style-select grid-style-btn"
            onClick={toggleStyleDropdown}
            ref={styleButtonReference}
            style={{
              all: 'unset',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '12px',
              color: '#333',
              cursor: 'pointer',
              padding: '8px 16px',
              paddingRight: '24px',
              borderRadius: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            }}
          >
            <span className="style-text" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {`${selectedStyle === 'custom' ? 'Custom...' : styleIdToDisplay(selectedStyle)}`}
            </span>
          </button>
          
          {showStyleDropdown && (
            <StyleDropdown
              isOpen={showStyleDropdown}
              onClose={() => setShowStyleDropdown(false)}
              selectedStyle={selectedStyle}
              updateStyle={(style) => updateSetting(setSelectedStyle, 'selectedStyle')(style)}
              defaultStylePrompts={stylePrompts}
              styleIdToDisplay={styleIdToDisplay}
              showControlOverlay={showControlOverlay}
              setShowControlOverlay={setShowControlOverlay}
              dropdownPosition="bottom"
              triggerButtonClass=".grid-style-btn"
            />
          )}
        </div>

        {/* Back to Camera button */}
        <button
          className="back-to-camera-btn"
          onClick={handleBackToCamera}
          style={{
            position: 'fixed',
            left: '20px',
            bottom: '20px',
            background: 'linear-gradient(135deg, #ffb6e6 0%, #ff5e8a 100%)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '16px',
            zIndex: 9999,
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
        >
          ← 📸
        </button>

        {/* Settings button - always show in photo grid */}
        {selectedPhotoIndex === null && (
          <button
            className="header-settings-btn"
            onClick={() => setShowControlOverlay(!showControlOverlay)}
            style={{
              position: 'fixed',
              top: 24,
              right: 24,
              background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              width: 38,
              height: 38,
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontWeight: 900,
              lineHeight: 1,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              zIndex: 1000,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            }}
            title="Settings"
          >
            ⚙️
          </button>
        )}

        {/* More button - positioned on the right side */}
        {!isGenerating && selectedPhotoIndex === null && (
          <button
            className="more-photos-btn"
            onClick={handleGenerateMorePhotos}
            disabled={activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob}
            style={{
              position: 'fixed',
              right: '20px',
              bottom: '20px',
              background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              cursor: activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              zIndex: 9999,
              transition: 'all 0.2s ease',
              opacity: activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob ? 0.6 : 1,
            }}
            onMouseOver={(e) => {
              if (!(activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
            onMouseDown={(e) => {
              if (!(activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) {
                e.currentTarget.style.transform = 'scale(0.95)';
              }
            }}
            onMouseUp={(e) => {
              if (!(activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) {
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
          >
            More ✨
          </button>
        )}

        {/* Navigation buttons - only show when a photo is selected */}
        {selectedPhotoIndex !== null && photos.length > 1 && (
          <>
            <button className="photo-nav-btn prev" onClick={handlePreviousPhoto}>
              &#8249;
            </button>
            <button className="photo-nav-btn next" onClick={handleNextPhoto}>
              &#8250;
            </button>
            <button 
              className="photo-close-btn" 
              onClick={() => setSelectedPhotoIndex(null)}
              style={{
                position: 'fixed',
                top: '20px',
                right: '20px',
                background: 'rgba(0, 0, 0, 0.6)',
                color: 'white',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                fontSize: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 99999,
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.95)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
            >
              ×
            </button>
          </>
        )}

        {/* Also add a close button when there's only one photo */}
        {selectedPhotoIndex !== null && photos.length <= 1 && (
          <button 
            className="photo-close-btn" 
            onClick={() => setSelectedPhotoIndex(null)}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 99999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
          >
            ×
          </button>
        )}

        {/* Settings button when viewing a photo */}
        {selectedPhotoIndex !== null && (
          <button
            className="header-settings-btn"
            onClick={() => setShowControlOverlay(!showControlOverlay)}
            style={{
              position: 'fixed',
              top: 24,
              right: 72,
              background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              width: 38,
              height: 38,
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontWeight: 900,
              lineHeight: 1,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              zIndex: 99999,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            }}
            title="Settings"
          >
            ⚙️
          </button>
        )}
        
        {/* Help button in photo grid view */}
        <button
          className="header-info-btn"
          onClick={toggleNotesModal}
          style={{
            position: 'fixed',
            top: 24,
            right: selectedPhotoIndex !== null ? 120 : 72,
            background: 'linear-gradient(135deg, #ffb6e6 0%, #ff5e8a 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 22,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 1000,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Photobooth Tips"
        >
          ?
        </button>

        <div className={`film-strip-content ${selectedPhotoIndex === null ? '' : 'has-selected'}`} style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '32px',
          justifyItems: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '1600px',
          margin: '0 auto',
          padding: '32px'
        }}>
          {photos.map((photo, index) => {
            const isSelected = index === selectedPhotoIndex;
            const isReference = photo.isOriginal;
            const placeholderUrl = photo.originalDataUrl;
            const progress = Math.floor(photo.progress || 0);
            const loadingLabel = progress > 0 ? `${progress}%` : "";
            const labelText = isReference ? "Reference" : `#${index-keepOriginalPhoto+1}`;
            
            // Force square aspect ratio with important flags
            const squareStyle = {
              width: '100%',
              maxWidth: '240px',
              aspectRatio: '1 / 1',
              margin: '0 auto',
              backgroundColor: 'white'
            };

            // Loading or error state
            if ((photo.loading && photo.images.length === 0) || (photo.error && photo.images.length === 0)) {
              return (
                <div
                  key={photo.id}
                  className={`film-frame loading ${isSelected ? 'selected' : ''}`}
                  data-fadepolaroid={photo.loading && !photo.error ? 'true' : undefined}
                  data-enhancing={photo.enhancing ? 'true' : undefined}
                  data-error={photo.error ? 'true' : undefined}
                  data-enhanced={photo.enhanced ? 'true' : undefined}
                  data-progress={Math.floor(photo.progress * 100) || 0}
                  onClick={() => isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index)}
                  style={{
                    ...squareStyle,
                    '--enhance-progress': photo.progress ? `${Math.floor(photo.progress * 100)}%` : '0%',
                    position: 'relative',
                    borderRadius: '3px',
                    padding: '12px',
                    paddingBottom: '60px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div>
                    {placeholderUrl && (
                      <img
                        src={placeholderUrl}
                        alt="Original reference"
                        className="placeholder"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          position: 'relative',
                          top: 0,
                          left: 0,
                          opacity: 0.7,
                          animation: photo.error ? '' : 'placeholderPulse 2s ease-in-out infinite',
                          zIndex: 1
                        }}
                      />
                    )}
                    
                    {/* Progress bar */}
                    {/* Progress bar removed as requested */}
                  </div>
                  <div className="photo-label" style={{ color: photo.error ? '#d32f2f' : undefined, fontWeight: photo.error ? 700 : undefined }}>
                    {photo.error ? 
                      `${typeof photo.error === 'object' ? 'Generation failed' : photo.error}` 
                      : (photo.statusText || loadingLabel || labelText)}
                  </div>
                </div>
              );
            }

            // Show completed image
            const thumbUrl = photo.images[0] || '';

            const handlePhotoSelect = (index, e) => {
              const element = e.currentTarget;
              
              if (selectedPhotoIndex === index) {
                // Capture current position before removing selected state
                const first = element.getBoundingClientRect();
                setSelectedPhotoIndex(null);
                
                // Animate back to grid position
                requestAnimationFrame(() => {
                  const last = element.getBoundingClientRect();
                  const deltaX = first.left - last.left;
                  const deltaY = first.top - last.top;
                  const deltaScale = first.width / last.width;

                  // Apply starting transform
                  element.style.transition = 'none';
                  element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale})`;
                  
                  // Force reflow
                  element.offsetHeight;
                  
                  // Animate to final position
                  element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
                  
                  // Clean up after animation
                  setTimeout(() => {
                    element.style.transition = '';
                    element.style.transform = '';
                  }, 500);
                });
                return;
              }

              // When selecting a photo
              // Scroll to top first to ensure proper positioning
              window.scrollTo({ top: 0, behavior: 'smooth' });
              
              // Capture starting position
              const first = element.getBoundingClientRect();
              
              // Update state to mark as selected
              setSelectedPhotoIndex(index);
              
              // After state update, calculate and animate
              requestAnimationFrame(() => {
                const last = element.getBoundingClientRect();
                const deltaX = first.left - last.left;
                const deltaY = first.top - last.top;
                const deltaScale = first.width / last.width;
                
                // Apply starting transform
                element.style.transition = 'none';
                element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale})`;
                
                // Force reflow
                element.offsetHeight;
                
                // Animate to final position
                element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
                element.style.transform = 'rotate(0deg)';
              });
            };

            // Update the film-frame rendering to use the new handler
            return (
              <div 
                key={photo.id}
                className={`film-frame ${isSelected ? 'selected' : ''} ${photo.loading ? 'loading' : ''}`}
                onClick={(e) => isSelected ? handlePhotoViewerClick(e) : handlePhotoSelect(index, e)}
                data-enhancing={photo.enhancing ? 'true' : undefined}
                data-error={photo.error ? 'true' : undefined}
                data-enhanced={photo.enhanced ? 'true' : undefined}
                style={{
                  ...squareStyle,
                  '--enhance-progress': photo.progress ? `${Math.floor(photo.progress * 100)}%` : '0%',
                  position: 'relative',
                  borderRadius: '3px',
                  padding: '12px',
                  paddingBottom: '60px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%'
                }}>
                    <img
                      src={thumbUrl}
                      alt={`Generated #${index}`}
                      onError={(e) => {
                        console.log('Image failed to load, using original as fallback');
                        if (photo.originalDataUrl && e.target.src !== photo.originalDataUrl) {
                          e.target.src = photo.originalDataUrl;
                          e.target.style.opacity = '0.7'; // Make it slightly faded to indicate it's a fallback
                          e.target.classList.add('fallback'); // Add fallback class for styling
                          
                          // Update the photo state to mark it as having an error
                          setPhotos(prev => {
                            const updated = [...prev];
                            if (updated[index]) {
                              updated[index] = {
                                ...updated[index],
                                loadError: true,
                                statusText: `${updated[index].statusText || ''} (Using original)`
                              };
                            }
                            return updated;
                          });
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'relative',
                        top: 0,
                        left: 0,
                        display: 'block',
                        animation: 'targetImageFadeIn 0.3s ease-in forwards'
                      }}
                  />
                  
                  {/* Progress bar for photos still loading */}
                  {/* Progress bar removed as requested */}
                </div>
                <div className="photo-label">
                  {photo.statusText || labelText}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Create a wrapper setter for each setting that also saves to cookies
  const updateSetting = (setter, settingName) => (value) => {
    setter(value);
    saveSettingsToCookies({ [settingName]: value });
  };

  // Reset all settings to defaults
  const resetAllSettings = () => {
    setSelectedModel(getValidModelValue(DEFAULT_SETTINGS.selectedModel));
    setNumberImages(DEFAULT_SETTINGS.numImages);
    setPromptGuidance(DEFAULT_SETTINGS.promptGuidance);
    setControlNetStrength(DEFAULT_SETTINGS.controlNetStrength);
    setControlNetGuidanceEnd(DEFAULT_SETTINGS.controlNetGuidanceEnd);
    setFlashEnabled(DEFAULT_SETTINGS.flashEnabled);
    setKeepOriginalPhoto(DEFAULT_SETTINGS.keepOriginalPhoto);
    setSelectedStyle(DEFAULT_SETTINGS.selectedStyle);
    setCustomPrompt('');
    
    // Save all defaults to cookies
    saveSettingsToCookies({
      ...DEFAULT_SETTINGS,
      selectedModel: getValidModelValue(DEFAULT_SETTINGS.selectedModel)
    });
  };

  // Add state for photo grid view
  const [cameraAnimating, setCameraAnimating] = useState(false);

  // Update state for studio lights
  const [studioLightsHidden, setStudioLightsHidden] = useState(false);
  const [lightsAnimating, setLightsAnimating] = useState(false);

  // Add state to track if user returned from photo grid
  const [returnedFromPhotos, setReturnedFromPhotos] = useState(false);

  // Add state to track dropdown position
  const [dropdownPosition, setDropdownPosition] = useState('bottom');
  
  // Add ref for dropdown button
  const styleButtonReference = useRef(null);

  // Add function to detect dropdown position and prevent clipping
  const toggleStyleDropdown = () => {
    // If already open, just close it
    if (showStyleDropdown) {
      setShowStyleDropdown(false);
      return;
    }
    
    // Calculate dropdown position based on button position
    if (styleButtonReference.current) {
      const buttonRect = styleButtonReference.current.getBoundingClientRect();
      const spaceAbove = buttonRect.top;
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      
      // If more space below than above or if not enough space above for dropdown, position below
      // Otherwise position above (which is the default for our bottom toolbar)
      if (spaceBelow > spaceAbove || spaceAbove < 350) {
        setDropdownPosition('bottom');
      } else {
        setDropdownPosition('top');
      }
    } else {
      // Default to above if we can't find the button
      setDropdownPosition('top');
    }
    
    setShowStyleDropdown(true);
  };

  // Add this helper function for style display
  const styleIdToDisplay = (styleId) => {
    return styleId.replaceAll(/([A-Z])/g, ' $1').replace(/^./, string_ => string_.toUpperCase()).trim();
  };

  // Clean, polished transition from photogrid to camera
  const handleBackToCamera = () => {
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Mark the photo grid as hiding with a clean fade-out
    const filmStrip = document.querySelector('.film-strip-container');
    if (filmStrip) {
      filmStrip.classList.remove('visible');
      filmStrip.classList.add('hiding');
    }
    
    // Use a shorter timeout for a snappier UI feel
    setTimeout(() => {
      // Hide photo grid and reset states
      setShowPhotoGrid(false);
      setSelectedPhotoIndex(null);
      setReturnedFromPhotos(true);
      
      // Hide slothicorn to prevent double appearance
      if (slothicornReference.current) {
        slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
        slothicornReference.current.classList.remove('animating');
      }
      setStudioLightsHidden(true);
      
      // Show the start menu again instead of the camera
      setShowStartMenu(true);
      
      // Clean reveal for the camera - no flying animations, just appear
      setCameraAnimating(false);
      
      setTimeout(() => {
        setStudioLightsHidden(false);
      }, 300);
    }, 450); // Reduced time to match our new animation duration
  };

  // Add effect to reset newlyArrived status after animation completes
  useEffect(() => {
    const newPhotos = photos.filter(photo => photo.newlyArrived);
    if (newPhotos.length > 0) {
      const timer = setTimeout(() => {
        setPhotos(previous => 
          previous.map(photo => 
            photo.newlyArrived ? { ...photo, newlyArrived: false } : photo
          )
        );
      }, 600); // Slightly longer than animation duration
      
      return () => clearTimeout(timer);
    }
  }, [photos]);

  // Handle clicks in the photo viewer
  const handlePhotoViewerClick = (e) => {
    if (selectedPhotoIndex === null) return;
    
    // Check if the target is the enhance button (::after pseudo-element)
    // We can detect clicks on ::after by checking the click position relative to the element
    const target = e.target;
    
    if (target.classList.contains('film-frame') && target.classList.contains('selected')) {
      const rect = target.getBoundingClientRect();
      const clickX = e.clientX;
      const clickY = e.clientY;
      
      // Check if click is in the bottom-right area where the enhance button is
      if (clickX >= rect.right - 150 && clickX <= rect.right && 
          clickY >= rect.bottom - 80 && clickY <= rect.bottom) {
        // Enhance button clicked
        const currentPhoto = photos[selectedPhotoIndex];
        
        // Handle undo enhance if already enhanced
        if (currentPhoto.enhanced && !currentPhoto.loading && !currentPhoto.enhancing) {
          undoEnhancement({
            photoIndex: selectedPhotoIndex,
            subIndex: selectedSubIndex,
            setPhotos
          });
          e.stopPropagation();
          return;
        }
        
        // Normal enhance flow
        if (!currentPhoto.loading && !currentPhoto.enhancing) {
          enhancePhoto({
            photo: currentPhoto,
            photoIndex: selectedPhotoIndex,
            subIndex: selectedSubIndex,
            width: desiredWidth,
            height: desiredHeight,
            sogniClient,
            setPhotos,
            onSetActiveProject: (projectId) => {
              activeProjectReference.current = projectId;
            }
          });
          e.stopPropagation();
          return;
        }
      }
      
      // If not clicked on the enhance button, close the photo viewer
      setSelectedPhotoIndex(null);
    }
  };

  // Add toggle function for notes modal
  const toggleNotesModal = () => {
    setShowInfoModal(!showInfoModal);
  };

  // Add an effect to close dropdown when clicking outside
  useEffect(() => {
    if (showStyleDropdown) {
      const handleClickOutside = (e) => {
        const dropdown = document.querySelector('.style-dropdown');
        const button = document.querySelector('.header-style-select');
        
        // If click is outside dropdown and button, close dropdown
        if (dropdown && 
            button && 
            !dropdown.contains(e.target) && 
            !button.contains(e.target)) {
          setShowStyleDropdown(false);
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      
      // Make sure selected option is scrolled into view
      setTimeout(() => {
        const selectedOption = document.querySelector('.style-option.selected');
        if (selectedOption) {
          selectedOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showStyleDropdown]);

  // Add a new state to control whether to show the start menu
  const [showStartMenu, setShowStartMenu] = useState(true);
  
  // Handler for the "Take Photo" option in start menu
  const handleTakePhotoOption = async () => {
    setShowStartMenu(false);
    // Start camera after user selects the option
    await startCamera(null);
  };

  // Handler for the "Browse Photo" option in start menu
  const handleBrowsePhotoOption = (file) => {
    setShowStartMenu(false);
    
    // Make sure we have a valid file
    if (!file) return;
    
    // Check if Sogni is ready
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Please try again in a moment.');
      setShowStartMenu(true);
      return;
    }
    
    // Create a new photo item with temporary placeholder
    const newPhoto = {
      id: Date.now().toString(),
      generating: true,
      images: [],
      error: null,
      originalDataUrl: null, // Will be updated with cropped version
      newlyArrived: false,
      generationCountdown: 10,
    };
    
    setPhotos((previous) => [...previous, newPhoto]);
    const newPhotoIndex = photos.length;

    // First save the original image for reference
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
      const originalDataUrl = event.target.result;
      
      // Get current dimensions based on orientation
      const { width, height } = getCustomDimensions();
      
      try {
        // Process the image to ensure consistent aspect ratio across all devices
        const croppedBlob = await centerCropImage(file, width, height);
        
        // Create a data URL from the cropped blob to use as placeholder
        const croppedDataUrl = await blobToDataURL(croppedBlob);
        
        // Update the photo with the cropped data URL as placeholder
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[newPhotoIndex]) {
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              originalDataUrl: croppedDataUrl // Use cropped version as placeholder
            };
          }
          return updated;
        });
        
        // Use the cropped blob for generation
        generateFromBlob(croppedBlob, newPhotoIndex, croppedDataUrl);
      } catch (error) {
        console.error('Error cropping image:', error);
        // Fallback to original if cropping fails
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[newPhotoIndex]) {
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              originalDataUrl: originalDataUrl // Fall back to original as placeholder
            };
          }
          return updated;
        });
        generateFromBlob(file, newPhotoIndex, originalDataUrl);
      }
    });
    reader.readAsDataURL(file);
  };

  // Handler for the "Drag Photo" option in start menu
  const handleDragPhotoOption = () => {
    setShowStartMenu(false);
    // Show an overlay or instructions for drag and drop
    setDragActive(true);
    // This will use the existing drag and drop handlers
  };

  // Handle toggling between front and rear camera
  const handleToggleCamera = () => {
    setIsFrontCamera(prev => !prev);
    
    // Need to restart the camera with the new facing mode
    // No need to pass deviceId when toggling
    startCamera();
  };

  // -------------------------
  //   Generate more photos with the same settings
  // -------------------------
  const handleGenerateMorePhotos = async () => {
    // Don't proceed if already generating or no saved photo
    if (activeProjectReference.current || !lastPhotoData.blob) {
      return;
    }

    // Cancel any existing project first
    if (activeProjectReference.current) {
      console.log('Cancelling existing project:', activeProjectReference.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectReference.current);
        } catch (error) {
          console.warn('Error cancelling previous project:', error);
        }
      }
      activeProjectReference.current = null;
    }

    console.log('Generating more photos with the same settings');
    
    // Instead of appending to existing photos, we'll replace them
    // First, store the number of photos to generate
    const numToGenerate = numberImages;

    // Get the original photo if it exists
    const existingOriginalPhoto = keepOriginalPhoto ? photos.find(p => p.isOriginal) : null;
    
    // Create a new array with placeholders replacing the existing photos
    setPhotos(prev => {
      // Start with just the original photo if we're keeping it
      const newPhotos = existingOriginalPhoto ? [existingOriginalPhoto] : [];
      
      // Add placeholders for all new photos
      for (let i = 0; i < numToGenerate; i++) {
        newPhotos.push({
          id: Date.now() + i,
          generating: true,
          loading: true,
          progress: 0,
          images: [],
          error: null,
          originalDataUrl: lastPhotoData.dataUrl,
          newlyArrived: false,
          statusText: 'Finding Art Robot...'
        });
      }
      
      return newPhotos;
    });
    
    // Generate new photos using the last photo data
    try {
      const { blob, dataUrl } = lastPhotoData;
      
      // Create a copy of the blob to avoid any reference issues
      const blobCopy = blob.slice(0, blob.size, blob.type);
      
      // Small delay to ensure state updates before generation starts
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Generate new images with the existing blob
      // Use index 0 if we're keeping the original, otherwise use 0 as the starting index
      const newPhotoIndex = existingOriginalPhoto ? 1 : 0;
      await generateFromBlob(blobCopy, newPhotoIndex, dataUrl, true); // Pass true to indicate this is a "more" operation
    } catch (error) {
      console.error('Error generating more photos:', error);
      
      // Update the newly added placeholder photos with error state
      setPhotos(prev => {
        const startIndex = existingOriginalPhoto ? 1 : 0;
        const newPhotos = existingOriginalPhoto ? [existingOriginalPhoto] : [];
        
        for (let i = 0; i < numToGenerate; i++) {
          newPhotos.push({
            id: Date.now() + i,
            generating: false,
            loading: false,
            error: `Error: ${error.message || error}`,
            originalDataUrl: lastPhotoData.dataUrl,
            permanentError: true
          });
        }
        
        return newPhotos;
      });
    }
  };

  // -------------------------
  //   Render
  // -------------------------
  return (
    <>
      {currentThought && (/iphone|ipad|ipod|android/i.test(navigator.userAgent) === false) && (
        <div style={{ 
          position: 'fixed', 
          bottom: '5px',
          ...currentThought.position,
          color: 'black', 
          fontWeight: 'bold',
          fontSize: '16px',
          padding: '5px', 
          zIndex: 99999,
          whiteSpace: 'nowrap'
        }}>
          {currentThought.text}
        </div>
      )}

      <div className="w-full h-screen photobooth-app"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* Control overlay panel */}
        <div className={`control-overlay ${showControlOverlay ? 'visible' : ''}`}>
          <div className="control-overlay-content">
            <h2 className="settings-title">Advanced Settings</h2>
            
            <button 
              className="dismiss-overlay-btn"
              onClick={() => setShowControlOverlay(false)}
            >
              ×
            </button>
            
            {/* Camera selector - moved to top */}
            {cameraDevices.length > 0 && (
              <div className="control-option">
                <label className="control-label">Camera:</label>
                <select
                  className="camera-select"
                  onChange={handleCameraSelection}
                  value={selectedCameraDeviceId || ''}
                >
                  <option value="">Default (user-facing)</option>
                  {cameraDevices.map((development) => (
                    <option key={development.deviceId} value={development.deviceId}>
                      {development.label || `Camera ${development.deviceId}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedStyle === 'custom' && (
              <div className="control-option">
                <label className="control-label">Custom Style Prompt:</label>
                <textarea
                  className="custom-style-input"
                  placeholder="Enter your custom style prompt here..."
                  value={customPrompt}
                  onChange={(e) => {
                    setCustomPrompt(e.target.value);
                    saveSettingsToCookies({ customPrompt: e.target.value });
                  }}
                  rows={4}
                />
              </div>
            )}

            {/* Model selector */}
            <div className="control-option">
              <label className="control-label">Pick an Image Model:</label>
              <select
                className="model-select"
                value={selectedModel}
                onChange={(e) => updateSetting(setSelectedModel, 'selectedModel')(e.target.value)}
              >
                {modelOptions.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Number of Images slider */}
            <div className="control-option">
              <label className="control-label">Number of Images:</label>
              <input
                type="range"
                min={1}
                max={64}
                step={1}
                value={numberImages}
                onChange={(e) => updateSetting(setNumberImages, 'numImages')(Number.parseInt(e.target.value))}
                className="slider-input"
              />
              <span className="slider-value">{numberImages}</span>
            </div>

            {/* Prompt Guidance slider */}
            <div className="control-option">
              <label className="control-label">Prompt Guidance:</label>
              <input
                type="range"
                min={1.8}
                max={3}
                step={0.1}
                value={promptGuidance}
                onChange={(e) => updateSetting(setPromptGuidance, 'promptGuidance')(Number.parseFloat(e.target.value))}
                className="slider-input"
              />
              <span className="slider-value">{promptGuidance.toFixed(1)}</span>
            </div>

            {/* Instant ID Strength slider */}
            <div className="control-option">
              <label className="control-label">Instant ID Strength:</label>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.1}
                value={controlNetStrength}
                onChange={(e) => updateSetting(setControlNetStrength, 'controlNetStrength')(Number.parseFloat(e.target.value))}
                className="slider-input"
              />
              <span className="slider-value">{controlNetStrength.toFixed(1)}</span>
            </div>

            {/* Instant ID Impact Stop slider */}
            <div className="control-option">
              <label className="control-label">Instant ID Impact Stop:</label>
              <input
                type="range"
                min={0.2}
                max={0.8}
                step={0.1}
                value={controlNetGuidanceEnd}
                onChange={(e) => updateSetting(setControlNetGuidanceEnd, 'controlNetGuidanceEnd')(Number.parseFloat(e.target.value))}
                className="slider-input"
              />
              <span className="slider-value">{controlNetGuidanceEnd.toFixed(1)}</span>
            </div>

            <div className="control-option checkbox">
              <input
                type="checkbox"
                id="flash-toggle"
                checked={flashEnabled}
                onChange={(e) => updateSetting(setFlashEnabled, 'flashEnabled')(e.target.checked)}
              />
              <label htmlFor="flash-toggle" className="control-label">Flash</label>
            </div>

            <div className="control-option checkbox">
              <input
                type="checkbox"
                id="keep-original-toggle"
                checked={keepOriginalPhoto}
                onChange={(e) => updateSetting(setKeepOriginalPhoto, 'keepOriginalPhoto')(e.target.checked)}
              />
              <label htmlFor="keep-original-toggle" className="control-label">Show Original Image</label>
            </div>
            
            {/* Reset settings button */}
            <div className="control-option reset-option">
              <button 
                className="reset-settings-btn"
                onClick={resetAllSettings}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Help button - only show in camera view */}
        {!showPhotoGrid && !selectedPhotoIndex && (
          <>
            <button
              className="header-settings-btn"
              onClick={() => setShowControlOverlay(!showControlOverlay)}
              style={{
                position: 'fixed',
                top: 24,
                right: 72, // Position it to the left of the help button
                background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
                border: 'none',
                color: '#fff',
                fontSize: 20,
                width: 38,
                height: 38,
                borderRadius: '50%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                cursor: 'pointer',
                fontWeight: 900,
                lineHeight: 1,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 1000,
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
              }}
              title="Settings"
            >
              ⚙️
            </button>
          <button
            className="header-info-btn"
            onClick={toggleNotesModal}
            style={{
              position: 'fixed',
              top: 24,
              right: 24,
              background: 'linear-gradient(135deg, #ffb6e6 0%, #ff5e8a 100%)',
              border: 'none',
              color: '#fff',
              fontSize: 22,
              width: 38,
              height: 38,
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontWeight: 900,
              lineHeight: 1,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
                transition: 'all 0.2s ease',
              zIndex: 1000,
            }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            }}
            title="Photobooth Tips"
          >
            ?
          </button>
          </>
        )}
        
        {/* Studio lights - permanent background elements */}
        <div className={`studio-lights-container ${studioLightsHidden ? 'studio-lights-hidden' : ''}`}>
          <img 
            src={light1Image} 
            alt="Studio Light" 
            className={`studio-light left ${lightsAnimating ? 'sliding-out' : ''}`} 
          />
          <img 
            src={light2Image} 
            alt="Studio Light" 
            className={`studio-light right ${lightsAnimating ? 'sliding-out' : ''}`} 
          />
        </div>
        
        {/* Drag overlay */}
        {dragActive && (
          <div className="drag-overlay">
            <p>Drop your image here to generate!</p>
          </div>
        )}

        {/* Info Modal */}
        {showInfoModal && (
          <div className="notes-modal-overlay" style={{zIndex: 30_000}} onClick={() => setShowInfoModal(false)}>
            <div className="notes-modal" onClick={e => e.stopPropagation()}>
              <div className="sticky-note">
                <button className="note-close" onClick={() => setShowInfoModal(false)}>×</button>
                <h2 className="marker-font">Photobooth Tips</h2>
                <ul className="marker-font">
                  <li>Generated compositions reuses the same face size, position, and orientation as the camera snapshot so step back and get creative!</li>
                  <li>Only one face at a time! If multiple faces the biggest one in frame is used.</li>
                  <li>The more light / dark depth on your face the better, flat even light results can be subpar.</li>
                  <li>Try using the Custom Prompt feature and providing your own prompt!</li>
                  <li>You can even drag a photo into the camera window to use as a reference!</li>
                </ul>
                <div className="note-footer">
                  <a href="https://www.sogni.ai/sdk" target="_blank" rel="noopener noreferrer">
                  Vibe Coded with Sogni Client SDK<br/>Powered by Sogni Supernet ❤️
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main area with video - conditional rendering based on showPhotoGrid */}
        {renderMainArea()}

        {/* Photo gallery grid - shown when showPhotoGrid is true */}
        {renderGallery()}

        <canvas ref={canvasReference} className="hidden" />

        {/* Slothicorn mascot with direct DOM manipulation */}
        {!showStartMenu && (
        <div 
            ref={slothicornReference}
          className="slothicorn-container"
          style={{
            position: 'fixed',
            bottom: '-340px',
            left: '50%',
            transform: 'translateX(-50%) scale(1.5)',
            width: '200px',
            height: 'auto',
            zIndex: 10,
            pointerEvents: 'none'
          }}
        >
          <img 
            src={slothicornImage} 
            alt="Slothicorn mascot" 
            className="slothicorn-image" 
          />
        </div>
        )}

        {/* Camera shutter sound */}
        <audio ref={shutterSoundReference} preload="auto">
          <source src={clickSound} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>

        {/* Camera wind sound */}
        <audio ref={cameraWindSoundReference} preload="auto">
          <source src={cameraWindSound} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>

        {/* Show photos button - only visible when we have photos and camera is shown */}
        {selectedPhotoIndex === null && !showPhotoGrid && photos.length > 0 && !showStartMenu && (
          <button
            onClick={() => {
              // Pre-scroll to top for smooth transition
              window.scrollTo(0, 0);
              // Clean transition - explicitly ensure camera is hidden first
              setCameraAnimating(false);
              setShowPhotoGrid(true);
            }}
            className="view-photos-btn"
          >
            <span className="view-photos-icon">📸</span>
            <span className="view-photos-label">View Photos ({photos.length})</span>
          </button>
        )}
      </div>
      
      {/* Global flash overlay - covers the entire screen */}
      {showFlash && (
        <div 
          className="global-flash-overlay" 
            style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'white',
            zIndex: 99999,
            animation: 'fullScreenFlash 700ms ease-out' // Longer flash duration
          }}
        />
      )}

      {/* Add a dedicated useEffect for the aspect ratio CSS */}
      {useEffect(() => {
        // Add our CSS fixes (all 5 issues at once)
        const styleElement = document.createElement('style');
        styleElement.textContent = `
          /* ------- FIX 1: Style dropdown ------- */
          .style-dropdown {
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
            max-height: 380px;
            width: 240px;
            overflow-y: auto;
            padding: 8px;
            z-index: 1000;
            position: absolute;
            animation: dropdownAppear 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
            border: 1px solid rgba(0,0,0,0.1);
          }
          
          /* Position variations */
          .style-dropdown.top-position {
            bottom: 100%;
            top: auto !important;
            margin-bottom: 10px;
            transform-origin: center bottom !important;
            animation: dropdownAppearTop 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
          }
          
          .style-dropdown.bottom-position {
            top: 100%;
            bottom: auto !important;
            margin-top: 10px;
            transform-origin: center top !important;
            animation: dropdownAppearBottom 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
          }
          
          @keyframes dropdownAppearTop {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(10px);
            }
            to {
              opacity: 1; 
              transform: translateX(-50%) translateY(0);
            }
          }
          
          @keyframes dropdownAppearBottom {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(-10px);
            }
            to {
              opacity: 1; 
              transform: translateX(-50%) translateY(0);
            }
          }
          
          .style-section.featured {
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          
          .style-option {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            margin: 2px 0;
            border-radius: 4px;
            cursor: pointer;
            color: #333;
            transition: background-color 0.2s;
          }
          
          .style-option:hover {
            background-color: #f5f5f5;
          }
          
          .style-option:hover:before {
            display: none !important; /* Remove the carat */
          }
          
          .style-option.selected {
            background-color: #fff0f4 !important; /* Light pink background */
            color: #ff5e8a !important;
            font-weight: 500;
          }
          
          .style-icon {
            margin-right: 10px;
            z-index: 2;
          }
          
          /* ------- FIX 2: Camera widget Polaroid style ------- */
          .photobooth-frame {
            background: white;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            border-radius: 4px;
            width: auto;
            max-width: 70%;
            margin: 20px auto;
            padding: 8px 8px 60px 8px;
            position: relative;
          }
          
          .photobooth-header {
            margin-bottom: 8px;
          }
          
          /* Move Take Photo button to bottom */
          .header-take-photo-btn {
            position: absolute !important;
            bottom: 15px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: #ff5252 !important;
            color: white !important;
            font-weight: bold !important;
            padding: 10px 20px !important;
            border-radius: 25px !important;
            border: none !important;
            cursor: pointer !important;
            z-index: 10 !important;
          }
          
          .header-take-photo-btn:hover {
            background: #ff7272 !important;
          }
          
          /* ------- FIX 3: Back to Camera button positioning ------- */
          .film-strip-container .back-to-camera-btn {
            position: fixed !important;
            left: 20px !important;
            bottom: 20px !important;
            top: auto !important;
            right: auto !important;
            background: #ff5252 !important;
            color: white !important;
            border: none !important;
            padding: 10px 20px !important;
            border-radius: 8px !important;
            z-index: 9999 !important;
            margin: 0 !important;
            transform: none !important;
          }
          
          /* ------- ADD: Enhance button styling ------- */
          .enhance-photo-btn {
            position: fixed !important;
            right: 20px !important;
            top: 20px !important;
            background: rgba(255, 255, 255, 0.85) !important;
            color: #333 !important;
            border: none !important;
            padding: 10px 18px !important;
            border-radius: 6px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1) !important;
            cursor: pointer !important;
            font-weight: 500 !important;
            font-size: 14px !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            backdrop-filter: blur(4px) !important;
            -webkit-backdrop-filter: blur(4px) !important;
            transition: all 0.2s ease !important;
          }
          
          .enhance-photo-btn:hover {
            background: white !important;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15) !important;
          }
          
          .enhance-photo-btn:disabled {
            background: rgba(230, 230, 230, 0.8) !important;
            color: #999 !important;
            cursor: default !important;
            transform: none !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.05) !important;
          }
          
          /* Selected photo container enhance button styling */
          .selected-photo-container .enhance-photo-btn {
            position: fixed !important;
            right: 20px !important;
            top: 20px !important;
            background: rgba(255, 255, 255, 0.85) !important;
            color: #333 !important;
            border: none !important;
            padding: 10px 18px !important;
            border-radius: 6px !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1) !important;
            cursor: pointer !important;
            font-weight: 500 !important;
            font-size: 14px !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            backdrop-filter: blur(4px) !important;
            -webkit-backdrop-filter: blur(4px) !important;
            transition: all 0.2s ease !important;
          }
          
          .selected-photo-container .enhance-photo-btn:hover {
            background: white !important;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15) !important;
            transform: scale(1.02) !important;
          }
          
          .selected-photo-container .enhance-photo-btn:disabled {
            background: rgba(230, 230, 230, 0.8) !important;
            color: #999 !important;
            cursor: default !important;
            transform: none !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.05) !important;
          }
          
          /* ------- FIX 4: Loading image fade effect ------- */
          .film-frame.loading {
            position: relative;
          }
          
          .film-frame.loading img {
            transition: opacity 0.5s;
            opacity: 0.3 !important;
          }
          
          /* Set opacity based on progress attribute */
          .film-frame.loading[data-progress="0"] img { opacity: 0 !important; }
          .film-frame.loading[data-progress="10"] img { opacity: 0.05 !important; }
          .film-frame.loading[data-progress="20"] img { opacity: 0.10 !important; }
          .film-frame.loading[data-progress="30"] img { opacity: 0.15 !important; }
          .film-frame.loading[data-progress="40"] img { opacity: 0.20 !important; }
          .film-frame.loading[data-progress="50"] img { opacity: 0.25 !important; }
          .film-frame.loading[data-progress="60"] img { opacity: 0.30 !important; }
          .film-frame.loading[data-progress="70"] img { opacity: 0.35 !important; }
          .film-frame.loading[data-progress="80"] img { opacity: 0.40 !important; }
          .film-frame.loading[data-progress="90"] img { opacity: 0.45 !important; }
          .film-frame.loading[data-progress="100"] img { opacity: 0.50 !important; }
          
          /* Fallback image styling */
          .film-frame[data-error="true"] img,
          .film-frame img.fallback {
            opacity: 0.7 !important;
            filter: grayscale(20%) !important;
            border-top: 2px solid #ff9800 !important;
          }
          
          /* ------- FIX 5: Slideshow Polaroid frame ------- */
          .selected-photo-container {
            background: rgba(0,0,0,0.85);
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 99999 !important;
          }
          
          .selected-photo-container .enhance-photo-btn {
            position: fixed !important;
            right: 20px !important;
            top: 20px !important;
            background: linear-gradient(135deg, #FF3366 0%, #FF5E8A 100%) !important;
            color: white !important;
            border: none !important;
            padding: 12px 24px !important;
            border-radius: 8px !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
            cursor: pointer !important;
            font-weight: bold !important;
            font-size: 16px !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
          }
=
          .selected-photo-container .enhance-photo-btn:disabled {
            background: #cccccc !important;
            cursor: default !important;
            transform: none !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
          }
          
          .image-wrapper {
            background: white !important;
            padding: 16px 16px 60px 16px !important;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3) !important;
            border-radius: 4px !important;
            margin: 20px auto !important;
            position: relative !important;
            max-width: 80% !important;
            max-height: 80vh !important;
          }
          
          .image-wrapper img {
            width: 100% !important;
            height: auto !important;
            object-fit: cover !important;
            display: block !important;
            border-radius: 2px !important;
          }
          
          /* Set aspect ratio CSS variable based on orientation */
          :root {
            --current-aspect-ratio: ${window.innerHeight > window.innerWidth ? '896/1152' : '1152/896'};
          }
          
          /* Ensure images display properly */
          #webcam {
            object-fit: cover;
            width: 100%;
            height: auto;
          }
          
          /* Update film frame images */
          .film-frame img {
            object-fit: cover;
            width: 100%;
            height: 100%;
          }
          .fade-in {
            transition: opacity 0.5s !important;
          }
          
          /* Add placeholder pulse animation */
          @keyframes placeholderPulse {
            0% { opacity: 0.05; }
            50% { opacity: 0.2; }
            100% { opacity: 0.05; }
          }
          
          /* Target image fade-in animation */
          @keyframes targetImageFadeIn {
            from { opacity: 0.2; }
            to { opacity: 1; }
          }

          /* ------- Responsive Polaroid Frame for Mobile ------- */
          @media (max-width: 600px) {
            .polaroid-frame {
              max-width: 99vw !important;
              border-radius: 12px !important;
            }
            .polaroid-frame > div:first-child {
              height: 40px !important;
              padding: 0 8px !important;
            }
            .polaroid-frame .photobooth-title {
              font-size: 14px !important;
            }
            .polaroid-frame .header-style-select,
            .polaroid-frame .header-config-btn {
              font-size: 13px !important;
              width: 24px !important;
              height: 24px !important;
              min-width: 24px !important;
              min-height: 24px !important;
            }
            .polaroid-frame > div[style*='aspect-ratio'] {
              border-left-width: 12px !important;
              border-right-width: 12px !important;
              border-top-width: 40px !important;
              border-bottom-width: 40px !important;
              border-radius: 0 0 8px 8px !important;
            }
            .polaroid-bottom-tab {
              margin-top: -40px !important;
              height: 40px !important;
            }
            .take-photo-polaroid-btn.camera-shutter-btn {
              width: 40px !important;
              height: 40px !important;
              font-size: 13px !important;
            }
            .take-photo-polaroid-btn.camera-shutter-btn span {
              width: 16px !important;
              height: 16px !important;
              font-size: 11px !important;
            }
            .take-photo-polaroid-btn.camera-shutter-btn span:last-child {
              bottom: -14px !important;
              font-size: 10px !important;
            }
          }
          
          /* ------- ADD: Psychedelic animation ------- */
          @keyframes psychedelic-shift {
            0% {
              background-position: 0% 0%, 0 0, 0 0;
            }
            25% {
              background-position: 100% 0%, 10px 10px, -10px -10px;
            }
            50% {
              background-position: 100% 100%, 20px 20px, -20px -20px;
            }
            75% {
              background-position: 0% 100%, 10px 30px, -10px -30px;
            }
            100% {
              background-position: 0% 0%, 0 0, 0 0;
            }
          }
          
          /* Improve the photo label */
          .photo-label {
            padding: 8px 0;
            text-align: center;
            font-size: 14px;
            color: #333;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
          }
          
          /* Add animation for progress value changes */
          @keyframes progressPulse {
            0% { opacity: 0.2; }
            50% { opacity: 1; }
            100% { opacity: 0.2; }
          }
        `;
        
        document.head.append(styleElement);
        
        // Update aspect ratio when orientation changes
        const updateAspectRatio = () => {
          const isPortrait = window.innerHeight > window.innerWidth;
          document.documentElement.style.setProperty(
            '--current-aspect-ratio', 
            isPortrait ? '896/1152' : '1152/896'
          );
        };
        
        // Set initial aspect ratio
        updateAspectRatio();
        
        // Update on resize
        window.addEventListener('resize', updateAspectRatio);
        
        return () => {
          window.removeEventListener('resize', updateAspectRatio);
          if (styleElement && document.head.contains(styleElement)) {
            styleElement.remove();
          }
        };
      }, [])}
    </>
  );
};

export default App;

