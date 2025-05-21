import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getModelOptions, defaultStylePrompts as initialStylePrompts } from './constants/settings';
import { photoThoughts, randomThoughts } from './constants/thoughts';
import { saveSettingsToCookies } from './utils/cookies';
import { styleIdToDisplay } from './utils';
import { getCustomDimensions, centerCropImage, blobToDataURL } from './utils/imageProcessing';
import { goToPreviousPhoto, goToNextPhoto } from './utils/photoNavigation';
import { loadPrompts, getRandomStyle, getRandomMixPrompts } from './services/prompts';
import { initializeSogniClient } from './services/sogni';
import { enhancePhoto, undoEnhancement } from './services/PhotoEnhancer';
import { shareToTwitter } from './services/TwitterShare';
import { trackPageView } from './utils/analytics';
import clickSound from './click.mp3';
import cameraWindSound from './camera-wind.mp3';
import slothicornImage from './slothicorn-camera.png';
import light1Image from './light1.png';
import light2Image from './light2.png';
import './App.css';
import './styles/style-dropdown.css';
import './styles/ios-chrome-fixes.css';
import './styles/mobile-portrait-fixes.css'; // New critical mobile portrait fixes
import CameraView from './components/camera/CameraView';
import CameraStartMenu from './components/camera/CameraStartMenu';
import StyleDropdown from './components/shared/StyleDropdown';
import AdvancedSettings from './components/shared/AdvancedSettings';
import promptsData from './prompts.json';
import PhotoGallery from './components/shared/PhotoGallery';
import { useApp } from './context/AppContext.tsx';
import TwitterShareModal from './components/shared/TwitterShareModal';

