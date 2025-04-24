import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SogniClient } from "@sogni-ai/sogni-client";
import { API_CONFIG } from './config/cors';
import { SOGNI_URLS } from './config/sogni';
import clickSound from './click.mp3';
import cameraWindSound from './camera-wind.mp3';
import slothicornImage from './slothicorn-camera.png';
import light1Image from './light1.png';
import light2Image from './light2.png';
import './App.css';
import prompts from './prompts.json';

/**
 * Default style prompts
 */
const defaultStylePrompts = {
  custom: ``,
  ...Object.fromEntries(
    Object.entries(prompts)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
  )
};

// Add random style that uses all prompts
defaultStylePrompts.random = `{${Object.values(prompts).join('|')}}`;

/**
 * Returns 1280×720 (landscape) or 720×1280 (portrait)
 * so that Sogni returns images that match the orientation.
 * These must be integers between 256 and 2048.
 */
function getCustomDimensions() {
  const isPortrait = window.innerHeight > window.innerWidth;
  if (isPortrait) {
    return { width: 896, height: 1152 };
  } else {
    return { width: 1152, height: 896 };
  }
}

/** 
 * Helper: resize dataURL so original matches the Sogni dimension 
 * for easy side-by-side comparison (no skew).
 */
async function resizeDataUrl(dataUrl, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // fill black to avoid any transparent edges
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

/**
 * Calls the describe_image_upload API to get a textual description
 * of the given photo blob.
 */
async function describeImage(photoBlob) {
  const formData = new FormData();
  formData.append("file", photoBlob, "photo.png");
  
  try {
    const response = await fetch("https://prompt.sogni.ai/describe_image_upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      console.warn("API describe_image_upload returned non-OK", response.statusText);
      return "";
    }

    const json = await response.json();
    // the API returns { "description": "...some text..." }
    return json.description || "";
  } catch (error) {
    console.error("Error describing image:", error);
    return "";
  }
}

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const shutterSoundRef = useRef(null);
  const cameraWindSoundRef = useRef(null);
  const slothicornRef = useRef(null);

  // Style selection -- default to "randomMix" instead of "anime"
  const [selectedStyle, setSelectedStyle] = useState('randomMix');
  const [customPrompt, setCustomPrompt] = useState('');


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
  const [flashEnabled, setFlashEnabled] = useState(true);
  // Removed the single `realism` state in favor of styleRealism
  const [keepOriginalPhoto, setKeepOriginalPhoto] = useState(true);

  // Sogni
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // Camera devices
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(null);

  // Determine the desired dimensions for Sogni (and camera constraints)
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions();

  // Drag-and-drop state
  const [dragActive, setDragActive] = useState(false);

  // First, let's create a proper job tracking map at the top of the App component:
  const jobMapRef = useRef(new Map());

  // First, let's track project setup progress properly
  const [projectSetupProgress, setProjectSetupProgress] = useState(0);

  // At the top of App component, add a new ref for tracking project state
  const projectStateRef = useRef({
    currentPhotoIndex: 0,
    jobs: new Map(), // Map<jobId, {index: number, status: string, resultUrl?: string}>
    startedJobs: new Set(), // Track which indices have started jobs
    completedJobs: new Map(), // Store completed jobs that arrive before start
    pendingCompletions: new Map() // Store completions that arrive before we have the mapping
  });

  // Calculate aspect ratio for loading boxes
  const isPortrait = desiredHeight > desiredWidth;
  const thumbnailWidth = 220; // Wider for landscape
  const thumbnailHeight = 130; // Shorter for landscape

  // First, add the model options at the top of the file
  const modelOptions = [
    { label: '🅂 Sogni.XLT 𝛂1 (SDXL Turbo)', value: 'coreml-sogniXLturbo_alpha1_ad' },
    { label: 'DreamShaper v2.1 (SDXL Turbo)', value: 'coreml-dreamshaperXL_v21TurboDPMSDE' },
    { label: 'JuggernautXL 9 + RD Photo2 (SDXL Lightning)', value: 'coreml-juggernautXL_v9Rdphoto2Lightning' }
  ];

  // At the top of App component, add new state variables
  const [selectedModel, setSelectedModel] = useState('coreml-sogniXLturbo_alpha1_ad');
  const [numImages, setNumImages] = useState(8);
  const [promptGuidance, setPromptGuidance] = useState(2);
  const [controlNetStrength, setControlNetStrength] = useState(0.8);
  const [controlNetGuidanceEnd, setControlNetGuidanceEnd] = useState(0.6);

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
  const activeProjectRef = useRef(null);

  // Add back the thought arrays
  const photoThoughts = [
    "Ooh, I can't wait to see how this turns out!",
    "I wonder if they'll try the anime style...",
    "These photos are going to be amazing!",
    "I love being your photography assistant! 💕",
    "I learned this technique from Annie Leibovitz!",
    "This reminds me of my modeling days...",
    "Should we try a different angle?",
    "The composition is *chef's kiss*",
    "Getting some real Vogue vibes here!",
    "I used to be a roadie for the Gorillaz.",
    "Let's get creative with the styles!",
    "Beep Boop, you made this!",
    "My other camera is a Diffuser",
    "The lighting is perfect today!",
    "Ooh, I can't wait to see how this turns out!",
    "The magic is happening...",
    "Making something special just for you!",
    "Almost there...",
    "This is going to look amazing!",
    "Adding the finishing touches...",
    "Sprinkling some digital pixie dust...",
    "Just a few more seconds...",
    "Creating something magical...",
    "The anticipation is killing me!",
    "Ur participating in decentralized art right now!",
    "A buncha magical art robots hard at work...",
    "Good art takes time to develop..."
  ];

  const randomThoughts = [
    "We put the ComfyUI in UR Automatic1111",
    "Our CFG scale goes up to 11",
    "Ask me about my IT/S",
    "Prompt me, I dare you",
    "Teaching computers to draw since 2023",
    "Keep Calm and Diffuse On",
    "ControlNet is My Co-Pilot",
    "My unicorn horn adds +10 to photo magic",
    "Let's make some art!",
    "Time for some photobooth magic!",
    "Do rainbows taste like Skittles?",,
    "Maybe my horn gets WiFi...",
    "Wonder if my horn glows in the dark...",
    "Maybe I should start a podcast...",
    "Sometimes I pretend I'm a disco ball",
    "I'm sensing a viral photo coming!",
    "Today is going to be a good day.",
    "My horn doubles as a selfie stick.",
    "First the photobooth, and then the world baby!",
    "You down to clown? Style Prompt that is."
  ];

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
    const thoughts = activeProjectRef.current ? photoThoughts : randomThoughts;
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
    const initialDelay = 5000 + Math.random() * 15000;
    const firstThought = setTimeout(() => {
      showThought();
    }, initialDelay);

    // Set up interval for random thoughts
    const interval = setInterval(() => {
      if (selectedPhotoIndex === null) {
        showThought();
      }
    }, 18000); // Fixed 18 second interval

    return () => {
      clearTimeout(firstThought);
      clearInterval(interval);
    };
  }, [showThought, selectedPhotoIndex]);

  // Camera aspect ratio useEffect
  useEffect(() => {
    const handleVideoLoaded = () => {
      if (videoRef.current) {
        const { videoWidth, videoHeight } = videoRef.current;
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
    const videoElement = videoRef.current;
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
  }, [videoRef.current]);

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
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      document.body.classList.add('ios-device');
      
      // When showing the photo viewer, prevent background scrolling
      if (selectedPhotoIndex !== null) {
        document.body.classList.add('prevent-scroll');
      } else {
        document.body.classList.remove('prevent-scroll');
      }
    }
    
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, [selectedPhotoIndex]);

  // Add this useEffect at the beginning of the component
  useEffect(() => {
    // Simple mobile detection
    const isMobile = /iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || (window.innerWidth <= 768);
    
    if (isMobile) {
      alert("This app is not yet optimized for mobile, please use a desktop! 🙆🏻‍♂️🙏");
    }
  }, []);

  // -------------------------
  //   Sogni initialization
  // -------------------------
  const initializeSogni = async () => {
    try {
      let appId = import.meta.env.VITE_SOGNI_APP_ID + generateUUID();
      console.log('appId', appId);
      
      // Pass only the required parameters that match the SDK's createInstance method
      const client = await SogniClient.createInstance({
        appId: appId,
        testnet: true,
        network: 'fast',
        logLevel: 'debug',
        restEndpoint: SOGNI_URLS.api,
        socketEndpoint: SOGNI_URLS.socket
      });

      await client.account.login(
        import.meta.env.VITE_SOGNI_USERNAME,
        import.meta.env.VITE_SOGNI_PASSWORD
      );

      setSogniClient(client);
      setIsSogniReady(true);
    } catch (error) {
      console.error('Failed initializing Sogni client:', error);
    }
  };

  /**
   * Start the camera stream for a given deviceId or fallback.
   * Try to capture at appropriate dimensions based on device and orientation.
   */
  const startCamera = useCallback(async (deviceId) => {
    // Check if we're on mobile and iOS
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isPortrait = window.innerHeight > window.innerWidth;
    
    console.log(`Camera setup - isMobile: ${isMobile}, isIOS: ${isIOS}, isPortrait: ${isPortrait}`);
    
    // Determine appropriate constraints based on device/orientation
    let constraints;
    
    if (isMobile) {
      // For mobile devices, use 9:7 aspect ratio
      const aspectRatio = isPortrait ? 7/9 : 9/7;
      constraints = deviceId
        ? {
            video: {
              deviceId,
              facingMode: 'user',
              width: { ideal: isPortrait ? 896 : 1152 },
              height: { ideal: isPortrait ? 1152 : 896 },
              aspectRatio: { ideal: aspectRatio }
            }
          }
        : {
            video: {
              facingMode: 'user',
              width: { ideal: isPortrait ? 896 : 1152 },
              height: { ideal: isPortrait ? 1152 : 896 },
              aspectRatio: { ideal: aspectRatio }
            }
          };
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
      console.log('Getting user media with constraints:', JSON.stringify(constraints));
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Add proper class for iOS
        if (isIOS) {
          videoRef.current.classList.add('ios-fix');
        }
        
        // Get actual stream dimensions for debugging
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        const settings = videoTrack.getSettings();
        console.log('Stream capabilities:', capabilities);
        console.log('Stream settings:', settings);
        
        // Add a small delay before playing to prevent potential errors
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch(err => {
              console.warn("Video play error:", err);
            });
          }
        }, 100);
      }
    } catch (err) {
      console.error(`Error accessing webcam: ${err}`);
      
      // If failed with ideal settings, try again with more flexible constraints
      if (!deviceId && err.name === 'OverconstrainedError') {
        console.log('Trying with more flexible constraints');
        try {
          const backupConstraints = { video: true };
          const stream = await navigator.mediaDevices.getUserMedia(backupConstraints);
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            if (isIOS) videoRef.current.classList.add('ios-fix');
            
            setTimeout(() => {
              videoRef.current?.play().catch(e => console.warn("Backup video play error:", e));
            }, 100);
          }
        } catch (backupErr) {
          alert(`Could not access camera: ${backupErr.message}`);
        }
      } else {
        alert(`Error accessing webcam: ${err.message}`);
      }
    }
  }, [desiredWidth, desiredHeight]);

  /**
   * Enumerate devices and store them in state.
   */
  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevices);
    } catch (err) {
      console.warn('Error enumerating devices', err);
    }
  }, []);

  // On mount: init sogni, enumerate devices, start default camera
  useEffect(() => {
    (async () => {
      await listCameras();
      // Start default camera (facingMode: user)
      await startCamera(null);
      // Initialize sogni
      await initializeSogni();
    })();
  }, [startCamera, listCameras]);

  // If we return to camera, ensure the video is playing
  useEffect(() => {
    if (selectedPhotoIndex === null && videoRef.current) {
      console.log("Restarting video playback");
      // Add a small delay to ensure DOM updates before attempting to play
      setTimeout(() => {
        if (videoRef.current && videoRef.current.srcObject) {
          videoRef.current.play().catch(err => {
            console.warn("Video re-play error:", err);
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
      photos[selectedPhotoIndex].images.forEach((url) => {
        const img = new Image();
        img.src = url;
      });
    }
  }, [selectedPhotoIndex, photos]);

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

  // Simplified function to navigate to previous photo with looping
  const goToPrevPhoto = () => {
    // Check if there are any loaded photos to navigate to
    if (photos.length <= 1) return;
    
    // Find the previous loaded photo
    let prevIndex = selectedPhotoIndex;
    let iterations = 0;
    
    // Only try once around the array to avoid infinite loop
    while (iterations < photos.length) {
      prevIndex = prevIndex === 0 ? photos.length - 1 : prevIndex - 1;
      iterations++;
      
      // Skip photos that are still loading or have errors
      const prevPhoto = photos[prevIndex];
      if (prevPhoto && 
          ((prevPhoto.images && prevPhoto.images.length > 0) || 
           prevPhoto.isOriginal)) {
        // We found a valid photo
        break;
      }
    }
    
    // Only proceed if we found a valid previous photo
    if (prevIndex !== selectedPhotoIndex && iterations < photos.length) {
      setSelectedPhotoIndex(prevIndex);
      setSelectedSubIndex(0);
    }
  };

  // Simplified function to navigate to next photo with looping
  const goToNextPhoto = () => {
    // Check if there are any loaded photos to navigate to
    if (photos.length <= 1) return;
    
    // Find the next loaded photo
    let nextIndex = selectedPhotoIndex;
    let iterations = 0;
    
    // Only try once around the array to avoid infinite loop
    while (iterations < photos.length) {
      nextIndex = nextIndex === photos.length - 1 ? 0 : nextIndex + 1;
      iterations++;
      
      // Skip photos that are still loading or have errors
      const nextPhoto = photos[nextIndex];
      if (nextPhoto && 
          ((nextPhoto.images && nextPhoto.images.length > 0) || 
           nextPhoto.isOriginal)) {
        // We found a valid photo
        break;
      }
    }
    
    // Only proceed if we found a valid next photo
    if (nextIndex !== selectedPhotoIndex && iterations < photos.length) {
      setSelectedPhotoIndex(nextIndex);
      setSelectedSubIndex(0);
    }
  };

  // Get previous photo index with looping
  const getPrevPhotoIndex = (currentIndex) => {
    // Find previous valid photo
    let prevIndex = currentIndex;
    let iterations = 0;
    
    while (iterations < photos.length) {
      prevIndex = prevIndex === 0 ? photos.length - 1 : prevIndex - 1;
      iterations++;
      
      const prevPhoto = photos[prevIndex];
      if (prevPhoto && 
          ((prevPhoto.images && prevPhoto.images.length > 0) || 
           prevPhoto.isOriginal)) {
        // We found a valid photo
        return prevIndex;
      }
    }
    
    // If we get here, there's no valid previous photo
    return currentIndex;
  };

  // Get next photo index with looping
  const getNextPhotoIndex = (currentIndex) => {
    // Find next valid photo
    let nextIndex = currentIndex;
    let iterations = 0;
    
    while (iterations < photos.length) {
      nextIndex = nextIndex === photos.length - 1 ? 0 : nextIndex + 1;
      iterations++;
      
      const nextPhoto = photos[nextIndex];
      if (nextPhoto && 
          ((nextPhoto.images && nextPhoto.images.length > 0) || 
           nextPhoto.isOriginal)) {
        // We found a valid photo
        return nextIndex;
      }
    }
    
    // If we get here, there's no valid next photo
    return currentIndex;
  };

  // Now update the keyboard handler to use these functions
  const handleKeyDown = useCallback((e) => {
    // Close settings with ESC if they're open
    if (e.key === 'Escape' && showControlOverlay) {
      e.preventDefault();
      setShowControlOverlay(false);
      return;
    }

    if (selectedPhotoIndex !== null) {
      const currentPhoto = photos[selectedPhotoIndex];
      const maxImages = currentPhoto?.images?.length || 1;

      // ESC => close viewer with animation
      if (e.key === 'Escape') {
        handleClosePhoto();
        return;
      }

      // up/down => subIndex
      if (maxImages > 1) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSubIndex((prev) => (prev - 1 + maxImages) % maxImages);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSubIndex((prev) => (prev + 1) % maxImages);
        }
      }

      // left/right => previous/next photo with looping
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevPhoto(); // Use the looping function instead
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextPhoto(); // Use the looping function instead
      }

      // space => toggle original (5th) if present
      if (e.key === ' ' && maxImages === 5) {
        e.preventDefault();
        setSelectedSubIndex((prev) => {
          if (prev === 4) {
            // if on original, go back
            return lastViewedIndex;
          } else {
            // if on a rendered image, store that, go to original
            setLastViewedIndex(prev);
            return 4;
          }
        });
      }
    }
  }, [selectedPhotoIndex, photos, lastViewedIndex, showControlOverlay, photos.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Global 1s timer for generation countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setPhotos((prevPhotos) => {
        return prevPhotos.map((p) => {
          if (p.generating && p.generationCountdown > 0) {
            return { ...p, generationCountdown: p.generationCountdown - 1 };
          }
          return p;
        });
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // iOS orientation fix
  useEffect(() => {
    function isIOS() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent);
    }
    if (isIOS() && videoRef.current) {
      // Add a special class so CSS can rotate it if in portrait
      videoRef.current.classList.add('ios-fix');
    }
  }, []);

  // Add an effect to properly initialize the slothicorn
  useEffect(() => {
    // Ensure slothicorn is properly initialized
    if (slothicornRef.current) {
      console.log('Initializing slothicorn position');
      slothicornRef.current.style.transition = 'none';
      slothicornRef.current.style.bottom = '-240px';
      
      // Force a reflow to ensure style is applied
      // This helps fix issues with styles not being applied on some mobile browsers
      void slothicornRef.current.offsetHeight;
    }
  }, []);

  // First, let's create a helper function to generate random prompts
  const generateRandomPrompts = (count) => {
    // Get all prompts except 'custom' and 'random'
    const availablePrompts = Object.entries(defaultStylePrompts)
      .filter(([key]) => key !== 'custom' && key !== 'random')
      .map(([key, value]) => ({ key, value }));
    
    // Shuffle array using Fisher-Yates algorithm
    for (let i = availablePrompts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePrompts[i], availablePrompts[j]] = [availablePrompts[j], availablePrompts[i]];
    }
    
    // Take first 'count' items and join their prompts
    const selectedPrompts = availablePrompts.slice(0, count);
    return `{${selectedPrompts.map(p => p.value).join('|')}}`;
  };

  // -------------------------
  //   Shared logic for generating images from a Blob
  // -------------------------
  const generateFromBlob = async (photoBlob, newPhotoIndex, dataUrl) => {
    try {
      // Get the style prompt, generating random if selected
      const stylePrompt = selectedStyle === 'random'
        ? generateRandomPrompts(numImages)
        : selectedStyle === 'custom'
        ? (customPrompt || 'A custom style portrait')
        : defaultStylePrompts[selectedStyle];

      projectStateRef.current = {
        currentPhotoIndex: newPhotoIndex,
        pendingCompletions: new Map()
      };

      // Set up photos state first
      setPhotos(prev => {
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
        
        for (let i = 0; i < numImages; i++) {
          newPhotos.push({
            id: Date.now() + i + 1,
            generating: true,
            loading: true,
            progress: 0,
            images: [],
            error: null,
            originalDataUrl: null,
            newlyArrived: false
          });
        }
        return newPhotos;
      });

      const arrayBuffer = await photoBlob.arrayBuffer();
      
      // Create job tracking map and set of handled jobs
      const jobMap = new Map();
      const handledJobs = new Set();

      // Helper to set up job progress handler
      const setupJobProgress = (job) => {
        // Only set up if we haven't already handled this job
        if (!handledJobs.has(job.id)) {
          const jobIndex = jobMap.size;
          jobMap.set(job.id, jobIndex);
          handledJobs.add(job.id);
          
          job.on('progress', (progress) => {
            console.log('Job progress:', job.id, progress);
            const offset = keepOriginalPhoto ? 1 : 0;
            const photoIndex = jobIndex + offset;
            
            setPhotos(prev => {
              const updated = [...prev];
              if (!updated[photoIndex]) return prev;
              
              updated[photoIndex] = {
                ...updated[photoIndex],
                generating: true,
                loading: true,
                progress
              };
              return updated;
            });
          });
        }
      };
      
      // Create the project
      const project = await sogniClient.projects.create({
        modelId: selectedModel,
        positivePrompt: stylePrompt,
        sizePreset: 'custom',
        width: desiredWidth,
        height: desiredHeight,
        steps: 7,
        guidance: promptGuidance,
        numberOfImages: numImages,
        scheduler: 'DPM Solver Multistep (DPM-Solver++)',
        timeStepSpacing: 'Karras',
        controlNet: {
          name: 'instantid',
          image: new Uint8Array(arrayBuffer),
          strength: controlNetStrength,
          mode: 'balanced',
          guidanceStart: 0.0,
          guidanceEnd: controlNetGuidanceEnd,
        }
      });

      activeProjectRef.current = project.id;
      console.log('Project created:', project.id);

      // Set up handlers for any jobs that exist immediately
      project.jobs.forEach(setupJobProgress);

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
        if (urls.length === 0) return;
        
        urls.forEach((url, index) => {
          const offset = keepOriginalPhoto ? 1 : 0;
          const photoIndex = index + offset;
          
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) return prev;
            
            if (updated[photoIndex].loading || updated[photoIndex].images.length === 0) {
              updated[photoIndex] = {
                ...updated[photoIndex],
                generating: false,
                loading: false,
                images: [url],
                newlyArrived: true
              };
            }
            return updated;
          });
        });
      });

      project.on('failed', (error) => {
        console.error('Project failed:', error);
      });

      // Individual job events
      project.on('jobCompleted', (job) => {
        console.log('Job completed:', job.id, job.resultUrl);
        if (!job.resultUrl) {
          console.error('Missing resultUrl for job:', job.id);
          return;
        }
        
        const jobIndex = jobMap.get(job.id);
        if (jobIndex === undefined) {
          console.error('Unknown job completed:', job.id);
          return;
        }
        
        if (cameraWindSoundRef.current) {
          cameraWindSoundRef.current.play().catch(err => {
            console.warn("Error playing camera wind sound:", err);
          });
        }
        
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        console.log(`Loading image for job ${job.id} into box ${photoIndex}`);
        
        const img = new Image();
        img.onload = () => {
          setPhotos(prev => {
            const updated = [...prev];
            if (!updated[photoIndex]) {
              console.error(`No photo box found at index ${photoIndex}`);
              return prev;
            }
            
            updated[photoIndex] = {
              ...updated[photoIndex],
              generating: false,
              loading: false,
              progress: 100,
              images: [job.resultUrl],
              newlyArrived: true
            };
            return updated;
          });
        };
        img.src = job.resultUrl;
      });

      project.on('jobFailed', (job) => {
        console.error('Job failed:', job.id, job.error);
        const jobIndex = jobMap.get(job.id);
        if (jobIndex === undefined) return;
        
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        
        setPhotos(prev => {
          const updated = [...prev];
          if (!updated[photoIndex]) return prev;
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            error: job.error || 'Generation failed'
          };
          return updated;
        });
      });

    } catch (err) {
      console.error('Generation failed:', err);
      
      if (err && err.code === 4015) {
        console.warn("Socket error (4015). Re-initializing Sogni.");
        setIsSogniReady(false);
        initializeSogni();
      }

      setPhotos(prev => {
        const updated = [];
        if (keepOriginalPhoto) {
          const originalPhoto = prev.find(p => p.isOriginal);
          if (originalPhoto) {
            updated.push(originalPhoto);
          }
        }
        
        for (let i = 0; i < numImages; i++) {
          updated.push({
            id: Date.now() + i,
            generating: false,
            loading: false,
            images: [],
            error: `Error: ${err.message || err}`,
            originalDataUrl: null
          });
        }
        return updated;
      });
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

    if (!isSogniReady) {
      alert('Sogni is not ready yet.');
      return;
    }

    // If user dropped multiple files, just take the first
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    // Create a new photo item
    const newPhoto = {
      id: Date.now(),
      generating: true,
      images: [],
      error: null,
      originalDataUrl: null,
      newlyArrived: false,
      generationCountdown: 10,
    };
    setPhotos((prev) => [...prev, newPhoto]);
    const newPhotoIndex = photos.length;

    // Read the file as dataURL so we can keep it (originalDataUrl)
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      newPhoto.originalDataUrl = dataUrl;

      // Now feed the Blob itself into the generator
      generateFromBlob(file, newPhotoIndex, dataUrl);
    };
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
    if (activeProjectRef.current) {
      console.log('Cancelling existing project:', activeProjectRef.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectRef.current);
        } catch (err) {
          console.warn('Error cancelling previous project:', err);
        }
      }
      activeProjectRef.current = null;
    }

    // Start cooldown
    setIsPhotoButtonCooldown(true);
    setTimeout(() => {
      setIsPhotoButtonCooldown(false);
    }, 5000);

    console.log('handleTakePhoto called - device type:', /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop');
    
    // Start countdown without slothicorn initially
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      
      // Show slothicorn when countdown reaches 2
      if (i === 2 && slothicornRef.current) {
        console.log('Animating slothicorn up - slothicorn element:', slothicornRef.current ? 'exists' : 'missing');
        
        // Start hidden (if not already)
        slothicornRef.current.style.bottom = '-240px';
        console.log('Set initial bottom position:', slothicornRef.current.style.bottom);
        
        // Animate with a timeout for visibility
        setTimeout(() => {
          // Apply a transition temporarily (will be removed later)
          slothicornRef.current.style.transition = 'bottom 1s cubic-bezier(0.34, 1.2, 0.64, 1)';
          console.log('Applied transition:', slothicornRef.current.style.transition);
          
          // Move up
          slothicornRef.current.style.bottom = '0px';
          console.log('Set new bottom position:', slothicornRef.current.style.bottom);
        }, 50);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setCountdown(0);
    triggerFlashAndCapture();
    
    // Make slothicorn return more gradually
    setTimeout(() => {
      if (slothicornRef.current) {
        console.log('Animating slothicorn down');
        
        // Apply a different transition for going down
        slothicornRef.current.style.transition = 'bottom 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
        console.log('Applied down transition:', slothicornRef.current.style.transition);
        
        // Move down
        slothicornRef.current.style.bottom = '-240px';
        console.log('Set final bottom position:', slothicornRef.current.style.bottom);
        
        // Remove the transition after animation completes
        setTimeout(() => {
          slothicornRef.current.style.transition = 'none';
          console.log('Removed transition');
        }, 1500);
      }
    }, 1200);
  };

  const triggerFlashAndCapture = () => {
    // Play camera shutter sound
    if (shutterSoundRef.current) {
      shutterSoundRef.current.play().catch(err => {
        console.warn("Error playing shutter sound:", err);
      });
    }

    if (flashEnabled) {
      setShowFlash(true);
      // Increased delay to 250ms to allow camera to adjust exposure
      setTimeout(() => {
        setShowFlash(false);
        captureAndSend();
      }, 250);
    } else {
      captureAndSend();
    }
  };

  const captureAndSend = async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const isPortrait = window.innerHeight > window.innerWidth;
    
    // Set canvas dimensions to 1152x896 for landscape (or 896x1152 for portrait)
    if (isPortrait) {
      canvas.width = 896;
      canvas.height = 1152;
    } else {
      canvas.width = 1152;
      canvas.height = 896;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Fill with black to prevent transparency
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate dimensions to maintain aspect ratio without stretching
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let destX = 0;
    let destY = 0;
    let destWidth = canvas.width;
    let destHeight = canvas.height;
    
    // If video aspect is wider than desired, crop width
    if (videoAspect > canvasAspect) {
      sourceWidth = video.videoHeight * canvasAspect;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      ctx.drawImage(video, 
        sourceX, 0, sourceWidth, sourceHeight,
        destX, destY, destWidth, destHeight
      );
    } 
    // If video aspect is taller than desired, crop height
    else {
      sourceHeight = video.videoWidth / canvasAspect;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      ctx.drawImage(video, 
        0, sourceY, sourceWidth, sourceHeight,
        destX, destY, destWidth, destHeight
      );
    }

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png');
    });
    
    if (!blob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    generateFromBlob(blob, photos.length, dataUrl);
  };

  // -------------------------
  //   Delete photo
  // -------------------------
  const handleDeletePhoto = (photoIndex) => {
    setPhotos((prev) => {
      const newPhotos = [...prev];
      newPhotos.splice(photoIndex, 1);
      return newPhotos;
    });

    setSelectedPhotoIndex((current) => {
      if (current === null) return null;
      if (current === photoIndex) {
        const newIdx = current - 1;
        return newIdx < 0 ? null : newIdx;
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
    const deviceId = e.target.value;
    setSelectedCameraDeviceId(deviceId);
    // Start new stream on that device
    await startCamera(deviceId);
  };

  // -------------------------
  //   Main area (video)
  // -------------------------
  const renderMainArea = () => (
    <div className="video-container">
      <div className="photobooth-frame">
        <div className="photobooth-header">
          <h1 className="photobooth-title">Sogni Photobooth</h1>
          <button className="help-button" onClick={() => setShowInfoModal(true)}>?</button>
          <div className="photobooth-header-controls">
            <div className="style-selector">
              <button 
                className="header-style-select" 
                onClick={() => setShowStyleDropdown(!showStyleDropdown)}
              >
                {selectedStyle === 'custom' 
                  ? 'STYLE: Custom...' 
                  : selectedStyle === 'random'
                    ? 'STYLE: Random Mix'
                    : `STYLE: ${selectedStyle.charAt(0).toUpperCase() + selectedStyle.slice(1)}`}
              </button>
              
              {showStyleDropdown && (
                <div className="style-dropdown">
                  <div 
                    className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
                    onClick={() => { 
                      setSelectedStyle('randomMix'); 
                      setShowStyleDropdown(false);
                    }}
                  >
                    Random Mix
                  </div>
                  <div 
                    className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
                    onClick={() => { 
                      setSelectedStyle('random'); 
                      setShowStyleDropdown(false);
                    }}
                  >
                    Random
                  </div>
                  <div 
                    className={`style-option ${selectedStyle === 'custom' ? 'selected' : ''}`} 
                    onClick={() => { 
                      setSelectedStyle('custom'); 
                      setShowStyleDropdown(false);
                    }}
                  >
                    Custom...
                  </div>
                  {Object.keys(defaultStylePrompts)
                    .filter(key => key !== 'random' && key !== 'custom')
                    .sort()
                    .map(styleKey => (
                      <div 
                        key={styleKey}
                        className={`style-option ${selectedStyle === styleKey ? 'selected' : ''}`} 
                        onClick={() => { 
                          setSelectedStyle(styleKey); 
                          setShowStyleDropdown(false);
                        }}
                      >
                        {styleKey.charAt(0).toUpperCase() + styleKey.slice(1)}
                      </div>
                    ))}
                </div>
              )}
            </div>
            
            <button
              className={`header-take-photo-btn ${isPhotoButtonCooldown ? 'cooldown' : ''}`}
              onClick={handleTakePhoto}
              disabled={!isSogniReady || isPhotoButtonCooldown}
            >
              {isPhotoButtonCooldown ? 'Please wait...' : 'Take Photo'}
            </button>

            <button 
              className="header-config-btn"
              onClick={() => {
                setShowControlOverlay(!showControlOverlay);
                if (!showControlOverlay) {
                  setShowStyleDropdown(false);
                }
              }}
            >
              {showControlOverlay ? '✕' : '⚙️'}
            </button>
          </div>
        </div>
        <div className="photobooth-screen">
          <video
            id="webcam"
            ref={videoRef}
            autoPlay
            playsInline
            muted
          />
          {countdown > 0 && (
            <div className="countdown-overlay">
              {countdown}
            </div>
          )}
          {showFlash && <div className="flash-overlay" />}
        </div>
        
        {/* Add custom style input below camera feed */}
        {selectedStyle === 'custom' && (
          <div className="custom-style-input-container">
            <input
              type="text"
              placeholder="Enter your custom style here..."
              className="custom-style-input-below"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
          </div>
        )}
        
        {/* Control overlay that slides down when visible */}
        <div className={`control-overlay ${showControlOverlay ? 'visible' : ''}`}>
          <div className="control-overlay-content">
            <h2 className="settings-title">Advanced Settings</h2>
            
            <button 
              className="dismiss-overlay-btn"
              onClick={() => setShowControlOverlay(false)}
            >
              ×
            </button>
            
            {selectedStyle === 'custom' && (
              <div className="control-option">
                <label className="control-label">Custom style prompt:</label>
                <input
                  type="text"
                  placeholder="Enter custom style prompt..."
                  className="custom-style-input"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />
              </div>
            )}
            
            {/* Camera selector if more than 1 device found */}
            {cameraDevices.length > 0 && (
              <div className="control-option">
                <label className="control-label">Camera:</label>
                <select
                  className="camera-select"
                  onChange={handleCameraSelection}
                  value={selectedCameraDeviceId || ''}
                >
                  {/* If user wants default, we allow a "Default" option */}
                  <option value="">Default (user-facing)</option>
                  {cameraDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label || `Camera ${dev.deviceId}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Model selector */}
            <div className="control-option">
              <label className="control-label">Pick an Image Model:</label>
              <select
                className="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
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
                max={16}
                step={1}
                value={numImages}
                onChange={(e) => setNumImages(parseInt(e.target.value))}
                className="slider-input"
              />
              <span className="slider-value">{numImages}</span>
            </div>

            {/* Prompt Guidance slider */}
            <div className="control-option">
              <label className="control-label">Prompt Guidance:</label>
              <input
                type="range"
                min={2}
                max={3}
                step={0.1}
                value={promptGuidance}
                onChange={(e) => setPromptGuidance(parseFloat(e.target.value))}
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
                onChange={(e) => setControlNetStrength(parseFloat(e.target.value))}
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
                onChange={(e) => setControlNetGuidanceEnd(parseFloat(e.target.value))}
                className="slider-input"
              />
              <span className="slider-value">{controlNetGuidanceEnd.toFixed(1)}</span>
            </div>

            <div className="control-option checkbox">
              <input
                type="checkbox"
                id="flash-toggle"
                checked={flashEnabled}
                onChange={(e) => setFlashEnabled(e.target.checked)}
              />
              <label htmlFor="flash-toggle" className="control-label">Flash</label>
            </div>

            <div className="control-option checkbox">
              <input
                type="checkbox"
                id="keep-original-toggle"
                checked={keepOriginalPhoto}
                onChange={(e) => setKeepOriginalPhoto(e.target.checked)}
              />
              <label htmlFor="keep-original-toggle" className="control-label">Keep Original Image</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // -------------------------
  //   Selected Photo Display
  // -------------------------
  const renderSelectedPhoto = () => {
    const currentPhoto = photos[selectedPhotoIndex];
    if (!currentPhoto) return null;

    // If still generating and no images, show loading animation
    if (currentPhoto.generating && currentPhoto.images.length === 0) {
      return (
        <div className="photo-loading">
          <div className="spinner"></div>
        </div>
      );
    }

    // If error and no images, show error
    if (currentPhoto.error && currentPhoto.images.length === 0) {
      return (
        <div className="error-indicator">
          <div className="text-red-500">
            {currentPhoto.error}
          </div>
        </div>
      );
    }

    // Show whichever subIndex
    const imageUrl = currentPhoto.images[selectedSubIndex] || (currentPhoto.originalDataUrl || '');
    const handleImageClick = () => {
      if (currentPhoto.images.length > 1) {
        setSelectedSubIndex((prev) => (prev + 1) % currentPhoto.images.length);
      }
    };

    // Frame number for display (1-based)
    const frameNumber = selectedPhotoIndex + 1;

    return (
      <>
        <img
          src={imageUrl}
          alt="Selected"
          onClick={handleImageClick}
        />
        <div className="photo-frame-number">#{frameNumber}</div>
        <div className="stack-index-indicator">
          {currentPhoto.images.length > 1 ? 
            `${selectedSubIndex + 1}/${currentPhoto.images.length}` : 
            currentPhoto.isOriginal ? "Original" : ""
          }
        </div>
      </>
    );
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
    // Check if on mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    // Generate an appropriate number of sprocket holes
    const holeCount = isMobile ? 8 : 20;
    
    return (
      <div style={{ 
        position: 'absolute', 
        bottom: '30px', 
        left: '0', 
        right: '0', 
        display: 'flex',
        justifyContent: 'center',
        zIndex: 50,
        maxWidth: '100vw',
        overflow: 'visible',
        paddingTop: '20px'
      }}>
        {photos.length > 0 && showFilmStrip && (
          <div className="film-strip-container">
            {/* Close button for film strip */}
            <button 
              className="film-strip-close-btn" 
              onClick={() => setShowFilmStrip(false)}
              aria-label="Close film strip"
            >
              ×
            </button>
            
            {/* Top sprocket holes - reduced for mobile */}
            <div className="film-strip-holes top">
              {Array(holeCount).fill(null).map((_, i) => (
                <div key={`hole-top-${i}`} className="sprocket-hole" />
              ))}
            </div>
            
            {/* Film content area */}
            <div className="film-strip-content"
              onWheel={(e) => {
                // Prevent vertical scroll of the page
                if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
                  e.preventDefault();
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
            >
              {photos.map((photo, i) => {
                const isSelected = i === selectedPhotoIndex;
                const frameNumber = i + 1;
                const isReference = photo.isOriginal;

                // If generating + no images => show loading animation
                if (photo.loading && photo.images.length === 0) {
                  return (
                    <div
                      key={photo.id}
                      className="film-frame loading"
                    >
                      <div className="frame-number">{frameNumber}</div>
                      <div className="loading-spinner"></div>
                    </div>
                  );
                }

                // If error + no images => "Err"
                if (photo.error && photo.images.length === 0) {
                  return (
                    <div
                      key={photo.id}
                      className="film-frame error"
                    >
                      <div className="frame-number">{frameNumber}</div>
                      <div className="error-text">Error</div>
                    </div>
                  );
                }

                // otherwise show the first image as thumbnail
                const thumbUrl = photo.images[0] || '';
                const handleThumbClick = () => {
                  setSelectedPhotoIndex(i);
                  setSelectedSubIndex(0);
                };

                return (
                  <div 
                    key={photo.id}
                    className={`film-frame ${isSelected ? 'selected' : ''}`}
                  >
                    {isSelected && (
                      <button
                        className="delete-frame-btn"
                        onClick={() => handleDeletePhoto(i)}
                      >
                        X
                      </button>
                    )}

                    <div className="frame-number">{frameNumber}</div>
                    
                    <img
                      src={thumbUrl}
                      alt={`Generated #${i}`}
                      className={photo.newlyArrived ? 'thumbnail-fade' : ''}
                      onClick={handleThumbClick}
                    />

                    {/* Show REF label for original photo */}
                    {isReference && (
                      <div className="ref-label">REF</div>
                    )}

                    {/* If multiple images, show stack count */}
                    {photo.images.length > 1 && (
                      <div className="stack-count">x{photo.images.length}</div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Bottom sprocket holes - reduced for mobile */}
            <div className="film-strip-holes bottom">
              {Array(holeCount).fill(null).map((_, i) => (
                <div key={`hole-bottom-${i}`} className="sprocket-hole" />
              ))}
            </div>
          </div>
        )}
        
        {/* Show a button to restore the film strip if it's hidden */}
        {photos.length > 0 && !showFilmStrip && (
          <div style={{ marginBottom: '15px' }}>
            <button 
              className="film-strip-restore-btn"
              onClick={() => setShowFilmStrip(true)}
              aria-label="Show film strip"
            >
              Show Photos
            </button>
          </div>
        )}
      </div>
    );
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

  // Add handler for clicks outside the image
  const handlePhotoViewerClick = (e) => {
    // Check if the click is outside the image
    const imageWrapperEl = e.target.closest('.image-wrapper');
    const navButtonEl = e.target.closest('.photo-nav-btn');
    const previewEl = e.target.closest('.photo-preview');
    
    if (!imageWrapperEl && !navButtonEl && !previewEl) {
      handleClosePhoto();
    }
  };

  // Add new state for info modal
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Add toggle function for notes modal
  const toggleNotesModal = () => {
    setShowInfoModal(!showInfoModal);
  };

  // -------------------------
  //   Render
  // -------------------------
  return (
    <>
      {currentThought && (
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

      <div className="relative w-full h-screen photobooth-app"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Add meta tag for mobile viewport - this runs once on mount */}
      {useEffect(() => {
        // Check if viewport meta tag exists
        let viewportMeta = document.querySelector('meta[name="viewport"]');
        
        // If it doesn't exist, create it
        if (!viewportMeta) {
          viewportMeta = document.createElement('meta');
          viewportMeta.name = 'viewport';
          document.head.appendChild(viewportMeta);
        }
        
        // Set properties for proper mobile scaling with notch support
        viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        
        // Add meta tag for Apple devices to use full screen
        let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
        if (!appleMeta) {
          appleMeta = document.createElement('meta');
          appleMeta.name = 'apple-mobile-web-app-capable';
          appleMeta.content = 'yes';
          document.head.appendChild(appleMeta);
        }
        
        // Set body class based on orientation
        const setOrientation = () => {
          if (window.innerHeight > window.innerWidth) {
            document.body.classList.add('portrait');
            document.body.classList.remove('landscape');
          } else {
            document.body.classList.add('landscape');
            document.body.classList.remove('portrait');
          }
        };
        
        // Set initial orientation
        setOrientation();
        
        // Listen for orientation changes
        window.addEventListener('resize', setOrientation);
        
        return () => {
          window.removeEventListener('resize', setOrientation);
        };
      }, [])}
      
      {/* Studio lights - permanent background elements */}
      <div className="studio-lights-container">
        <img src={light1Image} alt="Studio Light" className="studio-light left" />
        <img src={light2Image} alt="Studio Light" className="studio-light right" />
      </div>
      
      {/* Drag overlay */}
      {dragActive && (
        <div className="drag-overlay">
          <p>Drop your image here to generate!</p>
        </div>
      )}

        {/* Info Modal */}
        {showInfoModal && (
          <div className="notes-modal-overlay" onClick={() => setShowInfoModal(false)}>
            <div className="notes-modal" onClick={e => e.stopPropagation()}>
              <div className="sticky-note">
                <button className="note-close" onClick={() => setShowInfoModal(false)}>×</button>
                <h2>Photobooth Tips</h2>
                <ul>
                  <li>Generated compositions reuses the same face size, position, and orientation as the camera snapshot so step back and get creative!</li>
                  <li>Only one face at a time! If multiple faces the biggest one in frame is used.</li>
                  <li>The more light / dark depth on your face the better, flat even light results can be subpar.</li>
                  <li>Try using the Custom Style feature and providing your own prompt!</li>
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

      {/* Main area with video */}
      {renderMainArea()}

      {/* Photo viewer - with previews and next/prev navigation */}
      {(selectedPhotoIndex !== null || photoViewerClosing) && (
        <div 
          className={`selected-photo-container ${photoViewerClosing ? 'fade-out' : ''}`}
          onClick={handlePhotoViewerClick}
        >
          {/* Photos carousel with prev/next previews */}
          <div className="photos-carousel">
            {/* Previous photo preview */}
            {photos.length > 1 && selectedPhotoIndex !== null && (
              <div className="photo-preview prev" onClick={goToPrevPhoto}>
                <img 
                  src={photos[getPrevPhotoIndex(selectedPhotoIndex)]?.images?.[0] || ''}
                  alt="Previous"
                  className="photo-preview-img"
                />
              </div>
            )}
            
            {/* Navigation buttons */}
            {photos.length > 1 && selectedPhotoIndex !== null && (
              <>
                <button className="photo-nav-btn prev" onClick={goToPrevPhoto}>
                  &#8249;
                </button>
                <button className="photo-nav-btn next" onClick={goToNextPhoto}>
                  &#8250;
                </button>
              </>
            )}
            
            {/* Current photo - remove animation classes */}
            <div className="image-wrapper">
              {selectedPhotoIndex !== null && renderSelectedPhoto()}
            </div>
            
            {/* Next photo preview */}
            {photos.length > 1 && selectedPhotoIndex !== null && (
              <div className="photo-preview next" onClick={goToNextPhoto}>
                <img 
                  src={photos[getNextPhotoIndex(selectedPhotoIndex)]?.images?.[0] || ''}
                  alt="Next"
                  className="photo-preview-img"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Slothicorn mascot with direct DOM manipulation */}
      <div 
        ref={slothicornRef}
        className="slothicorn-container"
        style={{ bottom: '-240px' }} // Start hidden
      >
        <img 
          src={slothicornImage} 
          alt="Slothicorn mascot" 
          className="slothicorn-image" 
        />
      </div>

      {/* Thumbnail strip at bottom */}
      {renderGallery()}

      {/* Camera shutter sound */}
      <audio ref={shutterSoundRef} preload="auto">
        <source src={clickSound} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>

      {/* Camera wind sound */}
      <audio ref={cameraWindSoundRef} preload="auto">
        <source src={cameraWindSound} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>

    </div>
    </>
  );
};

export default App;

