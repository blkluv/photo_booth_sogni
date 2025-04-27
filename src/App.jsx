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
import ReactDOM from 'react-dom';

// StyleDropdown component that uses portals to render outside the DOM hierarchy
const StyleDropdown = ({ 
  isOpen, 
  onClose, 
  selectedStyle, 
  updateStyle, 
  defaultStylePrompts, 
  styleIdToDisplay, 
  showControlOverlay, 
  setShowControlOverlay, 
  dropdownPosition = 'top' // Add default value
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const dropdownReference = useRef(null);
  
  useEffect(() => {
    if (isOpen) {
      // Find the style button in the DOM to position the dropdown
      const styleButton = document.querySelector('.bottom-style-select');
      if (styleButton) {
        const rect = styleButton.getBoundingClientRect();
        // Position above the button for the bottom toolbar
        setPosition({
          bottom: window.innerHeight - rect.top + 10,
          left: rect.left + rect.width / 2,
          width: 280
        });
        setMounted(true);
      }
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e) => {
        if (dropdownReference.current && !dropdownReference.current.contains(e.target)) {
          // Check if the click was on the style button
          const styleButton = document.querySelector('.bottom-style-select');
          if (!styleButton || !styleButton.contains(e.target)) {
            onClose();
          }
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      
      // Scroll selected option into view
      setTimeout(() => {
        const selectedOption = document.querySelector('.style-option.selected');
        if (selectedOption && dropdownReference.current) {
          selectedOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // If not mounted or not open, don't render anything
  if (!mounted || !isOpen) return null;

  // Create portal to render the dropdown at the document root
  return ReactDOM.createPortal(
    <div 
      ref={dropdownReference}
      className={`style-dropdown ${dropdownPosition}-position`}
      style={{
        position: 'fixed',
        ...(dropdownPosition === 'top' 
          ? { bottom: position.bottom } 
          : { top: position.bottom }),
        left: position.left,
        transform: 'translateX(-50%)',
        maxHeight: 300,
        width: position.width,
        background: 'white',
        borderRadius: 5,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        overflow: 'auto',
        zIndex: 10_000,
        transformOrigin: dropdownPosition === 'top' ? 'center bottom' : 'center top',
        animation: 'dropdownAppear 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards',
        border: '1px solid rgba(0,0,0,0.1)',
        fontFamily: '"Permanent Marker", cursive',
        fontSize: 13,
      }}
    >
      <style>{`
        @keyframes dropdownAppear {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(${dropdownPosition === 'top' ? '10px' : '-10px'});
          }
          to {
            opacity: 1; 
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>

      <div className="style-section featured">
        {/* Featured options */}
        <div 
          className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('randomMix');
            onClose();
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            color: selectedStyle === 'randomMix' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'randomMix' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          <span style={{ marginRight: 8 }}>🎲</span>
          <span>Random Mix</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('random');
            onClose();
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            color: selectedStyle === 'random' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'random' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          <span style={{ marginRight: 8 }}>🔀</span>
          <span>Random</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'custom' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('custom');
            onClose();
            setShowControlOverlay(true);
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            color: selectedStyle === 'custom' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'custom' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          <span style={{ marginRight: 8 }}>✏️</span>
          <span>Custom...</span>
        </div>
      </div>
      
      <div className="style-section regular">
        {Object.keys(defaultStylePrompts)
          .filter(key => key !== 'random' && key !== 'custom' && key !== 'randomMix')
          .sort()
          .map(styleKey => (
            <div 
              key={styleKey}
              className={`style-option ${selectedStyle === styleKey ? 'selected' : ''}`} 
              onClick={() => { 
                updateStyle(styleKey);
                onClose();
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                color: selectedStyle === styleKey ? '#ff5e8a' : '#333',
                background: selectedStyle === styleKey ? '#fff0f4' : 'transparent',
                fontFamily: '"Permanent Marker", cursive',
                fontSize: 13,
                textAlign: 'left'
              }}
            >
              <span>{styleIdToDisplay(styleKey)}</span>
            </div>
          ))}
      </div>
    </div>,
    document.body
  );
};

// Cookie utility functions
const saveSettingsToCookies = (settings) => {
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + 6); // Expire in 6 months
  const expires = `; expires=${expiryDate.toUTCString()}`;
  
  for (const [key, value] of Object.entries(settings)) {
    document.cookie = `sogni_${key}=${value}${expires}; path=/`;
  }
};

const getSettingFromCookie = (name, defaultValue) => {
  const cookieName = `sogni_${name}=`;
  const cookies = document.cookie.split(';');
  
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.indexOf(cookieName) === 0) {
      const value = cookie.slice(cookieName.length);
      
      // Try to parse numbers and booleans
      if (!isNaN(Number(value))) {
        return Number(value);
      } else if (value === 'true') {
        return true;
      } else if (value === 'false') {
        return false;
      }
      
      return value;
    }
  }
  
  return defaultValue;
};

// Default settings
const DEFAULT_SETTINGS = {
  selectedModel: 'coreml-sogniXLturbo_alpha1_ad',
  numImages: 16,
  promptGuidance: 2,
  controlNetStrength: 0.8,
  controlNetGuidanceEnd: 0.6,
  flashEnabled: true,
  keepOriginalPhoto: true,
  selectedStyle: 'randomMix'
};

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
    return { width: 896, height: 1152 }; // Portrait: 896:1152 (ratio ~0.778)
  } else {
    return { width: 1152, height: 896 }; // Landscape: 1152:896 (ratio ~1.286)
  }
}

/** 
 * Helper: resize dataURL so original matches the Sogni dimension 
 * for easy side-by-side comparison (no skew).
 */
async function resizeDataUrl(dataUrl, width, height) {
  return new Promise((resolve) => {
    const img = new Image();
    img.addEventListener('load', () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      // fill black to avoid any transparent edges
      context.fillStyle = 'black';
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    });
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
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

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

  // Determine the desired dimensions for Sogni (and camera constraints)
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions();

  // Drag-and-drop state
  const [dragActive, setDragActive] = useState(false);

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
  const [selectedModel, setSelectedModel] = useState(getSettingFromCookie('selectedModel', DEFAULT_SETTINGS.selectedModel));
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
      document.body.classList.add('ios-device');
      
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

  // Add this useEffect at the beginning of the component
  useEffect(() => {
    // Simple mobile detection
    const isMobile = /iphone|ipod|android|webos|blackberry|iemobile|opera mini/i.test(navigator.userAgent) 
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
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
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
      
      if (videoReference.current) {
        videoReference.current.srcObject = stream;
        
        // Add proper class for iOS
        if (isIOS) {
          videoReference.current.classList.add('ios-fix');
        }
        
        // Get actual stream dimensions for debugging
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();
        const settings = videoTrack.getSettings();
        console.log('Stream capabilities:', capabilities);
        console.log('Stream settings:', settings);
        
        // Add a small delay before playing to prevent potential errors
        setTimeout(() => {
          if (videoReference.current) {
            videoReference.current.play().catch(error => {
              console.warn("Video play error:", error);
            });
          }
        }, 100);
      }
    } catch (error) {
      console.error(`Error accessing webcam: ${error}`);
      
      // If failed with ideal settings, try again with more flexible constraints
      if (!deviceId && error.name === 'OverconstrainedError') {
        console.log('Trying with more flexible constraints');
        try {
          const backupConstraints = { video: true };
          const stream = await navigator.mediaDevices.getUserMedia(backupConstraints);
          
          if (videoReference.current) {
            videoReference.current.srcObject = stream;
            if (isIOS) videoReference.current.classList.add('ios-fix');
            
            setTimeout(() => {
              videoReference.current?.play().catch(error_ => console.warn("Backup video play error:", error_));
            }, 100);
          }
        } catch (error_) {
          alert(`Could not access camera: ${error_.message}`);
        }
      } else {
        alert(`Error accessing webcam: ${error.message}`);
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
    } catch (error) {
      console.warn('Error enumerating devices', error);
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
    if (selectedPhotoIndex === null && videoReference.current) {
      console.log("Restarting video playback");
      // Add a small delay to ensure DOM updates before attempting to play
      setTimeout(() => {
        if (videoReference.current && videoReference.current.srcObject) {
          videoReference.current.play().catch(error => {
            console.warn("Video re-play error:", error);
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
  const goToPreviousPhoto = () => {
    // Check if there are any loaded photos to navigate to
    if (photos.length <= 1) return;
    
    // Find the previous loaded photo
    let previousIndex = selectedPhotoIndex;
    let iterations = 0;
    
    // Only try once around the array to avoid infinite loop
    while (iterations < photos.length) {
      previousIndex = previousIndex === 0 ? photos.length - 1 : previousIndex - 1;
      iterations++;
      
      // Skip photos that are still loading or have errors
      const previousPhoto = photos[previousIndex];
      if (previousPhoto && 
          ((previousPhoto.images && previousPhoto.images.length > 0) || 
           previousPhoto.isOriginal)) {
        // We found a valid photo
        break;
      }
    }
    
    // Only proceed if we found a valid previous photo
    if (previousIndex !== selectedPhotoIndex && iterations < photos.length) {
      setSelectedPhotoIndex(previousIndex);
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
  const getPreviousPhotoIndex = (currentIndex) => {
    // Find previous valid photo
    let previousIndex = currentIndex;
    let iterations = 0;
    
    while (iterations < photos.length) {
      previousIndex = previousIndex === 0 ? photos.length - 1 : previousIndex - 1;
      iterations++;
      
      const previousPhoto = photos[previousIndex];
      if (previousPhoto && 
          ((previousPhoto.images && previousPhoto.images.length > 0) || 
           previousPhoto.isOriginal)) {
        // We found a valid photo
        return previousIndex;
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

    // Handle photo navigation
    if (selectedPhotoIndex !== null) {
      if (e.key === 'Escape') {
        setSelectedPhotoIndex(null);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const previousIndex = selectedPhotoIndex === 0 ? photos.length - 1 : selectedPhotoIndex - 1;
        setSelectedPhotoIndex(previousIndex);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIndex = selectedPhotoIndex === photos.length - 1 ? 0 : selectedPhotoIndex + 1;
        setSelectedPhotoIndex(nextIndex);
      }
    }
  }, [selectedPhotoIndex, photos.length, showControlOverlay]);

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

  // iOS orientation fix
  useEffect(() => {
    function isIOS() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent);
    }
    if (isIOS() && videoReference.current) {
      // Add a special class so CSS can rotate it if in portrait
      videoReference.current.classList.add('ios-fix');
    }
  }, []);

  // Add an effect to properly initialize the slothicorn
  useEffect(() => {
    // Ensure slothicorn is properly initialized
    if (slothicornReference.current) {
      // Just initialize the transition property to prevent abrupt changes
      slothicornReference.current.style.transition = 'none';
      
      // Force a reflow to ensure style is applied
      void slothicornReference.current.offsetHeight;
    }
  }, []);

  // First, let's create a helper function to generate random prompts
  const generateRandomPrompts = (count) => {
    // Get all prompts except 'custom' and 'random'
    const availablePrompts = Object.entries(defaultStylePrompts)
      .filter(([key]) => key !== 'custom' && key !== 'random')
      .map(([key, value]) => ({ key, value }));
    
    // Shuffle array using Fisher-Yates algorithm
    for (let index = availablePrompts.length - 1; index > 0; index--) {
      const index_ = Math.floor(Math.random() * (index + 1));
      [availablePrompts[index], availablePrompts[index_]] = [availablePrompts[index_], availablePrompts[index]];
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
      const stylePrompt = (selectedStyle === 'custom')
        ? (customPrompt || 'A custom style portrait')
        : (selectedStyle === 'random'
          ? defaultStylePrompts[getRandomStyle()]
          : selectedStyle === 'randomMix'
            ? getRandomMixPrompts(numberImages)
            : defaultStylePrompts[selectedStyle]);
      console.log('Style prompt:', stylePrompt);
      projectStateReference.current = {
        currentPhotoIndex: newPhotoIndex,
        pendingCompletions: new Map()
      };

      // Set up photos state first
      setPhotos(previous => {
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
          newPhotos.push({
            id: Date.now() + index + 1,
            generating: true,
            loading: true,
            progress: 0,
            images: [],
            error: null,
            originalDataUrl: dataUrl, // Use reference photo as placeholder
            newlyArrived: false
          });
        }
        return newPhotos;
      });

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
            
            setPhotos(previous => {
              const updated = [...previous];
              if (!updated[photoIndex]) return previous;
              
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
        numberOfImages: numberImages,
        scheduler: 'DPM Solver Multistep (DPM-Solver++)',
        timeStepSpacing: 'Karras',
        controlNet: {
          name: 'instantid',
          image: new Uint8Array(arrayBuffer),
          strength: controlNetStrength,
          mode: 'balanced',
          guidanceStart: 0,
          guidanceEnd: controlNetGuidanceEnd,
        }
      });

      activeProjectReference.current = project.id;
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
        activeProjectReference.current = null; // Clear active project reference when complete
        if (urls.length === 0) return;
        
        for (const [index, url] of urls.entries()) {
          const offset = keepOriginalPhoto ? 1 : 0;
          const photoIndex = index + offset;
          
          setPhotos(previous => {
            const updated = [...previous];
            if (!updated[photoIndex]) return previous;
            
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
        
        const jobIndex = jobMap.get(job.id);
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
        console.log(`Loading image for job ${job.id} into box ${photoIndex}`);
        
        const img = new Image();
        img.addEventListener('load', () => {
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
              progress: 100,
              images: [job.resultUrl],
              newlyArrived: true
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
        const jobIndex = jobMap.get(job.id);
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
            permanentError: true // Add flag to prevent overwriting by other successful jobs
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
    setPhotos((previous) => [...previous, newPhoto]);
    const newPhotoIndex = photos.length;

    // Read the file as dataURL so we can keep it (originalDataUrl)
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      const dataUrl = event.target.result;
      newPhoto.originalDataUrl = dataUrl;

      // Now feed the Blob itself into the generator
      generateFromBlob(file, newPhotoIndex, dataUrl);
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
      
      // Show slothicorn when countdown reaches 2
      if (index === 2 && slothicornReference.current) {
        // Force the slothicorn to be visible and animated
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
    
    // Make slothicorn return more gradually
    setTimeout(() => {
      if (slothicornReference.current) {
        slothicornReference.current.style.transition = 'bottom 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
        slothicornReference.current.style.setProperty('bottom', '-340px', 'important');
        
        // Wait for animation to complete, then clean up
        setTimeout(() => {
          slothicornReference.current.style.transition = 'none';
          slothicornReference.current.classList.remove('animating');
        }, 1500);
      }
    }, 1200);
  };

  const triggerFlashAndCapture = () => {
    // Play camera shutter sound
    if (shutterSoundReference.current) {
      shutterSoundReference.current.play().catch(error => {
        console.warn("Error playing shutter sound:", error);
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
    const deviceId = e.target.value;
    setSelectedCameraDeviceId(deviceId);
    // Start new stream on that device
    await startCamera(deviceId);
  };

  // -------------------------
  //   Main area (video)
  // -------------------------
  const renderMainArea = () => (
    <div className={`camera-polaroid-bg ${cameraAnimating ? (showPhotoGrid ? 'camera-flying-in' : 'camera-flying-out') : ''}`}
      style={{
        display: showPhotoGrid ? 'none' : 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100vw',
        height: '100vh',
        minHeight: 0,
        minWidth: 0,
        background: 'transparent',
        zIndex: 10,
        position: 'absolute', // Changed from relative to absolute
        pointerEvents: 'none', // Add this to let clicks through
      }}>
      <div className="polaroid-frame" style={{
        pointerEvents: 'auto', // Add this to restore clicks on the frame
        background: '#faf9f6',
        borderRadius: 8, // FIX: Subtle, authentic polaroid corners
        boxShadow: '0 8px 30px rgba(0,0,0,0.18), 0 1.5px 0 #e5e5e5',
        border: '1.5px solid #ececec',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 0,
        width: '100%',
        maxWidth: 'min(98vw, 700px)',
        minWidth: 380,
        height: 'auto',
        maxHeight: '90vh',
        position: 'relative',
        overflow: 'visible',
        margin: '0 auto',
        zIndex: 10_001,
      }}>
        {/* FIX: Controls row is visually inside the thick top border, not floating above or outside */}
        <div style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          boxSizing: 'border-box',
          minHeight: 0,
          gap: 12,
          height: 56, // Make the top bar tall
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
        }}>
          <div className="photobooth-title" style={{
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 20,
            fontWeight: 'bold',
            color: '#ff5e8a',
            textShadow: '0 1px 0 #fff',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            margin: 0,
            padding: 0,
            lineHeight: 1.2,
          }}>
            SOGNI PHOTOBOOTH
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Remove the header style selector completely */}
            <button 
              className="header-config-btn"
              onClick={() => {
                setShowControlOverlay(!showControlOverlay);
                if (!showControlOverlay) {
                  setShowStyleDropdown(false);
                }
              }}
              style={{ marginLeft: 4 }}
            >
              {showControlOverlay ? '✕' : '⚙️'}
            </button>
          </div>
        </div>
        {/* FIX: Strict 9:7 aspect ratio, subtle 8px border radius, with fallback for browsers without aspect-ratio */}
        <div style={{
          width: '100%',
          aspectRatio: '9 / 7', // Strict 9:7 aspect ratio
          background: 'white',
          borderLeft: '32px solid white',
          borderRight: '32px solid white',
          borderTop: '56px solid white',
          borderBottom: '120px solid white',
          borderRadius: 8, // Subtle corners
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 0,
          transition: 'all 0.2s',
          // Fallback for browsers without aspect-ratio
          paddingBottom: '77.78%', // 7/9 = 0.7778, so 9:7 aspect
          height: 0,
          minHeight: 0,
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <video
              id="webcam"
              ref={videoReference}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                background: '#222',
                borderRadius: 0, // Remove border radius for sharp corners
                aspectRatio: '9 / 7',
                maxWidth: '100%',
                maxHeight: '100%',
                transition: 'all 0.2s',
              }}
            />
            {countdown > 0 && (
              <div className="countdown-overlay">
                {countdown}
              </div>
            )}
            {showFlash && <div className="flash-overlay" />}
          </div>
        </div>
        {/* FIX: Take Photo button is always fully inside the bottom border, vertically centered, never hanging off */}
        <div className="polaroid-bottom-tab" style={{
          width: '100%',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          boxSizing: 'border-box',
          background: 'transparent',
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          boxShadow: 'none',
          marginTop: '-120px', // FIX: Match new bottom border height
          zIndex: 3,
          position: 'relative',
          height: 120, // FIX: Match new bottom border height
        }}>
          {/* Add style selector to the left of the Take Photo button */}
          <div className="style-selector bottom-style-selector" style={{
            position: 'absolute',
            left: '50%',
            marginLeft: '-180px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 5,
            textAlign: 'left',
            width: 'calc(100% - 64px)', // clamp to polaroid inner width
            maxWidth: 340,
            marginBottom: '18px',
            marginRight: '24px',
            wordBreak: 'break-word',
        }}>
          <button
              ref={styleButtonReference}
              className="bottom-style-select" 
              onClick={toggleStyleDropdown}
              style={{
                all: 'unset',
                background: 'none',
                border: 'none',
                color: '#333',
                fontSize: 18,
                padding: 0,
                cursor: 'pointer',
                display: 'block',
                whiteSpace: 'normal',
                overflow: 'visible',
                textOverflow: 'clip',
                wordBreak: 'break-word',
                textAlign: 'left',
                position: 'relative',
                textTransform: 'none',
                boxShadow: 'none',
                borderRadius: 0,
                minWidth: 0,
                minHeight: 0,
                lineHeight: 'normal',
                margin: '0 auto',
                maxWidth: '100%',
                fontFamily: '"Permanent Marker", cursive',
                fontWeight: 'bold'
              }}
            >
              Prompt: {selectedStyle === 'custom' 
                ? 'Custom...' 
                : styleIdToDisplay(selectedStyle)}
            </button>
            
            {showStyleDropdown && (
              <div className={`style-dropdown ${dropdownPosition}-position`} style={{
                position: 'absolute',
                maxHeight: 300,
                width: 280,
                background: 'white',
                borderRadius: 5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                overflow: 'auto',
                zIndex: 10_000,
                transformOrigin: dropdownPosition === 'top' ? 'center bottom' : 'center top',
                animation: 'dropdownAppear 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards',
                left: '50%',
                transform: 'translateX(-50%)',
                ...(dropdownPosition === 'top' 
                  ? { bottom: '100%', marginBottom: '10px' } 
                  : { top: '100%', marginTop: '10px' }),
                border: '1px solid rgba(0,0,0,0.1)',
                fontFamily: '"Permanent Marker", cursive',
                fontSize: 13,
              }}>
            
            <style>{`
              @keyframes dropdownAppear {
                from {
                  opacity: 0;
                  transform: translateX(-50%) translateY(10px);
                }
                to {
                  opacity: 1; 
                  transform: translateX(-50%) translateY(0);
                }
              }
            `}</style>
                <div className="style-section featured">
                  {/* Featured options */}
                  <div 
                    className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
                    onClick={() => { 
                      updateSetting(setSelectedStyle, 'selectedStyle')('randomMix');
                      setShowStyleDropdown(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      color: selectedStyle === 'randomMix' ? '#ff5e8a' : '#333',
                      background: selectedStyle === 'randomMix' ? '#fff0f4' : 'transparent',
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: 13,
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ marginRight: 8 }}>🎲</span>
                    <span>Random Mix</span>
                  </div>
                  
                  <div 
                    className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
                    onClick={() => { 
                      updateSetting(setSelectedStyle, 'selectedStyle')('random');
                      setShowStyleDropdown(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      color: selectedStyle === 'random' ? '#ff5e8a' : '#333',
                      background: selectedStyle === 'random' ? '#fff0f4' : 'transparent',
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: 13,
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ marginRight: 8 }}>🔀</span>
                    <span>Random</span>
                  </div>
                  
                  <div 
                    className={`style-option ${selectedStyle === 'custom' ? 'selected' : ''}`} 
                    onClick={() => { 
                      updateSetting(setSelectedStyle, 'selectedStyle')('custom');
                      setShowStyleDropdown(false);
                      setShowControlOverlay(true);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      color: selectedStyle === 'custom' ? '#ff5e8a' : '#333',
                      background: selectedStyle === 'custom' ? '#fff0f4' : 'transparent',
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: 13,
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ marginRight: 8 }}>✏️</span>
                    <span>Custom...</span>
                  </div>
                </div>
                
                <div className="style-section regular">
                  {Object.keys(defaultStylePrompts)
                    .filter(key => key !== 'random' && key !== 'custom' && key !== 'randomMix')
                    .sort()
                    .map(styleKey => (
                      <div 
                        key={styleKey}
                        className={`style-option ${selectedStyle === styleKey ? 'selected' : ''}`} 
                        onClick={() => { 
                          updateSetting(setSelectedStyle, 'selectedStyle')(styleKey);
                          setShowStyleDropdown(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          color: selectedStyle === styleKey ? '#ff5e8a' : '#333',
                          background: selectedStyle === styleKey ? '#fff0f4' : 'transparent',
                          fontFamily: '"Permanent Marker", cursive',
                          fontSize: 13,
                          textAlign: 'left'
                        }}
                      >
                        <span>{styleIdToDisplay(styleKey)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <button
            className={`take-photo-polaroid-btn camera-shutter-btn ${isPhotoButtonCooldown || activeProjectReference.current ? 'cooldown' : ''}`}
            onClick={handleTakePhoto}
            disabled={!isSogniReady || isPhotoButtonCooldown || activeProjectReference.current}
            style={{
              background: isPhotoButtonCooldown || activeProjectReference.current ? '#eee' : '#fff',
              color: '#222',
              border: '4px solid #222',
              borderRadius: '50%',
              width: 64,
              height: 64,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 700,
              cursor: isPhotoButtonCooldown || activeProjectReference.current ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              outline: 'none',
              margin: 0,
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)', // Centered in tab
            }}
          >
            <span style={{
              display: 'block',
              width: 28,
              height: 28,
              background: isPhotoButtonCooldown || activeProjectReference.current ? '#bbb' : '#ff5252',
              borderRadius: '50%',
              margin: '0 auto',
              border: '2px solid #fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
            }} />
            <span style={{
              position: 'absolute',
              bottom: -25, // Moved down slightly for more space
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: activeProjectReference.current ? 11 : 13, // Smaller font for longer text
              fontWeight: 600,
              color: '#222',
              letterSpacing: activeProjectReference.current ? 0 : 1, // Remove letter spacing for longer text
              textShadow: '0 1px 2px #fff',
              whiteSpace: 'nowrap',
              width: 'auto',
              minWidth: '140px', // Ensure there's enough width for the longer text
              textAlign: 'center'
            }}>
              {activeProjectReference.current ? "Photo in Progress" : "Take Photo"}
            </span>
          </button>
        </div>
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
                min={2}
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
      </div>
    </div>
  );

  // -------------------------
  //   Selected Photo Display (Fullscreen Polaroid)
  // -------------------------
  const renderSelectedPhoto = () => {
    if (selectedPhotoIndex == null || selectedPhotoIndex < 0 || !photos[selectedPhotoIndex]) return null;
    const currentPhoto = photos[selectedPhotoIndex];
    const imageUrl = currentPhoto.images[selectedSubIndex] || currentPhoto.originalDataUrl;
    if (!imageUrl) return null;
    // Get natural size
    const [naturalSize, setNaturalSize] = React.useState({ width: null, height: null });
    React.useEffect(() => {
      if (!imageUrl) return;
      const img = new window.Image();
      img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = imageUrl;
    }, [imageUrl]);
    // Use same sizing as camera view
    const aspectRatio = 1152 / 896;
    const maxFrameWidth = Math.min(window.innerWidth * 0.85, 700, naturalSize.width || Infinity);
    const maxFrameHeight = Math.min(window.innerHeight * 0.85, 700 / aspectRatio, naturalSize.height || Infinity);
      return (
      <div className="selected-photo-container" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99_999,
        padding: '40px',
      }}>
        <div className="polaroid-frame" style={{
          background: '#faf9f6',
          borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,0.18), 0 1.5px 0 #e5e5e5',
          border: '1.5px solid #ececec',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: 0,
          width: '100%',
          maxWidth: maxFrameWidth,
          minWidth: 380,
          height: 'auto',
          maxHeight: maxFrameHeight,
          position: 'relative',
          overflow: 'visible',
          margin: '0 auto',
          zIndex: 10_001,
        }}>
          <div style={{
            width: '100%',
            aspectRatio: '9 / 7',
            background: 'white',
            borderLeft: '32px solid white',
            borderRight: '32px solid white',
            borderTop: '56px solid white',
            borderBottom: '120px solid white',
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 0,
            transition: 'none', // Remove animation
          }}>
            <div style={{
              width: '100%',
              aspectRatio: '9 / 7',
              background: 'white',
              borderLeft: '32px solid white',
              borderRight: '32px solid white',
              borderTop: '56px solid white',
              borderBottom: '120px solid white',
              borderRadius: 8,
              boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 0,
              transition: 'none', // Remove animation
              paddingBottom: '77.78%',
              height: 0,
              minHeight: 0,
            }}>
        <img
          src={imageUrl}
                alt={`Photo #${selectedPhotoIndex + 1}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  background: '#fff',
                  borderRadius: 0,
                  aspectRatio: '9 / 7',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  transition: 'none', // Remove animation
                }}
              />
        </div>
            <div className="photo-label" style={{
              position: 'absolute',
              bottom: 24,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: '"Permanent Marker", cursive',
              fontSize: 24,
              color: '#333',
              zIndex: 2,
            }}>
              #{selectedPhotoIndex + 1}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
    
    return (
      <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'}`}>
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
          ← Back to Camera
        </button>

        {/* Navigation buttons - only show when a photo is selected */}
        {selectedPhotoIndex !== null && photos.length > 1 && (
          <>
            <button className="photo-nav-btn prev" onClick={goToPreviousPhoto}>
              &#8249;
            </button>
            <button className="photo-nav-btn next" onClick={goToNextPhoto}>
              &#8250;
            </button>
          </>
        )}

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
          padding: '32px',
        }}>
          {photos.map((photo, index) => {
            const isSelected = index === selectedPhotoIndex;
            const isReference = photo.isOriginal;
            const placeholderUrl = photo.originalDataUrl;
            const progress = Math.floor(photo.progress || 0);
            const loadingLabel = progress > 0 ? `${progress}%` : "";
            const labelText = isReference ? "Reference" : `#${index-keepOriginalPhoto+1}`;
            const aspectRatio = 1152 / 896;

            // Loading or error state
            if ((photo.loading && photo.images.length === 0) || (photo.error && photo.images.length === 0)) {
              return (
                <div
                  key={photo.id}
                  className={`film-frame loading ${isSelected ? 'selected' : ''}`}
                  data-fadepolaroid={photo.loading && !photo.error ? 'true' : undefined}
                  onClick={() => isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index)}
                >
                  <div className="aspect-ratio-box">
                    {placeholderUrl && (
                      <img
                        src={placeholderUrl}
                        alt="Reference"
                        className="placeholder"
                        style={{ opacity: photo.loading && !photo.error ? undefined : 0.2, transition: 'opacity 0.5s' }}
                      />
                    )}
                  </div>
                  <div className="photo-label" style={{ color: photo.error ? '#d32f2f' : undefined, fontWeight: photo.error ? 700 : undefined }}>
                    {photo.error ? 
                      `Error: ${typeof photo.error === 'object' ? 'Generation failed' : photo.error}` 
                      : (loadingLabel || labelText)}
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
                  element.style.transform = `rotate(var(--rotation))`;
                  
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
                element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale}) rotate(var(--rotation))`;
                
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
                className={`film-frame ${isSelected ? 'selected' : ''}`}
                onClick={(e) => handlePhotoSelect(index, e)}
                style={{
                  '--rotation': `${isSelected ? '0deg' : 
                    `${(index % 2 === 0 ? 1 : -1) * (0.8 + (index % 3) * 0.5)}deg`}`  // More natural rotation based on index
                }}
              >
                <div className="aspect-ratio-box">
                    <img
                      src={thumbUrl}
                      alt={`Generated #${index}`}
                  />
                </div>
                <div className="photo-label">
                  {labelText}
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
    setSelectedModel(DEFAULT_SETTINGS.selectedModel);
    setNumberImages(DEFAULT_SETTINGS.numImages);
    setPromptGuidance(DEFAULT_SETTINGS.promptGuidance);
    setControlNetStrength(DEFAULT_SETTINGS.controlNetStrength);
    setControlNetGuidanceEnd(DEFAULT_SETTINGS.controlNetGuidanceEnd);
    setFlashEnabled(DEFAULT_SETTINGS.flashEnabled);
    setKeepOriginalPhoto(DEFAULT_SETTINGS.keepOriginalPhoto);
    setSelectedStyle(DEFAULT_SETTINGS.selectedStyle);
    setCustomPrompt('');
    
    // Save all defaults to cookies
    saveSettingsToCookies(DEFAULT_SETTINGS);
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

  // Add these helper functions for random styles
  const getRandomStyle = () => {
    const availableStyles = Object.keys(defaultStylePrompts)
      .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix');
    return availableStyles[Math.floor(Math.random() * availableStyles.length)];
  };

  const getRandomMixPrompts = (count) => {
    const availableStyles = Object.keys(defaultStylePrompts)
      .filter(key => key !== 'custom' && key !== 'random' && key !== 'randomMix');
    
    const selectedPrompts = [];
    for (let index = 0; index < count; index++) {
      const randomStyle = availableStyles[Math.floor(Math.random() * availableStyles.length)];
      selectedPrompts.push(defaultStylePrompts[randomStyle]);
    }
    
    return `{${selectedPrompts.join('|')}}`;
  };

  // Fix the animation transition issue by ensuring we clear state correctly
  const handleBackToCamera = () => {
    // Scroll to top first
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Mark the photo grid as hiding 
    const filmStrip = document.querySelector('.film-strip-container');
    if (filmStrip) {
      filmStrip.classList.remove('visible');
      filmStrip.classList.add('hiding');
    }
    
    // Wait for the hiding animation to finish before showing camera
    setTimeout(() => {
      // Hide photo grid and reset states
      setShowPhotoGrid(false);
      setSelectedPhotoIndex(null);
      setReturnedFromPhotos(true);
      setStudioLightsHidden(false);
      
      // No additional animations - camera should just appear normally
    }, 600); // Match the duration of photoGrid Hide animation
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

  // Add handler for clicks outside the image
  const handlePhotoViewerClick = (e) => {
    // Check if the click is outside the image
    const imageWrapperElement = e.target.closest('.image-wrapper');
    const navButtonElement = e.target.closest('.photo-nav-btn');
    const previewElement = e.target.closest('.photo-preview');
    
    if (!imageWrapperElement && !navButtonElement && !previewElement) {
      handleClosePhoto();
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
          zIndex: 99_999,
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
                min={2}
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
              transition: 'background 0.2s',
              zIndex: 1000,
            }}
            title="Photobooth Tips"
          >
            ?
          </button>
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

        {/* Main area with video - conditional rendering based on showPhotoGrid */}
        {renderMainArea()}

        {/* Photo gallery grid - shown when showPhotoGrid is true */}
        {renderGallery()}

        <canvas ref={canvasReference} className="hidden" />

        {/* Slothicorn mascot with direct DOM manipulation */}
        <div 
          ref={slothicornReference}
          className="slothicorn-container"
        >
          <img 
            src={slothicornImage} 
            alt="Slothicorn mascot" 
            className="slothicorn-image" 
          />
        </div>

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

        {/* FIX: Floating 'View Photos' button only if user has taken a photo */}
        {selectedPhotoIndex === null && !showPhotoGrid && photos.length > 0 && (
          <button
            onClick={() => {
              // Mark the camera as hiding
              setCameraAnimating(true);
              // Show the photo grid with animation
              setShowPhotoGrid(true);
              // Reset camera animating after animation completes
              setTimeout(() => {
                setCameraAnimating(false);
              }, 600);
            }}
            style={{
              position: 'absolute',
              bottom: 18,
              right: 18,
              zIndex: 10,
              background: 'linear-gradient(135deg, #ff5e8a 0%, #ff3366 100%)',
              color: '#fff',
              border: '2px solid #fff',
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(255, 51, 102, 0.25)',
              padding: '12px 24px',
              fontWeight: 900,
              fontSize: 18,
              cursor: 'pointer',
              fontFamily: '"Permanent Marker", cursive',
              letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
              gap: 10,
              transition: 'all 0.2s',
            }}
          >
            <span style={{fontSize: 22, marginRight: 6}}>📸</span> View Photos
          </button>
        )}
      </div>

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
          
          /* ------- FIX 5: Slideshow Polaroid frame ------- */
          .selected-photo-container {
            background: rgba(0,0,0,0.85);
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