const App = () => {
  const videoReference = useRef(null);
  const canvasReference = useRef(null);
  const shutterSoundReference = useRef(null);
  const cameraWindSoundReference = useRef(null);
  const slothicornReference = useRef(null);

  // --- Use AppContext for settings ---
  const { settings, updateSetting, resetSettings } = useApp();
  const { 
    selectedStyle, 
    selectedModel, 
    numImages,
    promptGuidance, 
    controlNetStrength, 
    controlNetGuidanceEnd, 
    flashEnabled, 
    keepOriginalPhoto,
    positivePrompt,
    stylePrompt,
    negativePrompt,
    seed,
    soundEnabled,
    slothicornAnimationEnabled
  } = settings;
  // --- End context usage ---

  // Add state for style prompts instead of modifying the imported constant
  const [stylePrompts, setStylePrompts] = useState(initialStylePrompts);

  // Info modal state - adding back the missing state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPhotoGrid, setShowPhotoGrid] = useState(false);
  
  // Add the start menu state here
  const [showStartMenu, setShowStartMenu] = useState(true);

  // Photos array
  const [photos, setPhotos] = useState([]);

  // Index of currently selected photo (null => show webcam)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  // Which sub-image are we showing from that photo?
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);

  // Countdown 3..2..1 for shutter
  const [countdown, setCountdown] = useState(0);
  // Show flash overlay
  const [showFlash, setShowFlash] = useState(false);

  // Sogni
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // Camera devices
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(null); // Keep this local state
  const [isFrontCamera, setIsFrontCamera] = useState(true); // Keep this local state

  // State for orientation handler cleanup
  const [orientationHandler, setOrientationHandler] = useState(null);

  // Determine the desired dimensions for Sogni (and camera constraints)
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions(); // Keep this

  // Drag-and-drop state
  const [dragActive, setDragActive] = useState(false); // Keep this

  // Add state to store the last used photo blob and data URL for "More" button
  const [lastPhotoData, setLastPhotoData] = useState({ blob: null, dataUrl: null }); // Keep this

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
        setStylePrompts(() => {
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

  // At the top of App component, add a new ref for tracking project state
  const projectStateReference = useRef({
    currentPhotoIndex: 0,
    jobs: new Map(), // Map<jobId, {index: number, status: string, resultUrl?: string}>
    startedJobs: new Set(), // Track which indices have started jobs
    completedJobs: new Map(), // Store completed jobs that arrive before start
    pendingCompletions: new Map() // Store completions that arrive before we have the mapping
  });

  // Add a state to control the visibility of the overlay panel
  const [showControlOverlay, setShowControlOverlay] = useState(false); // Keep this
  // Add a state to control the custom dropdown visibility
  const [showStyleDropdown, setShowStyleDropdown] = useState(false); // Keep this

  // Add new state for button cooldown
  const [isPhotoButtonCooldown, setIsPhotoButtonCooldown] = useState(false); // Keep this
  // Ref to track current project
  const activeProjectReference = useRef(null); // Keep this

  // Add state for current thought
  const [currentThought, setCurrentThought] = useState(null); // Keep this

  // Add state to track if camera has been manually started by the user
  const [cameraManuallyStarted, setCameraManuallyStarted] = useState(false);

  // Add state for Twitter share modal
  const [showTwitterModal, setShowTwitterModal] = useState(false);
  const [twitterPhotoIndex, setTwitterPhotoIndex] = useState(null);

  // Track page views when view changes
  useEffect(() => {
    // Get current view state based on app state
    let currentView = 'start-menu';
    
    if (selectedPhotoIndex !== null) {
      // Track individual photo view
      currentView = `photo/${selectedPhotoIndex}`;
    } else if (showPhotoGrid) {
      currentView = 'gallery';
    } else if (!showStartMenu) {
      currentView = 'camera';
    }
    
    // Send page view to Google Analytics
    trackPageView(currentView);
  }, [selectedPhotoIndex, showPhotoGrid, showStartMenu]);

  // --- Ensure handlers are defined here, before any JSX or usage ---
  // Update handleUpdateStyle to use updateSetting
  const handleUpdateStyle = (style) => {
    updateSetting('selectedStyle', style); 
    if (style === 'custom') {
      updateSetting('positivePrompt', ''); 
    } else {
      const prompt = stylePrompts[style] || '';
      updateSetting('positivePrompt', prompt); 
    }
  };

  // Update handlePositivePromptChange to use updateSetting
  const handlePositivePromptChange = (value) => {
    updateSetting('positivePrompt', value); 
    if (selectedStyle !== 'custom') {
      const currentPrompt = stylePrompts[selectedStyle] || '';
      if (value !== currentPrompt) {
        updateSetting('selectedStyle', 'custom'); 
      }
    }
  };

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
          
          // Apply mirror effect for front camera
          videoReference.current.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
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
      
      // Update mirror effect when front/back camera changes
      videoElement.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
    }

    // Cleanup
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('loadedmetadata', handleVideoLoaded);
      }
    };
  }, [videoReference.current, isFrontCamera]);

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

  // Update the handler for initiating Twitter share
  const handleShareToX = async (photoIndex) => {
    // Set the photo index and open the modal
    setTwitterPhotoIndex(photoIndex);
    setShowTwitterModal(true);
  };
  
  // Add a handler for the actual sharing with custom message
  const handleTwitterShare = async (customMessage) => {
    // Call the extracted Twitter sharing service with custom message
    await shareToTwitter({
      photoIndex: twitterPhotoIndex,
      photos,
      setBackendError,
      customMessage
    });
  };

  // -------------------------
  //   Sogni initialization
  // -------------------------
  const initializeSogni = useCallback(async () => {
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
        // Only keep this for logging or other job events if needed
      });
    } catch (error) {
      console.error('Failed initializing Sogni client:', error);
      
      // Don't show an error for throttling, it's expected during initialization
      if (error.message === 'Status check throttled') {
        console.log('Status check throttled, will use cached status');
        // If we have a previous client, keep using it
        if (sogniClient) {
          console.log('Using existing Sogni client');
          setIsSogniReady(true);
          return;
        }
        // Otherwise retry after a short delay
        setTimeout(() => {
          console.log('Retrying Sogni initialization after throttle');
          initializeSogni();
        }, 1000);
        return;
      }
      
      // Set a user-friendly error message for real issues
      if (error.message && error.message.includes('Failed to fetch')) {
        setBackendError('The backend server is not running. Please start it using "npm run server:dev" in a separate terminal.');
      } else if (error.message && error.message.includes('401')) {
        setBackendError('Authentication failed: Invalid Sogni credentials. Please update the server/.env file with valid credentials.');
      } else {
        setBackendError(`Error connecting to the Sogni service: ${error.message}`);
      }
    }
  }, [sogniClient]); // Added sogniClient as dependency, state setters are stable

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
      
    } catch (error) {
      console.error('Failed to get camera access', error);
    }
  }, [desiredWidth, desiredHeight, isFrontCamera, videoReference, setOrientationHandler]);

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
    const initializeAppOnMount = async () => {
      await listCameras();
      // Initialize Sogni, but do not start camera here
      await initializeSogni();
    };
    
    initializeAppOnMount();
    
    // Return cleanup function to disconnect Sogni client when component unmounts
    return () => {
      if (sogniClient) {
        console.log('App component unmounting, disconnecting Sogni client');
        
        // Use the client's disconnect method directly
        sogniClient.disconnect().catch(error => {
          console.warn('Error during cleanup disconnect:', error);
        });
        
        // Also attempt to disconnect all instances as a fallback
        if (sogniClient.constructor && typeof sogniClient.constructor.disconnectAll === 'function') {
          console.log('Calling disconnectAll for cleanup');
          sogniClient.constructor.disconnectAll().catch(error => {
            console.warn('Error during disconnectAll cleanup:', error);
          });
        }
      }
    };
  }, [listCameras, initializeSogni]);
  
  // Add an effect specifically for page unload/refresh cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sogniClient) {
        console.log('Page unloading, triggering final cleanup');
        
        if (sogniClient.constructor && typeof sogniClient.constructor.disconnectAll === 'function') {
          // Call disconnectAll synchronously to ensure it runs before page unload
          try {
            sogniClient.constructor.disconnectAll();
          } catch (error) {
            console.warn('Error during page unload cleanup:', error);
          }
        }
      }
    };
    
    // Use the capture phase to ensure our handler runs first
    window.addEventListener('beforeunload', handleBeforeUnload, { capture: true });
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload, { capture: true });
    };
  }, [sogniClient]);

  // If we return to camera, ensure the video is playing
  useEffect(() => {
    if (cameraManuallyStarted && selectedPhotoIndex === null && videoReference.current) {
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
  }, [selectedPhotoIndex, startCamera, selectedCameraDeviceId, cameraManuallyStarted]);

  // Preload images for the selected photo
  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]) {
      for (const url of photos[selectedPhotoIndex].images) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [selectedPhotoIndex, photos]);

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
  const generateFromBlob = async (photoBlob, newPhotoIndex, dataUrl, isMoreOperation = false, sourceType = 'upload') => {
    try {
      setLastPhotoData({ blob: photoBlob, dataUrl, sourceType });
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      // Prompt logic: use context state
      let finalPositivePrompt = positivePrompt.trim();
      if (!finalPositivePrompt) {
        if (selectedStyle === 'custom') {
          finalPositivePrompt = '';
        } else if (selectedStyle === 'random') {
          // ... (prompt loading logic remains the same)
          const randomStyle = getRandomStyle(stylePrompts);
          finalPositivePrompt = stylePrompts[randomStyle] || '';
        } else if (selectedStyle === 'randomMix') {
          // Use numImages from context state
          finalPositivePrompt = getRandomMixPrompts(numImages, stylePrompts); 
        } else {
          finalPositivePrompt = stylePrompts[selectedStyle] || '';
        }
      }
      // Style prompt logic: use context state
      let finalStylePrompt = stylePrompt.trim() || ''; 
      // Negative prompt logic: use context state
      let finalNegativePrompt = negativePrompt.trim() || 'lowres, worst quality, low quality'; 
      // Seed logic: use context state
      let seedValue = seed.trim();
      let seedParam = undefined;
      if (seedValue !== '') {
        const parsed = parseInt(seedValue, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 4294967295) {
          seedParam = parsed;
        }
      }
      
      console.log('Style prompt:', finalPositivePrompt);
      console.log('Source type:', sourceType);
      projectStateReference.current = {
        currentPhotoIndex: newPhotoIndex,
        pendingCompletions: new Map(),
        jobMap: new Map() // Store jobMap in projectState
      };

      // Skip setting up photos state if this is a "more" operation
      if (!isMoreOperation) {
        setPhotos(previous => {
          const existingProcessingPhotos = previous.filter(photo => 
            photo.generating && photo.jobId && photo.progress
          );
          
          const newPhotos = [];
          if (keepOriginalPhoto) { // Use context state
            newPhotos.push({
              id: Date.now(),
              generating: false,
              loading: false,
              images: [dataUrl],
              originalDataUrl: dataUrl,
              newlyArrived: false,
              isOriginal: true,
              sourceType // Include sourceType in original photo
            });
          }
          
          // Use numImages from context state
          for (let index = 0; index < numImages; index++) { 
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
                statusText: 'Calling Art Robot...',
                sourceType // Include sourceType in generated photos
              });
            }
          }
          return newPhotos;
        });
      }

      if (!isMoreOperation) {
        setShowPhotoGrid(true);
      }

      let processedBlob = photoBlob;
      if (isIOS) {
        // ... (blob processing remains the same)
      }
      
      const blobArrayBuffer = await processedBlob.arrayBuffer();
      
      // Create project using context state for settings
      const project = await sogniClient.projects.create({ 
        modelId: selectedModel,
        positivePrompt: finalPositivePrompt,
        negativePrompt: finalNegativePrompt,
        stylePrompt: finalStylePrompt,
        sizePreset: 'custom',
        width: desiredWidth,
        height: desiredHeight,
        steps: 7,
        guidance: promptGuidance,
        numberOfImages: numImages, // Use context state
        scheduler: 'DPM Solver Multistep (DPM-Solver++)',
        timeStepSpacing: 'Karras',
        controlNet: {
          name: 'instantid',
          image: new Uint8Array(blobArrayBuffer),
          strength: controlNetStrength,
          mode: 'balanced',
          guidanceStart: 0,
          guidanceEnd: controlNetGuidanceEnd,
        },
        sourceType: sourceType, // Add sourceType for analytics tracking
        ...(seedParam !== undefined ? { seed: seedParam } : {})
      });

      activeProjectReference.current = project.id;
      console.log('Project created:', project.id, 'with jobs:', project.jobs);
      console.log('Initializing job map for project', project.id);

      // Set up handlers for any jobs that exist immediately
      console.log('Project jobs to set up:', project.jobs);
      if (project.jobs && project.jobs.length > 0) {
        project.jobs.forEach((job, index) => {
          projectStateReference.current.jobMap.set(job.id, index);
        });
      }

      // Attach a single project-level job event handler
      project.on('job', (event) => {
        const { type, jobId, workerName, queuePosition, jobIndex, positivePrompt, progress } = event;
        
        // Find the photo associated with this job
        const photoIndex = projectStateReference.current.jobMap.has(jobId)
          ? projectStateReference.current.jobMap.get(jobId) + (keepOriginalPhoto ? 1 : 0)
          : -1; // Handle cases where job ID might not be in the map yet
          
        if (photoIndex === -1) {
            console.warn(`Job event received for unknown job ID: ${jobId}. Event type: ${type}. Skipping update.`);
            return;
        }

        setPhotos(prev => {
          const updated = [...prev];
          if (photoIndex >= updated.length) return prev;
          // Try to find a hashtag for the style prompt
          let hashtag = '';
          const stylePromptValue = updated[photoIndex].stylePrompt;
          if (stylePromptValue) {
            const foundKey = Object.entries(promptsData).find(([, value]) => value === stylePromptValue)?.[0];
            if (foundKey) hashtag = `#${foundKey}`;
          }
          if (type === 'initiating') {
            updated[photoIndex] = {
              ...updated[photoIndex],
              statusText: `${workerName || 'unknown'} loading model`,
              workerName: workerName || 'unknown',
              jobId,
              jobIndex,
              positivePrompt,
              stylePrompt: stylePrompt.trim(),  // Add stylePrompt here
              hashtag
            };
          } else if (type === 'started') {
            updated[photoIndex] = {
              ...updated[photoIndex],
              statusText: `${workerName || 'unknown'} starting job`,
              workerName: workerName || 'unknown',
              jobId,
              jobIndex,
              positivePrompt,
              stylePrompt: stylePrompt.trim(),  // Add stylePrompt here
              hashtag
            };
          } else if (type === 'progress') {
            const cachedWorkerName = updated[photoIndex].workerName || 'unknown';
            const displayProgress = Math.round((progress ?? 0) * 100);
            updated[photoIndex] = {
              ...updated[photoIndex],
              generating: true,
              loading: true,
              progress: displayProgress,
              statusText: `${cachedWorkerName} processing... ${displayProgress}%`,
              jobId
            };
          } else if (type === 'queued') { // Handle the new 'queued' event
              const currentStatusText = updated[photoIndex].statusText || 'Calling Art Robot...';
              // Only update if the current status text still indicates waiting/calling
              if (currentStatusText.includes('Calling Art Robot') || currentStatusText.includes('In queue')) {
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  generating: true,
                  loading: true,
                  // Update status text with queue position
                  statusText: `Queue position ${queuePosition}`,
                  jobId, // Ensure jobId is set
                };
              }
          }
          return updated;
        });
      });

      // Project level events
      project.on('progress', (progressEvent) => {
        console.log(`Progress event for project ${project.id}:`, progressEvent);
        
        // Check if there's a mismatch between event project ID and current project ID
        if (progressEvent.projectId && progressEvent.projectId !== project.id) {
          console.warn(`Project ID mismatch! Event: ${progressEvent.projectId}, Current: ${project.id}`);
        }
        
        // Rest of progress handling
      });

      project.on('completed', () => {
        console.log('Project completed');
        activeProjectReference.current = null; // Clear active project reference when complete
      });

      project.on('failed', (error) => {
        console.error('Project failed:', error);
        
        // Get the failed project's ID from the project or error object
        const failedProjectId = project.id;
        // Check if error has a projectId property that might override the project.id
        const errorProjectId = error && typeof error === 'object' && 'projectId' in error ? 
          error.projectId : null;
        
        // Use error's projectId if available, otherwise fallback to project.id
        const effectiveProjectId = errorProjectId || failedProjectId;
        
        console.log(`Project failed with ID ${effectiveProjectId}`);
        
        // Only clear active project reference if it matches the failed project
        if (activeProjectReference.current && activeProjectReference.current.id === effectiveProjectId) {
          console.log(`Clearing active project reference for failed project ${effectiveProjectId}`);
          activeProjectReference.current = null;
        } else {
          console.log(`Failed project ${effectiveProjectId} is not the active project, not clearing reference`);
        }
        
        // Update the state for photos that belong to this failed project only
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            // Only mark photos as failed if they belong to this specific project
            // and are still in generating state
            if (photo.generating && photo.projectId === effectiveProjectId) {
              console.log(`Marking photo ${photo.id} as failed due to project ${effectiveProjectId} failure`);
              return {
                ...photo,
                generating: false,
                loading: false,
                error: 'Whoops, request failed',
                permanentError: true, // Mark as permanent error
                statusText: 'Failed' // Update status text
              };
            }
            return photo;
          });
        });
      });

      // Individual job events
      project.on('jobCompleted', (job) => {
        if (!job.resultUrl) {
          console.error('Missing resultUrl for job:', job.id);
          return;
        }
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        const positivePrompt = job.positivePrompt;
        
        console.log('📸 Job completed:', {
          jobId: job.id,
          positivePrompt,
          selectedStyle,
          stylePrompt: stylePrompt.trim()
        });
        
        let hashtag = '';
        if (positivePrompt) {
          const foundKey = Object.entries(promptsData).find(([, value]) => value === positivePrompt)?.[0];
          if (foundKey) {
            hashtag = `#${foundKey}`;
            console.log('📸 Found hashtag for prompt:', { positivePrompt, hashtag, foundKey });
          } else {
            console.log('📸 No hashtag match found for prompt:', positivePrompt);
          }
        }
        
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
            
            // If we have a valid stylePrompt, use that to help with hashtag lookup
            if (!hashtag && stylePrompt.trim()) {
              // Check if stylePrompt matches any key in promptsData
              const styleKey = Object.entries(promptsData).find(([, value]) => value === stylePrompt.trim())?.[0];
              if (styleKey) {
                console.log('📸 Found hashtag from stylePrompt:', styleKey);
                hashtag = `#${styleKey}`;
              }
            }
            
            // If we still don't have a hashtag but have a selectedStyle, use that
            if (!hashtag && selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix') {
              console.log('📸 Using selectedStyle for hashtag:', selectedStyle);
              hashtag = `#${selectedStyle}`;
            }
            
            updated[photoIndex] = {
              ...updated[photoIndex],
              generating: false,
              loading: false,
              progress: 100,
              images: [job.resultUrl],
              newlyArrived: true,
              positivePrompt, // Ensure we keep the positivePrompt
              stylePrompt: stylePrompt.trim(), // Make sure stylePrompt is included
              statusText: hashtag || `#${jobIndex+1}`
            };
            
            console.log('📸 Updated photo with result:', {
              photoIndex,
              hashtag,
              stylePrompt: updated[photoIndex].stylePrompt,
              positivePrompt: updated[photoIndex].positivePrompt,
              statusText: updated[photoIndex].statusText
            });
            
            // Check if all photos are done generating
            const stillGenerating = updated.some(photo => photo.generating);
            if (!stillGenerating && activeProjectReference.current) {
              // All jobs are done, clear the active project
              console.log('All jobs completed, clearing active project');
              activeProjectReference.current = null;
            }
            
            // Play camera wind sound when images are loaded into the grid
            if (soundEnabled && cameraWindSoundReference.current) {
              cameraWindSoundReference.current.currentTime = 0;
              cameraWindSoundReference.current.play().catch(error => {
                console.warn("Error playing camera wind sound:", error);
              });
            }
            
            return updated;
          });
        });
        img.src = job.resultUrl;
      });

      project.on('jobFailed', (job) => {
        console.error('Job failed:', job.id, job.error);
        
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        console.log('Looking up job index for failed job:', job.id, 'found:', jobIndex, 'in map:', projectStateReference.current.jobMap);
        if (jobIndex === undefined) {
          console.error('Unknown job failed:', job.id);
          return;
        }
        
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        console.log(`Marking failed job ${job.id} for box ${photoIndex}`);
        
        setPhotos(previous => {
          const updated = [...previous];
          if (!updated[photoIndex]) {
            console.error(`No photo box found at index ${photoIndex}`);
            return previous;
          }
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            error: 'Generation failed',
            permanentError: true, // Mark as permanent so it won't be overwritten
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
        if (keepOriginalPhoto) { // Use context state
          const originalPhoto = previous.find(p => p.isOriginal);
          if (originalPhoto) {
            updated.push(originalPhoto);
          }
        }
        
        // Use numImages from context state
        for (let index = 0; index < numImages; index++) { 
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
      
      setShowPhotoGrid(true);
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
      sourceType: 'upload' // Add sourceType for uploaded files
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
        generateFromBlob(croppedBlob, newPhotoIndex, croppedDataUrl, false, 'upload');
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
        generateFromBlob(file, newPhotoIndex, originalDataUrl, false, 'upload');
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
    
    // Play camera shutter sound if enabled
    if (soundEnabled && shutterSoundReference.current) {
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
      }, 700); 
    }
    // Process the capture
    captureAndSend();
  };

  const captureAndSend = async () => {
    const canvas = canvasReference.current;
    const video = videoReference.current;
    const isPortrait = window.innerHeight > window.innerWidth;
    
    // Set canvas dimensions to match the desired aspect ratio exactly
    // Portrait: 896x1152 (7:9 ratio), Landscape: 1152x896 (9:7 ratio)
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
    
    // Apply the mirror effect for front camera
    if (isFrontCamera) {
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
    }
    
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
    
    // Restore canvas state if we applied mirroring
    if (isFrontCamera) {
      context.restore();
    }

    // For iOS, ensure we capture a good frame by drawing again after a small delay
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      // Small delay to ensure the frame is fully captured before processing
      await new Promise(resolve => setTimeout(resolve, 100));
      // Redraw the frame with mirroring if needed
      if (isFrontCamera) {
        context.save();
        context.scale(-1, 1);
        context.translate(-canvas.width, 0);
      }
      
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
      
      if (isFrontCamera) {
        context.restore();
      }
    }

    // Generate initial data URL and blob
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    // Use a quality of 1.0 and explicitly use the PNG MIME type for iOS
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });
    
    if (!blob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Create a new photo item with the sourceType
    setPhotos(previous => {
      return [
        ...previous,
        {
          id: Date.now(),
          generating: true,
          images: [],
          error: null,
          originalDataUrl: null, // Will be updated with cropped version
          newlyArrived: false,
          generationCountdown: 10,
          sourceType: 'camera' // Add sourceType for camera captures
        }
      ];
    });

    // For all devices, ensure the final image has the exact desired aspect ratio
    // This prevents any issues with aspect ratio in the photo grid view
    const { width: targetWidth, height: targetHeight } = getCustomDimensions();
    console.log(`Enforcing aspect ratio ${targetWidth}:${targetHeight} for captured photo`);
    
    try {
      // Use centerCropImage to ensure the final image has the correct aspect ratio
      // This is important for consistency in the photo grid view
      const croppedBlob = await centerCropImage(blob, targetWidth, targetHeight);
      const croppedDataUrl = await blobToDataURL(croppedBlob);
      
      // For iOS Chrome, ensure the blob is fully ready by creating a new copy
      if (isIOS) {
        const reader = new FileReader();
        reader.onload = async function() {
          const arrayBuffer = this.result;
          const newBlob = new Blob([arrayBuffer], {type: 'image/png'});
          generateFromBlob(newBlob, photos.length, croppedDataUrl, false, 'camera');
        };
        reader.readAsArrayBuffer(croppedBlob);
      } else {
        generateFromBlob(croppedBlob, photos.length, croppedDataUrl, false, 'camera');
      }
    } catch (error) {
      console.error('Error during image cropping, using original capture:', error);
      // Fallback to original if cropping fails
      if (isIOS) {
        const reader = new FileReader();
        reader.onload = async function() {
          const arrayBuffer = this.result;
          const newBlob = new Blob([arrayBuffer], {type: 'image/png'});
          generateFromBlob(newBlob, photos.length, dataUrl, false, 'camera');
        };
        reader.readAsArrayBuffer(blob);
      } else {
        generateFromBlob(blob, photos.length, dataUrl, false, 'camera');
      }
    }
  };

  /**
   * Handle user selection of a different camera device.
   */
  const handleCameraSelection = async (e) => {
    const deviceId = typeof e === 'string' ? e : e.target.value;
    setSelectedCameraDeviceId(deviceId);
    await startCamera(deviceId);
    setCameraManuallyStarted(true); // User explicitly selected a camera
  };

  // -------------------------
  //   Main area (video)
  // -------------------------
  const renderMainArea = () => (
    <div className="main-content-area" style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Style selector in top left - shown in all views */}
      <div className="top-left-style-selector" style={{
        position: 'fixed',
        top: '24px',
        left: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}>
        <button
          className="header-style-select global-style-btn"
          onClick={() => setShowStyleDropdown(!showStyleDropdown)}
          style={{
            all: 'unset',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: '14px',
            color: '#333',
            cursor: 'pointer',
            padding: '8px 16px',
            paddingRight: '24px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.9)',
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
          
        <StyleDropdown
          isOpen={showStyleDropdown}
          onClose={() => setShowStyleDropdown(false)}
          selectedStyle={selectedStyle}
          updateStyle={handleUpdateStyle}
          defaultStylePrompts={stylePrompts}
          showControlOverlay={showControlOverlay}
          setShowControlOverlay={setShowControlOverlay}
          dropdownPosition="bottom" // Force dropdown to appear below the button since it's at the top of the screen
          triggerButtonClass=".global-style-btn"
        />
      </div>

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
          <button onClick={() => setBackendError(null)} style={{
            padding: '8px 16px',
            background: '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}>Okkkayy</button>
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
            onStyleSelect={handleUpdateStyle}
            showSettings={showControlOverlay}
            onToggleSettings={() => setShowControlOverlay(!showControlOverlay)}
            testId="camera-view"
            stylePrompts={stylePrompts}
            cameraDevices={cameraDevices}
            selectedCameraDeviceId={selectedCameraDeviceId}
            onCameraSelect={handleCameraSelection}
            onToggleCamera={handleToggleCamera}
            isFrontCamera={isFrontCamera}
            modelOptions={getModelOptions()}
            selectedModel={selectedModel}
            onModelSelect={(value) => {
              updateSetting('selectedModel', value);
              saveSettingsToCookies({ selectedModel: value });
            }}
            numImages={numImages}
            onNumImagesChange={(value) => {
              updateSetting('numImages', value);
              saveSettingsToCookies({ numImages: value });
            }}
            promptGuidance={promptGuidance}
            onPromptGuidanceChange={(value) => {
              updateSetting('promptGuidance', value);
              saveSettingsToCookies({ promptGuidance: value });
            }}
            controlNetStrength={controlNetStrength}
            onControlNetStrengthChange={(value) => {
              updateSetting('controlNetStrength', value);
              saveSettingsToCookies({ controlNetStrength: value });
            }}
            controlNetGuidanceEnd={controlNetGuidanceEnd}
            onControlNetGuidanceEndChange={(value) => {
              updateSetting('controlNetGuidanceEnd', value);
              saveSettingsToCookies({ controlNetGuidanceEnd: value });
            }}
            flashEnabled={flashEnabled}
            onFlashEnabledChange={(value) => {
              updateSetting('flashEnabled', value);
              saveSettingsToCookies({ flashEnabled: value });
            }}
            keepOriginalPhoto={keepOriginalPhoto}
            onKeepOriginalPhotoChange={(value) => {
              updateSetting('keepOriginalPhoto', value);
              saveSettingsToCookies({ keepOriginalPhoto: value });
            }}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={(value) => {
              updateSetting('soundEnabled', value);
              saveSettingsToCookies({ soundEnabled: value });
            }}
            slothicornAnimationEnabled={slothicornAnimationEnabled}
            onSlothicornAnimationEnabledChange={(value) => {
              updateSetting('slothicornAnimationEnabled', value);
              saveSettingsToCookies({ slothicornAnimationEnabled: value });
            }}
            onResetSettings={resetSettings} // Pass context reset function
          />
          
          {/* Other UI elements like canvas, flash effect, etc. */}
          <canvas ref={canvasReference} style={{ display: 'none' }} />
          
        </>
      )}
    </div>
  );

  // -------------------------
  //   Drag overlay
  // -------------------------
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
      
      // Hide slothicorn to prevent double appearance
      if (slothicornReference.current) {
        slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
        slothicornReference.current.classList.remove('animating');
      }
      // Show the start menu again instead of the camera
      setShowStartMenu(true);
      
      setTimeout(() => {
        // Remove the setStudioLightsHidden line - no studio lights animation needed
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
    
    // If the target is the film-frame, close the photo viewer
    const target = e.target;
    
    if (target.classList.contains('film-frame') && target.classList.contains('selected')) {
      // Close the photo viewer when clicking anywhere except on controls
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
        const button = document.querySelector('.global-style-btn');
        
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

  // The start menu state was moved to the top
  // Handler for the "Take Photo" option in start menu
  const handleTakePhotoOption = async () => {
    setShowStartMenu(false);
    // Start camera after user selects the option
    await startCamera(null);
    setCameraManuallyStarted(true); // User explicitly chose to take a photo
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
      sourceType: 'upload' // Add sourceType for uploaded files
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
        generateFromBlob(croppedBlob, newPhotoIndex, croppedDataUrl, false, 'upload');
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
        generateFromBlob(file, newPhotoIndex, originalDataUrl, false, 'upload');
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
    setCameraManuallyStarted(true); // User explicitly toggled camera
    
    // Also update the mirror effect immediately
    if (videoReference.current) {
      videoReference.current.style.transform = !isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
    }
  };

  // -------------------------
  //   Generate more photos with the same settings
  // -------------------------
  const handleGenerateMorePhotos = async () => {
    // Scroll the film-strip-content element to the top first thing
    const filmStripContent = document.querySelector('.film-strip-container div');
    if (filmStripContent) {
      filmStripContent.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

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
    
    // Use numImages from context state
    const numToGenerate = numImages; 
    
    // Use keepOriginalPhoto from context state
    const existingOriginalPhoto = keepOriginalPhoto ? photos.find(p => p.isOriginal) : null; 
    
    // Determine sourceType - prefer using the sourceType of the original photo we're generating from
    let sourceType = 'upload'; // Default to upload if we can't determine
    
    // If we have an existing original photo with sourceType, use that
    if (existingOriginalPhoto && existingOriginalPhoto.sourceType) {
      sourceType = existingOriginalPhoto.sourceType;
    } 
    // Otherwise check the lastPhotoData (the photo being used for generation)
    else if (lastPhotoData.sourceType) {
      sourceType = lastPhotoData.sourceType;
    }
    
    console.log(`Using sourceType '${sourceType}' for generating more photos`);
    
    setPhotos(() => {
      const newPhotos = existingOriginalPhoto ? [existingOriginalPhoto] : [];
      
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
          statusText: 'Calling Art Robot...',
          stylePrompt: '', // Use context stylePrompt here? Or keep empty?
          sourceType: sourceType // Store sourceType in photo object for reference
        });
      }
      
      return newPhotos;
    });
    
    try {
      const { blob, dataUrl } = lastPhotoData;
      const blobCopy = blob.slice(0, blob.size, blob.type);
      await new Promise(resolve => setTimeout(resolve, 50));
      const newPhotoIndex = existingOriginalPhoto ? 1 : 0;
      // Pass sourceType to generateFromBlob
      await generateFromBlob(blobCopy, newPhotoIndex, dataUrl, true, sourceType);
    } catch (error) {
      console.error('Error generating more photos:', error);
      setPhotos(() => {
        const newPhotos = existingOriginalPhoto ? [existingOriginalPhoto] : [];
        for (let i = 0; i < numToGenerate; i++) {
          newPhotos.push({
            id: Date.now() + i,
            generating: false,
            loading: false,
            error: `Error: ${error.message || error}`,
            originalDataUrl: lastPhotoData.dataUrl,
            permanentError: true,
            sourceType: sourceType // Store sourceType in photo object
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
      {/* Twitter Share Modal */}
      <TwitterShareModal 
        isOpen={showTwitterModal}
        onClose={() => setShowTwitterModal(false)}
        onShare={handleTwitterShare}
        imageUrl={twitterPhotoIndex !== null && photos[twitterPhotoIndex] ? photos[twitterPhotoIndex].images[0] : null}
        photoData={twitterPhotoIndex !== null ? photos[twitterPhotoIndex] : null}
      />
      
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
        {/* Control overlay panel - Use context state/handlers */}
        <AdvancedSettings 
          visible={showControlOverlay}
          onClose={() => setShowControlOverlay(false)}
          // Values from context settings
          positivePrompt={positivePrompt}
          stylePrompt={stylePrompt}
          negativePrompt={negativePrompt}
          seed={seed}
          selectedModel={selectedModel}
          numImages={numImages}
          promptGuidance={promptGuidance}
          controlNetStrength={controlNetStrength}
          controlNetGuidanceEnd={controlNetGuidanceEnd}
          flashEnabled={flashEnabled}
          keepOriginalPhoto={keepOriginalPhoto}
          // Handlers using updateSetting
          onPositivePromptChange={handlePositivePromptChange} 
          onStylePromptChange={(value) => updateSetting('stylePrompt', value)}
          onNegativePromptChange={(value) => updateSetting('negativePrompt', value)}
          onSeedChange={(value) => updateSetting('seed', value)}
          onModelSelect={(value) => updateSetting('selectedModel', value)}
          onNumImagesChange={(value) => updateSetting('numImages', value)}
          onPromptGuidanceChange={(value) => updateSetting('promptGuidance', value)}
          onControlNetStrengthChange={(value) => updateSetting('controlNetStrength', value)}
          // Remove incorrect setters, use updateSetting instead
          onControlNetGuidanceEndChange={(value) => updateSetting('controlNetGuidanceEnd', value)}
          onFlashEnabledChange={(value) => updateSetting('flashEnabled', value)}
          onKeepOriginalPhotoChange={(value) => updateSetting('keepOriginalPhoto', value)}
          soundEnabled={soundEnabled}
          onSoundEnabledChange={(value) => {
            updateSetting('soundEnabled', value);
            saveSettingsToCookies({ soundEnabled: value });
          }}
          slothicornAnimationEnabled={slothicornAnimationEnabled}
          onSlothicornAnimationEnabledChange={(value) => {
            updateSetting('slothicornAnimationEnabled', value);
            saveSettingsToCookies({ slothicornAnimationEnabled: value });
          }}
          onResetSettings={resetSettings} // Pass context reset function
          // Props still using local state/logic
          cameraDevices={cameraDevices}
          selectedCameraDeviceId={selectedCameraDeviceId}
          onCameraSelect={handleCameraSelection} 
          modelOptions={getModelOptions()} 
        />

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
        <div className="studio-lights-container">
          <img 
            src={light1Image} 
            alt="Studio Light" 
            className="studio-light left" 
          />
          <img 
            src={light2Image} 
            alt="Studio Light" 
            className="studio-light right" 
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

        {/* Conditionally render photo grid only if Sogni client is ready */}
        {showPhotoGrid && isSogniReady && sogniClient && (
          <div className={`film-strip-container ${showPhotoGrid ? 'visible' : ''}`}>
        <PhotoGallery
          photos={photos}
          selectedPhotoIndex={selectedPhotoIndex}
          setSelectedPhotoIndex={setSelectedPhotoIndex}
          showPhotoGrid={showPhotoGrid}
          handleBackToCamera={handleBackToCamera}
          handlePreviousPhoto={handlePreviousPhoto}
          handleNextPhoto={handleNextPhoto}
          handlePhotoViewerClick={handlePhotoViewerClick}
          handleGenerateMorePhotos={handleGenerateMorePhotos}
          handleShowControlOverlay={() => setShowControlOverlay(!showControlOverlay)}
          isGenerating={photos.some(photo => photo.generating)}
          keepOriginalPhoto={keepOriginalPhoto}
          lastPhotoData={lastPhotoData}
          activeProjectReference={activeProjectReference}
          isSogniReady={isSogniReady}
          toggleNotesModal={toggleNotesModal}
          setPhotos={setPhotos}
          selectedStyle={selectedStyle}
          stylePrompts={stylePrompts}
          enhancePhoto={enhancePhoto}
          undoEnhancement={undoEnhancement}
          sogniClient={sogniClient}
          desiredWidth={desiredWidth}
          desiredHeight={desiredHeight}
          selectedSubIndex={selectedSubIndex}
          handleShareToX={handleShareToX}
          slothicornAnimationEnabled={slothicornAnimationEnabled}
        />
          </div>
        )}

        <canvas ref={canvasReference} className="hidden" />

        {/* Slothicorn mascot with direct DOM manipulation */}
        {!showStartMenu && slothicornAnimationEnabled && (
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
            bottom: 20px !important;
            background: linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%) !important;
            color: white !important;
            border: none !important;
            padding: 10px 18px !important;
            border-radius: 8px !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
            cursor: pointer !important;
            font-weight: bold !important;
            font-size: 14px !important;
            z-index: 999999 !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            transition: all 0.2s ease !important;
          }
          
          .enhance-photo-btn:hover {
            transform: scale(1.05) !important;
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
            bottom: 20px !important;
            background: linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%) !important;
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

          .selected-photo-container .enhance-photo-btn:hover {
            transform: scale(1.05) !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
          }

          .selected-photo-container .enhance-photo-btn:disabled {
            background: #cccccc !important;
            cursor: default !important;
            transform: none !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
          }
          
          /* ------- FIX 4: Loading image fade effect ------- */
          .film-frame.loading {
            position: relative;
          }
          
          .film-frame.loading img {
            transition: opacity 5s;
          }
                    
          /* Fallback image styling */
          .film-frame[data-error="true"] img,
          .film-frame img.fallback {
            filter: grayscale(20%) !important;
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
            bottom: 20px !important;
            background: linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%) !important;
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
            border-radius: 0 !important;
          }
          
          /* Update film frame images */
          .film-frame img {
            object-fit: cover;
            width: 100%;
          }
          .fade-in {
            transition: opacity 0.5s !important;
          }

          /* ------- UPDATED: Improve Film Frame Hover Effects ------- */
          .film-frame {
            transform-origin: center center !important;
            transform: scale(1) translateZ(0) !important;
            will-change: transform, box-shadow !important;
            /* Remove the default transition to prevent background animations */
          }
          
          /* Only apply transitions on hover/active for deliberate interaction */
          .film-frame:not(.selected):hover {
            transform: scale(1.05) translateZ(0) !important;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25) !important;
            transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), 
                        box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
          }
          
          .film-frame:not(.selected):active {
            transform: scale(0.98) translateZ(0) !important;
            box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2) !important;
            transition: all 0.1s ease-out !important;
          }
          
          /* Ensure only the deliberately selected photo animates */
          .film-frame.selected {
            transform: scale(1) !important;
          }
          
          /* Add transition only for the specific photo being selected/deselected */
          .film-frame.animating-selection {
            transition: transform 0.5s cubic-bezier(0.2, 0, 0.2, 1) !important;
          }
          
          /* Improve photo label appearance */
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

          /* ------- Responsive Polaroid Frame for Mobile ------- */
          @media (max-width: 600px) {
            .polaroid-frame {
              max-width: 99vw !important;
              border-radius: 4px !important;
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

