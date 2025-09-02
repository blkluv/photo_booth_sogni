import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

import { getModelOptions, defaultStylePrompts as initialStylePrompts, TIMEOUT_CONFIG, isFluxKontextModel } from './constants/settings';
import { photoThoughts, randomThoughts } from './constants/thoughts';
import { saveSettingsToCookies, shouldShowPromoPopup, markPromoPopupShown } from './utils/cookies';
import { styleIdToDisplay } from './utils';
import { getCustomDimensions } from './utils/imageProcessing';
import { goToPreviousPhoto, goToNextPhoto } from './utils/photoNavigation';
import { initializeStylePrompts, getRandomStyle, getRandomMixPrompts } from './services/prompts';
import { getDefaultThemeGroupState, getEnabledPrompts, getOneOfEachPrompts } from './constants/themeGroups';
import { getThemeGroupPreferences } from './utils/cookies';
import { initializeSogniClient } from './services/sogni';
import { isNetworkError } from './services/api';
import { enhancePhoto, undoEnhancement, redoEnhancement } from './services/PhotoEnhancer';
import { shareToTwitter } from './services/TwitterShare';
import { themeConfigService } from './services/themeConfig';
import { trackPageView, initializeGA, trackEvent } from './utils/analytics';
import clickSound from './click.mp3';
import cameraWindSound from './camera-wind.mp3';
// import helloSound from './hello.mp3';
import light1Image from './light1.png';
import light2Image from './light2.png';
import './App.css';
import './styles/style-dropdown.css';
import './styles/ios-chrome-fixes.css';
import './styles/mobile-portrait-fixes.css'; // New critical mobile portrait fixes
import './styles/mobile-chrome-fixes.css'; // Chrome mobile context menu fixes
import './styles/pwa-standalone-fixes.css'; // PWA standalone mode fixes

import CameraView from './components/camera/CameraView';
import CameraStartMenu from './components/camera/CameraStartMenu';
import StyleDropdown from './components/shared/StyleDropdown';
import AdvancedSettings from './components/shared/AdvancedSettings';
import PWAInstallPrompt from './components/shared/PWAInstallPrompt';
import promptsData from './prompts.json';
import PhotoGallery from './components/shared/PhotoGallery';
import { useApp } from './context/AppContext.tsx';
import TwitterShareModal from './components/shared/TwitterShareModal';

import FriendlyErrorModal from './components/shared/FriendlyErrorModal';
import SuccessToast from './components/shared/SuccessToast';

import SplashScreen from './components/shared/SplashScreen';
// Import the ImageAdjuster component
import ImageAdjuster from './components/shared/ImageAdjuster';
// Import the UploadProgress component
import UploadProgress from './components/shared/UploadProgress';
import PromoPopup from './components/shared/PromoPopup';
import NetworkStatus from './components/shared/NetworkStatus';
import ConfettiCelebration from './components/shared/ConfettiCelebration';
import { subscribeToConnectionState, getCurrentConnectionState } from './services/api';



// Helper function to update URL with prompt parameter
const updateUrlWithPrompt = (promptKey) => {
  if (!promptKey || ['randomMix', 'random', 'custom', 'oneOfEach'].includes(promptKey)) {
    // Remove the parameter if randomMix or empty
    const url = new URL(window.location.href);
    url.searchParams.delete('prompt');
    window.history.replaceState({}, '', url);
  } else {
    // Add/update the parameter
    const url = new URL(window.location.href);
    url.searchParams.set('prompt', promptKey);
    window.history.replaceState({}, '', url);
  }
};

// Helper function to get the hashtag for a style
const getHashtagForStyle = (styleKey) => {
  if (!styleKey || styleKey === 'custom' || styleKey === 'random' || styleKey === 'randomMix' || styleKey === 'oneOfEach') {
    return null;
  }
  return styleKey;
};

const App = () => {

  
  const videoReference = useRef(null);
  const canvasReference = useRef(null);
  const shutterSoundReference = useRef(null);
  const cameraWindSoundReference = useRef(null);
  // const helloSoundReference = useRef(null);
  const slothicornReference = useRef(null);
  const soundPlayedForPhotos = useRef(new Set()); // Track which photo IDs have already played sound

  useEffect(() => {
    const unlockAudio = () => {
      if (shutterSoundReference.current) {
        const audio = shutterSoundReference.current;
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false; // Unmute for future real plays
        }).catch(err => {
          console.warn('Failed to unlock shutter sound:', err);
        });
      }
    
      if (cameraWindSoundReference.current) {
        const audio = cameraWindSoundReference.current;
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(err => {
          console.warn('Failed to unlock wind sound:', err);
        });
      }
      /*
      if (helloSoundReference.current) {
        const audio = helloSoundReference.current;
        audio.muted = true;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }).catch(err => {
          console.warn('Failed to unlock hello sound:', err);
        });
      }
      */
  
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("click", unlockAudio);
    };
  
    window.addEventListener("touchstart", unlockAudio, { once: true });
    window.addEventListener("click", unlockAudio, { once: true });
  }, []);

  // --- Use AppContext for settings ---
  const { settings, updateSetting, switchToModel, resetSettings } = useApp();
  const { 
    selectedStyle, 
    selectedModel, 
    numImages,
    promptGuidance, 
    controlNetStrength, 
    controlNetGuidanceEnd, 
    inferenceSteps,
    scheduler,
    timeStepSpacing,
    guidance,
    flashEnabled, 
    keepOriginalPhoto,
    positivePrompt,
    stylePrompt,
    negativePrompt,
    seed,
    soundEnabled,
    slothicornAnimationEnabled,
    backgroundAnimationsEnabled,
    aspectRatio,
    tezdevTheme,
    outputFormat,
    sensitiveContentFilter,
    kioskMode
  } = settings;

  // Extract preferredCameraDeviceId for easier access
  const { preferredCameraDeviceId } = settings;
  // --- End context usage ---

  // Add state for style prompts instead of modifying the imported constant
  const [stylePrompts, setStylePrompts] = useState(initialStylePrompts);
  
  // Add state to track the current hashtag for sharing
  const [currentHashtag, setCurrentHashtag] = useState(null);
  
  // Track current theme state for real-time filtering
  const [currentThemeState, setCurrentThemeState] = useState(() => {
    const saved = getThemeGroupPreferences();
    const defaultState = getDefaultThemeGroupState();
    return { ...defaultState, ...saved };
  });

  // Callback to handle theme changes from StyleDropdown
  const handleThemeChange = useCallback((newThemeState) => {
    setCurrentThemeState(newThemeState);
  }, []);

  // Info modal state - adding back the missing state
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showPhotoGrid, setShowPhotoGrid] = useState(false);
  
  // PWA install prompt state - disable for testing with ?noPrompt=1
  const [showPWAPrompt, setShowPWAPrompt] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('noPrompt') !== '1';
  });
  
  // Add state for image adjustment
  const [showImageAdjuster, setShowImageAdjuster] = useState(false);
  const [currentUploadedImageUrl, setCurrentUploadedImageUrl] = useState('');
  const [currentUploadedSource, setCurrentUploadedSource] = useState('');
  

  
  // Helper functions for localStorage persistence
  const saveLastEditablePhotoToStorage = async (photoData) => {
    try {
      if (photoData.blob) {
        // Convert blob to base64 data URL for storage
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const dataToStore = {
            ...photoData,
            dataUrl: dataUrl,
            // Remove blob since we have dataUrl now
            blob: null
          };
          localStorage.setItem('sogni-lastEditablePhoto', JSON.stringify(dataToStore));
        };
        reader.readAsDataURL(photoData.blob);
      } else {
        // No blob, just store what we have
        // eslint-disable-next-line no-unused-vars
        const { blob, ...photoDataWithoutBlob } = photoData;
        localStorage.setItem('sogni-lastEditablePhoto', JSON.stringify(photoDataWithoutBlob));
      }
    } catch (error) {
      console.warn('Failed to save lastEditablePhoto to localStorage:', error);
    }
  };

  const loadLastEditablePhotoFromStorage = () => {
    try {
      const stored = localStorage.getItem('sogni-lastEditablePhoto');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to load lastEditablePhoto from localStorage:', error);
      return null;
    }
  };

  // Add state to store the last photo data for re-editing
  const [lastEditablePhoto, setLastEditablePhotoState] = useState(null);
  
  // Custom setter that also saves to localStorage
  const setLastEditablePhoto = (photoData) => {
    setLastEditablePhotoState(photoData);
    if (photoData) {
      saveLastEditablePhotoToStorage(photoData);
    } else {
      localStorage.removeItem('sogni-lastEditablePhoto');
    }
  };



  // Load lastEditablePhoto from localStorage on app mount
  useEffect(() => {
    const storedPhotoData = loadLastEditablePhotoFromStorage();

    if (storedPhotoData) {
      // We don't have the blob anymore, but we have the adjustments
      setLastEditablePhotoState(storedPhotoData);
    }
  }, []);
  
  // Add state for upload progress
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('Uploading image...');
  
  // Add the start menu state here
  const [showStartMenu, setShowStartMenu] = useState(true);
  
  // Add state for promotional popup
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  
  // Connection state management
  const [connectionState, setConnectionState] = useState(getCurrentConnectionState());
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Add state for confetti celebration
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Track if confetti has been shown this session (using useRef to persist across renders)
  const confettiShownThisSession = useRef(false);
  
  // Hide confetti immediately when background animations are disabled
  useEffect(() => {
    if (!backgroundAnimationsEnabled && showConfetti) {
      setShowConfetti(false);
    }
  }, [backgroundAnimationsEnabled, showConfetti]);
  
  // Helper function to trigger promotional popup after batch completion
  const triggerPromoPopupIfNeeded = () => {
    if (shouldShowPromoPopup()) {
      // Add a small delay to let the UI settle after batch completion
      setTimeout(() => {
        setShowPromoPopup(true);
      }, 20000);
    }
  };

  // Helper function to trigger confetti celebration when batch completes
  const triggerBatchCelebration = () => {
    // Only show confetti if background animations are enabled AND it hasn't been shown this session
    if (backgroundAnimationsEnabled && !confettiShownThisSession.current) {
      // Mark confetti as shown for this session
      confettiShownThisSession.current = true;
      
      // Reset confetti state first, then trigger new animation
      setShowConfetti(false);
      // Small delay to let the final photos settle in and ensure state reset
      setTimeout(() => {
        setShowConfetti(true);
      }, 600);
    }
  };

  // Add this for testing - you can call this from browser console
  window.showPromoPopupNow = () => {
    setShowPromoPopup(true);
  };
  
  // Add testing function for confetti celebration
  window.testConfettiCelebration = () => {
    if (!backgroundAnimationsEnabled) {
      console.log('🎊 Confetti is disabled. Enable "Background Animations" in settings to see confetti.');
      return;
    }
    
    if (confettiShownThisSession.current) {
      console.log('🎊 Confetti has already been shown this session. It only shows on the first batch completion.');
      console.log('💡 Tip: Refresh the page to reset the session and see confetti again.');
      return;
    }
    
    triggerBatchCelebration();
  };
  
  // Add function to reset confetti session (for testing)
  window.resetConfettiSession = () => {
    confettiShownThisSession.current = false;
    console.log('🎊 Confetti session reset! Next batch completion will show confetti.');
  };
  
  // Handle promotional popup close
  const handlePromoPopupClose = () => {
    setShowPromoPopup(false);
    markPromoPopupShown();
  };

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
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(preferredCameraDeviceId || null); // Initialize from settings
  const [isFrontCamera, setIsFrontCamera] = useState(true); // Keep this local state

  // State for orientation handler cleanup
  const [orientationHandler, setOrientationHandler] = useState(null);

  // Determine the desired dimensions for Sogni (and camera constraints)
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions(aspectRatio); // Pass aspectRatio here

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

  // --- Handle URL parameters for deeplinks ---
  useEffect(() => {
    // Check for prompt parameter in URL
    const url = new URL(window.location.href);
    const promptParam = url.searchParams.get('prompt');
    
    if (promptParam && stylePrompts && promptParam !== selectedStyle) {
      // If the prompt exists in our style prompts, select it
      if (stylePrompts[promptParam] || Object.keys(promptsData).includes(promptParam)) {
        console.log(`Setting style from URL parameter: ${promptParam}`);
        updateSetting('selectedStyle', promptParam);
        // If we have the prompt value, set it too
        if (stylePrompts[promptParam]) {
          updateSetting('positivePrompt', stylePrompts[promptParam]);
        }
        // Update current hashtag
        setCurrentHashtag(promptParam);
      }
    }
  }, [stylePrompts, updateSetting, selectedStyle, promptsData]);

  // Function to load prompts based on current model
  const loadPromptsForModel = async (modelId) => {
    try {
      const prompts = await initializeStylePrompts(modelId);
      setStylePrompts(prompts);
      console.log(`Loaded prompts for model ${modelId}:`, Object.keys(prompts).length);
    } catch (error) {
      console.error('Error loading prompts:', error);
    }
  };

  // Load prompts on component mount and when model changes
  useEffect(() => {
    loadPromptsForModel(selectedModel);
  }, [selectedModel]);

  // Load themes on startup and set default theme if needed
  useEffect(() => {
    const loadDefaultTheme = async () => {
      try {
        // Pre-load theme configuration
        await themeConfigService.loadConfig();
        
        // Set default theme if current theme is 'off' and there's a default configured
        if (tezdevTheme === 'off') {
          const defaultTheme = await themeConfigService.getDefaultTheme();
          if (defaultTheme) {
            console.log('Setting default theme:', defaultTheme);
            updateSetting('tezdevTheme', defaultTheme);
            saveSettingsToCookies({ tezdevTheme: defaultTheme });
            
            // Set default aspect ratio for the theme
            const theme = await themeConfigService.getTheme(defaultTheme);
            if (theme?.defaultAspectRatio) {
              updateSetting('aspectRatio', theme.defaultAspectRatio);
              saveSettingsToCookies({ aspectRatio: theme.defaultAspectRatio });
            }
          }
        }
      } catch (error) {
        console.warn('Could not load default theme:', error);
      }
    };

    loadDefaultTheme();
  }, []); // Only run on mount

  // Update CSS variables when theme changes
  useEffect(() => {
    const updatePolaroidBorders = () => {
      const root = document.documentElement;
      if (tezdevTheme !== 'off') {
        // Theme frame is active - remove polaroid borders since theme provides its own
        root.style.setProperty('--polaroid-side-border', '0px');
        root.style.setProperty('--polaroid-bottom-border', '0px');
      } else {
        // No theme frame - remove any inline styles to let CSS media queries control the borders
        root.style.removeProperty('--polaroid-side-border');
        root.style.removeProperty('--polaroid-bottom-border');
      }
    };

    updatePolaroidBorders();
  }, [tezdevTheme]);

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
  
  // Ref to track project timeouts and job state
  const projectTimeoutRef = useRef({
    overallTimer: null,
    watchdogTimer: null,
    jobTimers: new Map(),
    projectStartTime: null,
    lastProgressTime: null
  });

  // Add state for current thought
  const [currentThought, setCurrentThought] = useState(null); // Keep this

  // Add state to track if camera has been manually started by the user
  const [cameraManuallyStarted, setCameraManuallyStarted] = useState(false);

  // Add state for Twitter share modal
  const [showTwitterModal, setShowTwitterModal] = useState(false);
  const [twitterPhotoIndex, setTwitterPhotoIndex] = useState(null);
  const [lastTwitterMessage, setLastTwitterMessage] = useState(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Add state for QR code modal (Kiosk Mode)
  const [qrCodeData, setQrCodeData] = useState(null);

  // Add state for splash screen
  const [showSplashScreen, setShowSplashScreen] = useState(true);

  // Cleanup timeouts when component unmounts
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, []);

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
    
    // Track view change events
    if (currentView !== 'start-menu') {
      trackEvent('Navigation', 'view_change', currentView);
    }
  }, [selectedPhotoIndex, showPhotoGrid, showStartMenu]);

  // --- Ensure handlers are defined here, before any JSX or usage ---
  // Update handleUpdateStyle to use updateSetting and update URL
  const handleUpdateStyle = (style) => {
    updateSetting('selectedStyle', style); 
    if (style === 'custom') {
      updateSetting('positivePrompt', ''); 
    } else {
      const prompt = stylePrompts[style] || '';
      updateSetting('positivePrompt', prompt); 
    }
    
    // Update the URL with the prompt parameter
    updateUrlWithPrompt(style);
    
    // Update current hashtag for sharing
    setCurrentHashtag(getHashtagForStyle(style));
  };

  // Update handlePositivePromptChange to use updateSetting
  const handlePositivePromptChange = (value) => {
    updateSetting('positivePrompt', value); 
    if (selectedStyle !== 'custom') {
      const currentPrompt = stylePrompts[selectedStyle] || '';
      if (value !== currentPrompt) {
        updateSetting('selectedStyle', 'custom'); 
        // Clear the URL parameter when switching to custom
        updateUrlWithPrompt(null);
        setCurrentHashtag(null);
      }
    }
  };

  // Optimized thought system - only schedules next thought when conditions are met
  const thoughtInProgress = useRef(false);
  const thoughtTimeoutRef = useRef(null);
  
  // Create refs for condition checking to avoid useCallback recreation
  const conditionsRef = useRef();
  conditionsRef.current = {
    selectedPhotoIndex,
    showSplashScreen,
    showStartMenu,
    slothicornAnimationEnabled
  };

  // Check if thoughts should be shown
  const shouldShowThoughts = useCallback(() => {
    const { selectedPhotoIndex, showSplashScreen, showStartMenu, slothicornAnimationEnabled } = conditionsRef.current;
    return slothicornAnimationEnabled && 
           !showSplashScreen && 
           !showStartMenu && 
           selectedPhotoIndex === null &&
           !thoughtInProgress.current;
  }, []);

  // Schedule the next thought only when conditions are met
  const scheduleNextThought = useCallback(() => {
    if (thoughtTimeoutRef.current) {
      clearTimeout(thoughtTimeoutRef.current);
    }
    
    if (!shouldShowThoughts()) {
      // Check again in 5 seconds if conditions aren't met
      thoughtTimeoutRef.current = setTimeout(scheduleNextThought, 5000);
      return;
    }
    
    const delay = 18000 + Math.random() * 5000; // 18-23 seconds
    thoughtTimeoutRef.current = setTimeout(() => {
      showThought();
      scheduleNextThought(); // Schedule the next one
    }, delay);
  }, [shouldShowThoughts]);

  const showThought = useCallback(() => {
    if (!shouldShowThoughts()) {
      return;
    }
    
    thoughtInProgress.current = true;
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
      thoughtInProgress.current = false;
    }, 4500);
  }, [shouldShowThoughts]);

  // Optimized thought system setup
  useEffect(() => {
    // Initial delay between 5-15 seconds
    const initialDelay = 5000 + Math.random() * 10000;
    console.log(`🤔 Setting up optimized thought system: first check in ${Math.round(initialDelay/1000)}s`);
    
    const firstThought = setTimeout(() => {
      console.log('🤔 Starting thought scheduling system');
      scheduleNextThought();
    }, initialDelay);

    return () => {
      console.log('🤔 Cleaning up thought system');
      clearTimeout(firstThought);
      if (thoughtTimeoutRef.current) {
        clearTimeout(thoughtTimeoutRef.current);
      }
    };
  }, [scheduleNextThought]); // Only depend on scheduleNextThought

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
          console.log(`🎥 Camera resolution achieved: ${videoWidth}x${videoHeight} (aspect ratio: ${(videoWidth/videoHeight).toFixed(3)})`);
          
          // Check for iOS quirk during video loading (using last known request dimensions)
          if (aspectRatio === 'square') {
            detectIOSQuirk(2048, 2048, videoWidth, videoHeight, 'during video load');
          } else if (['ultranarrow', 'narrow', 'portrait'].includes(aspectRatio)) {
            detectIOSQuirk(1080, 1920, videoWidth, videoHeight, 'during video load');
          } else {
            detectIOSQuirk(1920, 1080, videoWidth, videoHeight, 'during video load');
          }
          
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
      
      // Always update mirror effect when front/back camera changes, regardless of video load state
      videoElement.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
    }

    // Cleanup
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('loadedmetadata', handleVideoLoaded);
      }
    };
  }, [videoReference.current, isFrontCamera, aspectRatio]);

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
    const handleResize = () => {
      setVh();
    };
    const handleOrientationChange = () => {
      // Small delay to ensure new dimensions are available
      setTimeout(setVh, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
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
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
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

  // Hide slothicorn when photo is selected to prevent overlap with action buttons
  useEffect(() => {
    if (slothicornReference.current) {
      if (selectedPhotoIndex !== null) {
        // Photo is selected - hide sloth completely
        slothicornReference.current.style.display = 'none';
      } else {
        // No photo selected - show sloth
        slothicornReference.current.style.display = 'block';
      }
    }
  }, [selectedPhotoIndex]);

  // Add state for backend connection errors
  const [backendError, setBackendError] = useState(null);

  // Update the handler for initiating Twitter share
  const handleShareToX = async (photoIndex) => {
    // Check if Kiosk Mode is enabled
    if (kioskMode) {
      // Generate QR code for mobile sharing
      await handleKioskModeShare(photoIndex);
    } else {
      // Set the photo index and open the modal
      setTwitterPhotoIndex(photoIndex);
      setShowTwitterModal(true);
    }
  };

  // Handle Kiosk Mode sharing with QR code
  const handleKioskModeShare = async (photoIndex) => {
    console.log('Kiosk Mode Share - Photo Index:', photoIndex);
    console.log('Kiosk Mode Share - Photo Data:', photos[photoIndex]);
    
    if (!photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
      console.error('No image selected for QR sharing');
      return;
    }

    // Set the photo index immediately so the modal can show the image
    setTwitterPhotoIndex(photoIndex);

    try {
      // Generate a unique sharing ID
      const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Get the current URL configuration
      const currentUrl = new URL(window.location.href);
      const baseUrl = currentUrl.origin;
      
      // Create the mobile sharing URL
      const mobileShareUrl = `${baseUrl}/mobile-share/${shareId}`;
      
      // Store the sharing data (we'll need to send this to the backend)
      const shareData = {
        shareId,
        photoIndex,
        imageUrl: photos[photoIndex].images[0],
        tezdevTheme,
        aspectRatio,
        outputFormat,
        timestamp: Date.now()
      };

      console.log('Creating mobile share with data:', shareData);

      // Send the share data to the backend for storage
      const response = await fetch('/api/mobile-share/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shareData),
      });

      if (!response.ok) {
        throw new Error('Failed to create mobile share');
      }

      // Set QR code data for overlay
      setQrCodeData({
        shareUrl: mobileShareUrl,
        photoIndex: photoIndex
      });

    } catch (error) {
      console.error('Error creating mobile share:', error);
      // Fallback to regular Twitter sharing
      setShowTwitterModal(true);
    }
  };
  
  // Add a handler for the actual sharing with custom message
  const handleTwitterShare = async (customMessage) => {
    // Store the message for potential retry
    setLastTwitterMessage(customMessage);
    
    // Get the current URL with any hashtag parameter
    const shareUrl = new URL(window.location.href);
    
    // If we have a hashtag and it's not from a custom prompt, add it to the URL
    if (currentHashtag && selectedStyle !== 'custom') {
      shareUrl.searchParams.set('prompt', currentHashtag);
    }
    
    // Call the extracted Twitter sharing service with custom message and URL
    await shareToTwitter({
      photoIndex: twitterPhotoIndex,
      photos,
      setBackendError,
      customMessage,
      shareUrl: shareUrl.toString(), // Pass the full URL with parameters
      tezdevTheme,
      aspectRatio,
      outputFormat,
      onSuccess: () => {
        setSuccessMessage('Your photo has been shared to X/Twitter!');
        setShowSuccessToast(true);
        setShowTwitterModal(false);
      }
    });
  };

  // -------------------------
  //   Connection State Management
  // -------------------------
  useEffect(() => {
    // Subscribe to connection state changes
    const unsubscribe = subscribeToConnectionState((newState) => {
      setConnectionState(newState);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Track if we're currently generating to show appropriate connection status - optimized
  useEffect(() => {
    const hasGeneratingPhotos = photos.some(photo => photo.generating || photo.loading);
    const currentlyGenerating = isGenerating;
    
    // Only update if the generating status actually changed
    if (hasGeneratingPhotos !== currentlyGenerating) {
      setIsGenerating(hasGeneratingPhotos);
    }
    
    // Set up timeout detection for stuck generation states (only when starting generation)
    if (hasGeneratingPhotos && !currentlyGenerating && !activeProjectReference.current) {
      const timeoutId = setTimeout(() => {
        // Check if photos are still generating and no active project
        setPhotos(prev => {
          const stillGenerating = prev.some(photo => photo.generating || photo.loading);
          if (stillGenerating && !activeProjectReference.current) {
            console.warn('Generation appears stuck after 2 minutes with no active project, notifying user');
            setConnectionState('timeout');
          }
          return prev;
        });
      }, 120000); // 2 minutes
      
      return () => clearTimeout(timeoutId);
    }
  }, [photos, isGenerating]); // Include isGenerating to compare previous state

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
        setBackendError('AUTHENTICATION FAILED: Invalid Sogni credentials. Please update the server/.env file with valid credentials.');
      } else {
        setBackendError(`Error connecting to the Sogni service: ${error.message}`);
      }
    }
  }, [sogniClient]); // Added sogniClient as dependency, state setters are stable

  /**
   * Stop the camera stream and clean up resources
   */
  const stopCamera = useCallback(() => {
    if (videoReference.current && videoReference.current.srcObject) {
      console.log('🛑 Stopping camera stream');
      const stream = videoReference.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        console.log(`🛑 Stopping track: ${track.kind} (${track.label})`);
        track.stop();
      });
      
      // Clear the video source
      videoReference.current.srcObject = null;
      
      // Clean up orientation handler if it exists
      if (orientationHandler) {
        window.removeEventListener('orientationchange', orientationHandler);
        setOrientationHandler(null);
      }
    }
  }, [videoReference, orientationHandler, setOrientationHandler]);

  /**
   * Start the camera stream for a given deviceId or fallback.
   * Request specific resolution based on desired aspect ratio.
   */
  const startCamera = useCallback(async (deviceId) => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    
    // Reset iOS quirk detection state for new camera session
    setIosQuirkDetected(false);
    setActualCameraDimensions(null);
    setQuirkDetectionComplete(false);
    console.log('🔄 Starting new camera session - reset iOS quirk detection state');
    
    // Determine resolution based on aspect ratio
    let requestWidth, requestHeight;
    
    if (aspectRatio === 'square') {
      // For 1:1 aspect ratio - request 2048×2048
      requestWidth = 2048;
      requestHeight = 2048;
    } else if (['ultranarrow', 'narrow', 'portrait'].includes(aspectRatio)) {
      // For portrait ratios - request 1080×1920 (but swap on iOS)
      requestWidth = isIOS ? 1920 : 1080;
      requestHeight = isIOS ? 1080 : 1920;
    } else {
      // For landscape ratios - request 1920×1080 (but swap on iOS)
      requestWidth = isIOS ? 1080 : 1920;
      requestHeight = isIOS ? 1920 : 1080;
    }
    
    if (isIOS) {
      console.log(`🍎 iOS detected: Swapping dimensions to compensate for iOS behavior`);
      console.log(`🍎 Portrait modes: requesting ${requestWidth}×${requestHeight} to get portrait feed`);
    }
    
    console.log('📹 Camera request details:', {
      deviceId: deviceId || 'auto-select',
      facingMode: deviceId ? 'not used (specific device)' : (isFrontCamera ? 'user' : 'environment'),
      requestedResolution: `${requestWidth}x${requestHeight}`,
      aspectRatio
    });
    
    const constraints = deviceId
      ? {
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: requestWidth },
            height: { ideal: requestHeight }
          }
        }
      : {
          video: {
            facingMode: isFrontCamera ? 'user' : 'environment',
            width: { ideal: requestWidth },
            height: { ideal: requestHeight }
          }
        };
    
    try {
      // Stop any existing stream first
      if (videoReference.current && videoReference.current.srcObject) {
        const existingStream = videoReference.current.srcObject;
        const tracks = existingStream.getTracks();
        tracks.forEach(track => track.stop());
        
        // On mobile devices, clear the srcObject and add a small delay for cleanup
        const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
        if (isMobileDevice) {
          videoReference.current.srcObject = null;
          // Small delay to ensure stream is fully released on mobile
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log(`✅ Camera stream acquired - requested ${requestWidth}×${requestHeight} for ${aspectRatio} aspect ratio`);
      
      // Get actual resolution for logging and iOS quirk detection
      if (stream.getVideoTracks().length > 0) {
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        
        // Log which camera device was actually selected
        console.log('📹 Actual camera device selected:', {
          deviceId: settings.deviceId || 'unknown',
          label: track.label || 'unknown',
          facingMode: settings.facingMode || 'unknown'
        });
        
        if (settings.width && settings.height) {
          console.log(`📐 Actual camera resolution: ${settings.width}x${settings.height}`);
          
          // Check for iOS dimension swap quirk using helper function
          detectIOSQuirk(requestWidth, requestHeight, settings.width, settings.height, 'in startCamera');
        }
      }
      
      // Add iOS-specific class if needed
      if (isIOS) {
        document.body.classList.add('ios-device');
        
        // Add a slight delay to ensure video element is ready
        setTimeout(() => {
          if (videoReference.current) {
            // Set proper classes for iOS orientation handling
            const currentIsPortrait = window.matchMedia("(orientation: portrait)").matches || window.innerHeight > window.innerWidth;
            if (currentIsPortrait) {
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
        
        // Apply mirror effect immediately for front camera
        videoReference.current.style.transform = isFrontCamera ? 'scaleX(-1)' : 'scaleX(1)';
        
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
      console.error('Failed to get camera access:', error);
      
      // If we failed with a specific device ID, try falling back to auto-select
      if (deviceId && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
        console.warn('📹 Specific camera device failed, trying auto-select fallback...');
        try {
          // Clear the invalid device preference
          updateSetting('preferredCameraDeviceId', undefined);
          setSelectedCameraDeviceId(null);
          
          // Try again without device constraint
          const fallbackConstraints = {
            video: {
              facingMode: isFrontCamera ? 'user' : 'environment',
              width: { ideal: requestWidth },
              height: { ideal: requestHeight }
            }
          };
          
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          console.log('✅ Fallback camera stream acquired');
          
          if (videoReference.current) {
            videoReference.current.srcObject = fallbackStream;
            await videoReference.current.play();
          }
          
          return; // Success with fallback
        } catch (fallbackError) {
          console.error('❌ Fallback camera access also failed:', fallbackError);
        }
      }
      
      throw error;
    }
  }, [desiredWidth, desiredHeight, isFrontCamera, videoReference, setOrientationHandler, aspectRatio]); // Add aspectRatio to dependencies

  /**
   * Enumerate devices and store them in state.
   */
  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevices);
      
      // Validate preferred camera device and fallback if needed
      if (preferredCameraDeviceId) {
        const isPreferredCameraAvailable = videoDevices.some(device => device.deviceId === preferredCameraDeviceId);
        
        if (!isPreferredCameraAvailable) {
          console.warn('📹 Preferred camera device not found:', preferredCameraDeviceId);
          console.log('📹 Available cameras:', videoDevices.map(d => ({ id: d.deviceId, label: d.label })));
          
          // Clear the invalid preference
          updateSetting('preferredCameraDeviceId', undefined);
          setSelectedCameraDeviceId(null);
          
          console.log('📹 Cleared invalid camera preference, will use auto-select');
        } else {
          console.log('📹 Preferred camera device is available:', preferredCameraDeviceId);
        }
      }
    } catch (error) {
      console.warn('Error enumerating devices', error);
    }
  }, [preferredCameraDeviceId, updateSetting]);

  // Modified useEffect to start camera automatically
  useEffect(() => {
    const initializeAppOnMount = async () => {
      // Initialize Google Analytics first
      initializeGA();
      
      await listCameras();
      // Initialize Sogni, but do not start camera here
      await initializeSogni();
    };
    
    initializeAppOnMount();
  }, [listCameras, initializeSogni]);

  // Sync selectedCameraDeviceId with settings
  useEffect(() => {
    if (preferredCameraDeviceId !== selectedCameraDeviceId) {
      console.log('📹 Syncing camera device ID from settings:', preferredCameraDeviceId);
      setSelectedCameraDeviceId(preferredCameraDeviceId || null);
    }
  }, [preferredCameraDeviceId, selectedCameraDeviceId]);

  // Helper function to determine the resolution category for an aspect ratio
  const getResolutionCategory = (aspectRatio) => {
    if (aspectRatio === 'square') {
      return 'square';
    } else if (['ultranarrow', 'narrow', 'portrait'].includes(aspectRatio)) {
      return 'portrait';
    } else {
      return 'landscape';
    }
  };

  // State to track iOS dimension quirks
  const [iosQuirkDetected, setIosQuirkDetected] = useState(false);
  const [actualCameraDimensions, setActualCameraDimensions] = useState(null);
  const [quirkDetectionComplete, setQuirkDetectionComplete] = useState(false);
  // Track previous category to avoid unnecessary restarts
  const [previousCategory, setPreviousCategory] = useState(null);

  // Helper function to detect and log iOS dimension swap quirks
  const detectIOSQuirk = (requestWidth, requestHeight, actualWidth, actualHeight, context = '') => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    
    if (!isIOS || !actualWidth || !actualHeight) {
      // Set detection complete for non-iOS devices
      if (!isIOS) {
        setQuirkDetectionComplete(true);
        setIosQuirkDetected(false);
        setActualCameraDimensions({ width: actualWidth || 1920, height: actualHeight || 1080 });
      }
      return false;
    }
    
    const requestedLandscape = requestWidth > requestHeight;
    const actualLandscape = actualWidth > actualHeight;
    const isSquareRequest = requestWidth === requestHeight;
    const isSquareActual = Math.abs(actualWidth - actualHeight) <= Math.max(actualWidth, actualHeight) * 0.1;
    
    // Skip detection for square requests/responses as they don't have orientation issues
    if (isSquareRequest || isSquareActual) {
      console.log(`✅ iOS square dimensions ${context}: ${actualWidth}x${actualHeight}`);
      setIosQuirkDetected(false);
      setActualCameraDimensions({ width: actualWidth, height: actualHeight });
      setQuirkDetectionComplete(true);
      return false;
    }
    
    if (requestedLandscape !== actualLandscape) {
      console.log(`🍎 iOS quirk detected ${context}: Requested ${requestedLandscape ? 'landscape' : 'portrait'} (${requestWidth}x${requestHeight}) but got ${actualLandscape ? 'landscape' : 'portrait'} (${actualWidth}x${actualHeight})`);
      console.log(`🔄 This is normal iOS behavior - device orientation overrides requested dimensions`);
      console.log(`📐 Updating display logic to use actual dimensions: ${actualWidth}x${actualHeight}`);
      setIosQuirkDetected(true);
      setActualCameraDimensions({ width: actualWidth, height: actualHeight });
      setQuirkDetectionComplete(true);
      return true;
    } else {
      console.log(`✅ iOS dimensions match request ${context}: ${requestedLandscape ? 'landscape' : 'portrait'} orientation (${actualWidth}x${actualHeight})`);
      setIosQuirkDetected(false);
      setActualCameraDimensions({ width: actualWidth, height: actualHeight });
      setQuirkDetectionComplete(true);
      return false;
    }
  };

  // Restart camera when aspect ratio category changes (portrait/square/landscape)
  useEffect(() => {
    // Only restart if camera has been manually started and we're not showing start menu
    if (cameraManuallyStarted && !showStartMenu && !showPhotoGrid && selectedPhotoIndex === null) {
      console.log(`📐 Aspect ratio changed to ${aspectRatio}, checking if camera restart needed`);
      
      // Get current category
      const currentCategory = getResolutionCategory(aspectRatio);
      
      // Only restart if the category actually changed
      if (previousCategory !== null && previousCategory === currentCategory) {
        console.log(`✅ Same resolution category (${currentCategory}), skipping camera restart`);
        setPreviousCategory(currentCategory); // Update the previous category
        return;
      }
      
      console.log(`🔄 Category changed from ${previousCategory || 'none'} to ${currentCategory}, restarting camera`);
      setPreviousCategory(currentCategory);
      
      // Restart camera to get optimal resolution for the new category
      if (videoReference.current && videoReference.current.srcObject) {
        console.log(`🔄 Restarting camera for ${currentCategory} category (${aspectRatio})`);
        
        // Detect mobile devices for special handling
        const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        
        if (isMobileDevice) {
          console.log(`📱 Mobile device detected (${isIOS ? 'iOS' : 'Android'}), using mobile-optimized restart`);
          
          // For mobile devices, add a small delay to ensure smooth transition
          setTimeout(() => {
            if (videoReference.current && videoReference.current.srcObject) {
              startCamera(selectedCameraDeviceId);
            }
          }, isIOS ? 200 : 100); // iOS needs slightly more time
        } else {
          // Desktop can restart immediately
          console.log(`💻 Desktop device detected, restarting camera immediately`);
          startCamera(selectedCameraDeviceId);
        }
      }
    }
  }, [aspectRatio, cameraManuallyStarted, showStartMenu, showPhotoGrid, selectedPhotoIndex, startCamera, selectedCameraDeviceId, previousCategory]);
  
  // Add an effect specifically for page unload/refresh cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Stop camera stream on page unload
      if (videoReference.current && videoReference.current.srcObject) {
        console.log('🛑 Stopping camera stream on page unload');
        const stream = videoReference.current.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => {
          console.log(`🛑 Stopping track: ${track.kind} (${track.label})`);
          track.stop();
        });
        videoReference.current.srcObject = null;
      }
      
      // Clean up blob URLs to prevent memory leaks
      photos.forEach(photo => {
        if (photo.images) {
          photo.images.forEach(imageUrl => {
            if (imageUrl && imageUrl.startsWith('blob:')) {
              URL.revokeObjectURL(imageUrl);
            }
          });
        }
      });
      
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
  }, [sogniClient, photos]);

  // If we return to camera, ensure the video is playing
  useEffect(() => {
    if (cameraManuallyStarted && selectedPhotoIndex === null && !showPhotoGrid && videoReference.current) {
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
  }, [selectedPhotoIndex, startCamera, selectedCameraDeviceId, cameraManuallyStarted, showPhotoGrid]);

  // Preload images for the selected photo
  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]) {
      for (const url of photos[selectedPhotoIndex].images) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [selectedPhotoIndex, photos]);

  // Create a ref to store the current photos array
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Ref to store the frame pre-generation function from PhotoGallery
  const preGenerateFrameRef = useRef(null);

  // Callback to receive the frame pre-generation function from PhotoGallery
  const handlePreGenerateFrameCallback = useCallback((preGenerateFunction) => {
    preGenerateFrameRef.current = preGenerateFunction;
  }, []);

  // Updated to use the utility function - using refs to avoid dependencies
  const handlePreviousPhoto = useCallback(async () => {
    const newIndex = goToPreviousPhoto(photosRef.current, selectedPhotoIndex);
    if (newIndex !== selectedPhotoIndex) {
      // Pre-generate frame for new photo if needed
      if (preGenerateFrameRef.current) {
        await preGenerateFrameRef.current(newIndex);
      }
      setSelectedPhotoIndex(newIndex);
      setSelectedSubIndex(0);
    }
  }, [selectedPhotoIndex]);

  // Updated to use the utility function - using refs to avoid dependencies  
  const handleNextPhoto = useCallback(async () => {
    const newIndex = goToNextPhoto(photosRef.current, selectedPhotoIndex);
    if (newIndex !== selectedPhotoIndex) {
      // Pre-generate frame for new photo if needed
      if (preGenerateFrameRef.current) {
        await preGenerateFrameRef.current(newIndex);
      }
      setSelectedPhotoIndex(newIndex);
      setSelectedSubIndex(0);
    }
  }, [selectedPhotoIndex]);

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
  }, [selectedPhotoIndex, showControlOverlay, handlePreviousPhoto, handleNextPhoto]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Smart timer for generation countdown - only runs when there are active countdowns
  // Use a ref to track the interval to avoid restarting on every photos change
  const countdownIntervalRef = useRef(null);
  
  useEffect(() => {
    const hasActiveCountdowns = photos.some(p => p.generating && p.generationCountdown > 0);
    
    // If we already have an interval running and still have countdowns, don't restart
    if (countdownIntervalRef.current && hasActiveCountdowns) {
      return;
    }
    
    // Clear existing interval if no countdowns or if we need to restart
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Only start new interval if we have active countdowns
    if (!hasActiveCountdowns) {
      return;
    }
    
    countdownIntervalRef.current = setInterval(() => {
      setPhotos((previousPhotos) => {
        const stillHasActiveCountdowns = previousPhotos.some(p => p.generating && p.generationCountdown > 0);
        
        if (!stillHasActiveCountdowns) {
          // Clear the interval when no more countdowns
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return previousPhotos; // Return unchanged
        }
        // Only update photos that actually have countdowns
        return previousPhotos.map((p) => {
          if (p.generating && p.generationCountdown > 0) {
            return { ...p, generationCountdown: p.generationCountdown - 1 };
          }
          return p;
        });
      });
    }, 1000);
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [photos.some(p => p.generating && p.generationCountdown > 0)]); // Only depend on whether countdowns exist, not the entire photos array

  // -------------------------
  //   Load image with download progress
  // -------------------------
  const loadImageWithProgress = (imageUrl, photoIndex, onComplete) => {
    
    // First, set loading status
    setPhotos(previous => {
      const updated = [...previous];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          loading: true,
          statusText: 'Loading artwork...'
        };
      }
      return updated;
    });

    // Use XMLHttpRequest to track download progress
    const xhr = new XMLHttpRequest();
    xhr.open('GET', imageUrl);
    xhr.responseType = 'blob';
    
    // Throttle download progress updates - use ref for scope access
    let downloadProgressTimeout = null;
    
    // Function to clear pending progress updates
    const clearPendingProgressUpdate = () => {
      if (downloadProgressTimeout) {
        clearTimeout(downloadProgressTimeout);
        downloadProgressTimeout = null;
      }
    };
    
    // Track download progress
    xhr.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const downloadProgress = (event.loaded / event.total) * 100;

        
        // For completion (100%), update immediately. Otherwise throttle.
        if (downloadProgress >= 100) {
          // Clear any pending throttled update
          clearPendingProgressUpdate();
          // Update immediately for completion
          setPhotos(previous => {
            const updated = [...previous];
            if (updated[photoIndex]) {
              updated[photoIndex] = {
                ...updated[photoIndex],
                loading: true,
                statusText: 'Loading artwork... 100%'
              };
            }
            return updated;
          });
        } else {
          // Throttle intermediate progress updates to reduce re-renders
          clearPendingProgressUpdate();
          
          downloadProgressTimeout = setTimeout(() => {
            setPhotos(previous => {
              const updated = [...previous];
              if (updated[photoIndex]) {
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  loading: true,
                  statusText: Math.round(downloadProgress) > 0 
                    ? `Loading artwork... ${Math.round(downloadProgress)}%` 
                    : 'Loading artwork...'
                };
              }
              return updated;
            });
          }, 300); // Slightly longer throttle for intermediate updates
        }
      }
    });
    
    // Handle download completion
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        // Create object URL from blob for optimal performance
        const blob = xhr.response;
        const objectUrl = URL.createObjectURL(blob);
        
        // Create image to verify it loads
        const img = new Image();
        img.addEventListener('load', () => {
          // Clear any pending throttled download progress updates
          clearPendingProgressUpdate();
          onComplete(objectUrl);
          // Don't immediately revoke blob URLs as they're needed for downloads
          // The blob URLs will be cleaned up when the page unloads or photos are replaced
        });
        
        img.addEventListener('error', () => {
          console.error(`Image load failed for photo ${photoIndex}`);
          // Fallback to original URL
          onComplete(imageUrl);
          URL.revokeObjectURL(objectUrl);
        });
        
        img.src = objectUrl;
      } else {
        console.error(`Download failed for photo ${photoIndex}: ${xhr.status}`);
        // Update status to show error and fallback to simple image loading
        setPhotos(previous => {
          const updated = [...previous];
          if (updated[photoIndex]) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              loading: false,
              statusText: 'Loading artwork...'
            };
          }
          return updated;
        });
        // Fallback to simple image loading
        onComplete(imageUrl);
      }
    });
    
    // Handle download errors
    xhr.addEventListener('error', () => {
      console.error(`Download error for photo ${photoIndex}`);
      // Update status to show error and fallback to simple image loading
      setPhotos(previous => {
        const updated = [...previous];
        if (updated[photoIndex]) {
          updated[photoIndex] = {
            ...updated[photoIndex],
            loading: false,
            statusText: 'Loading artwork...'
          };
        }
        return updated;
      });
      // Fallback to simple image loading
      onComplete(imageUrl);
    });
    
    xhr.send();
  };

  // -------------------------
  //   Timeout Management Helper Functions
  // -------------------------
  
  const clearAllTimeouts = () => {
    const timeouts = projectTimeoutRef.current;
    
    // Clear overall project timeout
    if (timeouts.overallTimer) {
      clearTimeout(timeouts.overallTimer);
      timeouts.overallTimer = null;
    }
    
    // Clear watchdog timeout
    if (timeouts.watchdogTimer) {
      clearTimeout(timeouts.watchdogTimer);
      timeouts.watchdogTimer = null;
    }
    
    // Clear all job-specific timeouts
    timeouts.jobTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    timeouts.jobTimers.clear();
    
    // Reset timing data
    timeouts.projectStartTime = null;
    timeouts.lastProgressTime = null;
  };

  const startProjectTimeouts = () => {
    const timeouts = projectTimeoutRef.current;
    const now = Date.now();
    
    timeouts.projectStartTime = now;
    timeouts.lastProgressTime = now;

    // Overall project timeout (5 minutes)
    timeouts.overallTimer = setTimeout(() => {
      console.error('Overall project timeout reached - canceling all jobs');
      handleProjectTimeout('Overall project timeout reached');
    }, TIMEOUT_CONFIG.OVERALL_PROJECT_TIMEOUT);

    // Project watchdog timeout (2 minutes of no progress)
    timeouts.watchdogTimer = setTimeout(() => {
      console.error('Project watchdog timeout - no progress detected');
      handleProjectTimeout('No progress detected for extended period');
    }, TIMEOUT_CONFIG.PROJECT_WATCHDOG_TIMEOUT);
  };

  const updateWatchdogTimer = () => {
    const timeouts = projectTimeoutRef.current;
    
    // Clear existing watchdog timer
    if (timeouts.watchdogTimer) {
      clearTimeout(timeouts.watchdogTimer);
    }
    
    // Update last progress time
    timeouts.lastProgressTime = Date.now();
    
    // Start new watchdog timer
    timeouts.watchdogTimer = setTimeout(() => {
      console.error('Project watchdog timeout - no progress detected');
      handleProjectTimeout('No progress detected for extended period');
    }, TIMEOUT_CONFIG.PROJECT_WATCHDOG_TIMEOUT);
  };

  const startJobTimeout = (jobId, photoIndex) => {
    const timeouts = projectTimeoutRef.current;
    
    // Clear existing timer for this job if any
    if (timeouts.jobTimers.has(jobId)) {
      clearTimeout(timeouts.jobTimers.get(jobId));
    }
    
    // Start new timer for this job
    const timer = setTimeout(() => {
      console.error(`Job timeout for jobId: ${jobId}, photoIndex: ${photoIndex}`);
      handleJobTimeout(jobId, photoIndex);
    }, TIMEOUT_CONFIG.PER_JOB_TIMEOUT);
    
    timeouts.jobTimers.set(jobId, timer);
    
    // Update photo with job start time
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          jobStartTime: Date.now(),
          lastProgressTime: Date.now()
        };
      }
      return updated;
    });
  };

  const clearJobTimeout = (jobId) => {
    const timeouts = projectTimeoutRef.current;
    
    if (timeouts.jobTimers.has(jobId)) {
      clearTimeout(timeouts.jobTimers.get(jobId));
      timeouts.jobTimers.delete(jobId);
    }
  };

  const handleJobTimeout = (jobId, photoIndex) => {
    console.error(`Job ${jobId} at photo index ${photoIndex} timed out`);
    
    // Clear the specific job timeout
    clearJobTimeout(jobId);
    
    // Mark the photo as timed out
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          generating: false,
          loading: false,
          error: 'GENERATION TIMEOUT: Job took too long',
          permanentError: true,
          statusText: 'Timed Out',
          timedOut: true
        };
      }
      return updated;
    });
    
    // Check if all jobs are done (completed, failed, or timed out)
    setTimeout(() => {
      setPhotos(prev => {
        const stillGenerating = prev.some(photo => photo.generating);
        if (!stillGenerating && activeProjectReference.current) {
          console.log('All jobs finished (including timeouts), clearing active project');
          activeProjectReference.current = null;
          clearAllTimeouts();
        }
        return prev;
      });
    }, 100);
  };

  const handleProjectTimeout = (reason) => {
    console.error(`Project timeout: ${reason}`);
    
    // Clear all timeouts
    clearAllTimeouts();
    
    // Mark all generating photos as timed out
    setPhotos(prev => {
      const updated = [...prev];
      let hasChanges = false;
      
      updated.forEach((photo, index) => {
        if (photo.generating) {
          updated[index] = {
            ...photo,
            generating: false,
            loading: false,
            error: `PROJECT TIMEOUT: ${reason}`,
            permanentError: true,
            statusText: 'Timed Out',
            timedOut: true
          };
          hasChanges = true;
        }
      });
      
      if (hasChanges && activeProjectReference.current) {
        // Try to cancel the project on the backend
        if (sogniClient && activeProjectReference.current) {
          sogniClient.cancelProject?.(activeProjectReference.current)
            .catch(err => console.warn('Failed to cancel project on backend:', err));
        }
        
        activeProjectReference.current = null;
      }
      
      return updated;
    });
  };

  // -------------------------
  //   Shared logic for generating images from a Blob
  // -------------------------
  const generateFromBlob = async (photoBlob, newPhotoIndex, dataUrl, isMoreOperation = false, sourceType = 'upload') => {
    try {
      // Clear any existing timeouts before starting new generation
      if (!isMoreOperation) {
        clearAllTimeouts();
      }
      
      setLastPhotoData({ blob: photoBlob, dataUrl, sourceType });
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      // Get theme-filtered prompts for random selection
      const getFilteredPromptsForRandom = () => {
        // For Flux models, use all available prompts without theme filtering
        const isFluxKontext = isFluxKontextModel(selectedModel);
        return isFluxKontext ? stylePrompts : getEnabledPrompts(currentThemeState, stylePrompts);
      };

      // Prompt logic: use context state
      let finalPositivePrompt = positivePrompt.trim();
      
      // Handle special style modes (these override any existing prompt text)
      if (selectedStyle === 'custom') {
        finalPositivePrompt = finalPositivePrompt || '';
      } else if (selectedStyle === 'random') {
        // Pick one random style and use it for all images in the batch
        const filteredPrompts = getFilteredPromptsForRandom();
        const randomStyle = getRandomStyle(filteredPrompts);
        finalPositivePrompt = filteredPrompts[randomStyle] || '';
      } else if (selectedStyle === 'randomMix') {
        // Use different random prompts for each image - creates {prompt1|prompt2|...} syntax
        const filteredPrompts = getFilteredPromptsForRandom();
        finalPositivePrompt = getRandomMixPrompts(numImages, filteredPrompts); 
      } else if (selectedStyle === 'oneOfEach') {
        // Use one prompt from each enabled theme group in order
        finalPositivePrompt = getOneOfEachPrompts(currentThemeState, stylePrompts, numImages);
      } else {
        // Use the selected style prompt, or fallback to user's custom text
        finalPositivePrompt = stylePrompts[selectedStyle] || finalPositivePrompt || '';
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
          // Clean up blob URLs from previous photos to prevent memory leaks
          previous.forEach(photo => {
            if (photo.images) {
              photo.images.forEach(imageUrl => {
                if (imageUrl && imageUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(imageUrl);
                }
              });
            }
          });
          
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
              // Calculate the global photo index for frame assignment
              const globalPhotoIndex = (keepOriginalPhoto ? 1 : 0) + index;
              
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
                sourceType, // Include sourceType in generated photos
                // Assign Taipei frame number based on photo index for equal distribution (1-6)
                taipeiFrameNumber: (globalPhotoIndex % 6) + 1,
                framePadding: 0 // Will be updated by migration effect in PhotoGallery
              });
            }
          }
          return newPhotos;
        });
      }

      if (!isMoreOperation) {
        // Stop camera when showing photo grid
        stopCamera();
        setShowPhotoGrid(true);
        setShowStartMenu(false);
      }

      let processedBlob = photoBlob;
      if (isIOS) {
        // ... (blob processing remains the same)
      }
      
      const blobArrayBuffer = await processedBlob.arrayBuffer();
      
      // Show upload progress
      setShowUploadProgress(true);
      setUploadProgress(0);
      setUploadStatusText('Uploading your image...');
      
      // Create project using context state for settings
      const isFluxKontext = isFluxKontextModel(selectedModel);
      const projectConfig = { 
        testnet: false,
        tokenType: 'spark',
        modelId: selectedModel,
        positivePrompt: finalPositivePrompt,
        negativePrompt: finalNegativePrompt,
        stylePrompt: finalStylePrompt,
        sizePreset: 'custom',
        width: getCustomDimensions(aspectRatio).width,  // Use aspectRatio here
        height: getCustomDimensions(aspectRatio).height, // Use aspectRatio here
        steps: inferenceSteps,
        guidance: isFluxKontext ? guidance : promptGuidance, // Use guidance for Flux.1 Kontext, promptGuidance for others
        numberOfImages: numImages, // Use context state
        scheduler: scheduler,
        timeStepSpacing: timeStepSpacing,
        outputFormat: outputFormat, // Add output format setting
        sensitiveContentFilter: sensitiveContentFilter, // Add sensitive content filter setting
        sourceType: sourceType, // Add sourceType for analytics tracking
        ...(seedParam !== undefined ? { seed: seedParam } : {})
      };
      
      // Add image configuration based on model type
      if (isFluxKontext) {
        // For Flux.1 Kontext, use contextImages array (SDK expects array)
        projectConfig.contextImages = [new Uint8Array(blobArrayBuffer)];
      } else {
        // For other models, use controlNet
        projectConfig.controlNet = {
          name: 'instantid',
          image: new Uint8Array(blobArrayBuffer),
          strength: controlNetStrength,
          mode: 'balanced',
          guidanceStart: 0,
          guidanceEnd: controlNetGuidanceEnd,
        };
      }
      
      const project = await sogniClient.projects.create(projectConfig);

      activeProjectReference.current = project.id;
      console.log('Project created:', project.id, 'with jobs:', project.jobs);
      console.log('Initializing job map for project', project.id);
      
      // Start project timeout management
      clearAllTimeouts(); // Clear any existing timeouts
      startProjectTimeouts();
      
      // Track image generation event
      trackEvent('Generation', 'start', selectedStyle, numImages);

      // Set up upload progress listeners with throttling to reduce flickering
      let uploadProgressTimeout = null;
      project.on('uploadProgress', (progress) => {
        // Throttle upload progress updates to reduce flickering on high-res displays
        if (uploadProgressTimeout) {
          clearTimeout(uploadProgressTimeout);
        }
        
        uploadProgressTimeout = setTimeout(() => {
          setUploadProgress(progress);
          if (progress < 100) {
            setUploadStatusText(`Uploading your image... ${Math.round(progress)}%`);
          } else {
            setUploadStatusText('Processing on server...');
          }
        }, 100); // Throttle to max 10 updates per second
      });

      project.on('uploadComplete', () => {
        setShowUploadProgress(false);
        setUploadProgress(0);
      });

      // Set up handlers for any jobs that exist immediately

      
      if (project.jobs && project.jobs.length > 0) {
        project.jobs.forEach((job, index) => {
          projectStateReference.current.jobMap.set(job.id, index);

        });
      }
      


      // Attach a single project-level job event handler with throttling
      let progressUpdateTimeout = null;
      let nonProgressUpdateTimeout = null;
      
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

        // Throttle progress updates to reduce excessive re-renders
        if (type === 'progress') {
          // Update watchdog timer for progress events (but throttled)
          if (progressUpdateTimeout) {
            clearTimeout(progressUpdateTimeout);
          }
          progressUpdateTimeout = setTimeout(() => {
            // Update watchdog timer along with progress to batch the operations
            updateWatchdogTimer();
            setPhotos(prev => {
              const updated = [...prev];
              if (updated[photoIndex] && !updated[photoIndex].permanentError) {
                // Use workerName from current event if available and not "unknown", otherwise fall back to cached value
                const cachedWorkerName = updated[photoIndex].workerName || 'unknown';
                const currentWorkerName = (workerName && workerName !== 'unknown') ? workerName : cachedWorkerName;
                const displayProgress = Math.round((progress ?? 0) * 100);
                
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  generating: true,
                  loading: true,
                  progress: displayProgress,
                  statusText: displayProgress > 0 
                    ? `${currentWorkerName} makin' art... ${displayProgress}%`
                    : `${currentWorkerName} makin' art...`,
                  workerName: currentWorkerName, // Update the cached worker name
                  jobId,
                  lastProgressTime: Date.now()
                };
              }
              return updated;
            });
          }, 200); // Throttle to max 5 updates per second (reduced from 10 to minimize flickering on high-res displays)
          return; // Don't process immediately
        }

        // Update project watchdog timer for non-progress events
        if (['initiating', 'started'].includes(type)) {
          updateWatchdogTimer();
        }

        // Throttle non-progress events to reduce cascade renders
        if (['queued', 'initiating', 'started'].includes(type)) {
          if (nonProgressUpdateTimeout) {
            clearTimeout(nonProgressUpdateTimeout);
          }
          nonProgressUpdateTimeout = setTimeout(() => {
            setPhotos(prev => {
              const updated = [...prev];
              if (photoIndex >= updated.length) return prev;
              // Process the event type
              if (type === 'initiating' || type === 'started') {
                // Try to find a hashtag for the style prompt
                let hashtag = '';
                const stylePromptValue = updated[photoIndex].stylePrompt;
                if (stylePromptValue) {
                  const foundKey = Object.entries(stylePrompts).find(([, value]) => value === stylePromptValue)?.[0];
                  if (foundKey) {
                    hashtag = `#${foundKey}`;
                  }
                }
                
                updated[photoIndex] = {
                  ...updated[photoIndex],
                  generating: true,
                  loading: true,
                  statusText: workerName ? `${workerName} starting...` : 'Art Robot starting...',
                  workerName: workerName || 'unknown',
                  jobId,
                  jobIndex,
                  positivePrompt,
                  stylePrompt: stylePromptValue?.trim() || '',
                  hashtag
                };
              } else if (type === 'queued') {
                const currentStatusText = updated[photoIndex].statusText || 'Calling Art Robot...';
                // Only update with queue position if it's greater than 1
                // Queue position 1 means it's next/being processed, so keep the worker assignment label
                if ((currentStatusText.includes('Calling Art Robot') || currentStatusText.includes('In queue')) && queuePosition > 1) {
                  updated[photoIndex] = {
                    ...updated[photoIndex],
                    generating: true,
                    loading: true,
                    statusText: `Queue position ${queuePosition}`,
                    jobId,
                  };
                }
              }
              return updated;
            });
          }, 50); // Very short throttle for non-progress events
          return; // Don't process immediately
        }

        // Handle job timeout for started events
        if (type === 'started') {
          startJobTimeout(jobId, photoIndex);
        }

        // All other events are now handled by throttling above
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
        
        // Check if there are any outstanding jobs still generating (check both photos state and project jobs)
        const outstandingPhotoJobs = photos.filter(photo => 
          photo.generating && 
          photo.projectId === project.id
        );
        
        // Also check if there are any jobs in the project that haven't completed yet
        const outstandingProjectJobs = project.jobs ? project.jobs.filter(job => !job.resultUrl && !job.error) : [];
        
        const totalOutstanding = Math.max(outstandingPhotoJobs.length, outstandingProjectJobs.length);
        
        if (totalOutstanding > 0) {
          console.log(`Project completion received but ${totalOutstanding} jobs still outstanding (${outstandingPhotoJobs.length} in photos state, ${outstandingProjectJobs.length} in project state). Waiting 3 seconds for final job events...`);
          console.log('Outstanding photo jobs:', outstandingPhotoJobs.map(p => ({ id: p.id, progress: p.progress })));
          console.log('Outstanding project jobs:', outstandingProjectJobs.map(j => ({ id: j.id, realJobId: j.realJobId, hasResult: !!j.resultUrl, hasError: !!j.error })));
          
          // Debug: Log all project jobs to see their state
          console.log('ALL project jobs state:', project.jobs ? project.jobs.map(j => ({
            id: j.id,
            realJobId: j.realJobId,
            hasResultUrl: !!j.resultUrl,
            hasError: !!j.error,
            resultUrl: j.resultUrl ? `${j.resultUrl.substring(0, 50)}...` : 'none'
          })) : 'no jobs');
          
          // Wait a short time for any final job completion events to arrive
          setTimeout(() => {
            const stillOutstandingPhotos = photos.filter(photo => 
              photo.generating && 
              photo.projectId === project.id
            );
            
            const stillOutstandingProjects = project.jobs ? project.jobs.filter(job => !job.resultUrl && !job.error) : [];
            const stillTotalOutstanding = Math.max(stillOutstandingPhotos.length, stillOutstandingProjects.length);
            
            if (stillTotalOutstanding > 0) {
              console.log(`After 3 second delay, ${stillTotalOutstanding} jobs still outstanding (${stillOutstandingPhotos.length} photos, ${stillOutstandingProjects.length} project jobs). Trying longer delay...`);
              console.log('Still outstanding photo jobs:', stillOutstandingPhotos.map(p => ({ id: p.id, progress: p.progress })));
              console.log('Still outstanding project jobs:', stillOutstandingProjects.map(j => ({ id: j.id, realJobId: j.realJobId, hasResult: !!j.resultUrl, hasError: !!j.error })));
              
              // Debug: Log all project jobs after delay to see their state
              console.log('ALL project jobs state after delay:', project.jobs ? project.jobs.map(j => ({
                id: j.id,
                realJobId: j.realJobId,
                hasResultUrl: !!j.resultUrl,
                hasError: !!j.error,
                resultUrl: j.resultUrl ? `${j.resultUrl.substring(0, 50)}...` : 'none'
              })) : 'no jobs');
              
              // Try waiting longer for very delayed job completion events
              setTimeout(() => {
                const finalOutstandingProjects = project.jobs ? project.jobs.filter(job => !job.resultUrl && !job.error) : [];
                
                if (finalOutstandingProjects.length > 0) {
                  console.log(`After 10 second total delay, ${finalOutstandingProjects.length} jobs still outstanding. Proceeding with project completion anyway.`);
                  console.log('Final outstanding project jobs:', finalOutstandingProjects.map(j => ({ 
                    id: j.id, 
                    realJobId: j.realJobId, 
                    hasResult: !!j.resultUrl, 
                    hasError: !!j.error 
                  })));
                } else {
                  console.log('All jobs finally completed after extended delay.');
                }
                
                // Proceed with completion regardless
                clearAllTimeouts();
                activeProjectReference.current = null;
                trackEvent('Generation', 'complete', selectedStyle);
                triggerBatchCelebration();
              }, 7000); // Additional 7 second delay (10 total)
            } else {
              console.log('All jobs completed after delay, proceeding with project completion.');
              clearAllTimeouts();
              activeProjectReference.current = null;
              trackEvent('Generation', 'complete', selectedStyle);
              triggerBatchCelebration();
            }
          }, 3000); // Initial 3 second delay
        } else {
          console.log('All jobs completed, proceeding immediately with project completion');
          
          // Clear all timeouts when project completes
          clearAllTimeouts();
          
          activeProjectReference.current = null; // Clear active project reference when complete
          
          // Track successful generation completion
          trackEvent('Generation', 'complete', selectedStyle);
          
          // Trigger celebration for successful batch completion
          triggerBatchCelebration();
        }
      });

      project.on('failed', (error) => {
        console.error('Project failed:', error);
        
        // Clear all timeouts when project fails
        clearAllTimeouts();
        
        // Get the failed project's ID from the project or error object
        const failedProjectId = project.id;
        // Check if error has a projectId property that might override the project.id
        const errorProjectId = error && typeof error === 'object' && 'projectId' in error ? 
          error.projectId : null;
        
        // Use error's projectId if available, otherwise fallback to project.id
        const effectiveProjectId = errorProjectId || failedProjectId;
        
        // Only clear active project reference if it matches the failed project
        if (activeProjectReference.current && activeProjectReference.current.id === effectiveProjectId) {
          console.log(`Project failed with ID ${effectiveProjectId}`);
          console.log(`Clearing active project reference for failed project ${effectiveProjectId}`);
          activeProjectReference.current = null;
        } else {
          // This is an old project timing out, suppress the noisy error messages
          console.log(`Old project ${effectiveProjectId} cleanup (not active project)`);
          // Early return to avoid updating photos or showing error messages for old projects
          return;
        }
        
        // Update the state for photos that belong to this failed project only
        setPhotos(prevPhotos => {
          return prevPhotos.map(photo => {
            // Only mark photos as failed if they belong to this specific project
            // and are still in generating state
            if (photo.generating && photo.projectId === effectiveProjectId) {
              console.log(`Marking photo ${photo.id} as failed due to project ${effectiveProjectId} failure`);
              // Extract specific error information for better user feedback
              let errorMessage = 'GENERATION FAILED: unknown error';
              
              if (error && typeof error === 'object') {
                if (error.isInsufficientFunds || error.errorCode === 'insufficient_funds') {
                  errorMessage = 'GENERATION FAILED: replenish tokens';
                } else if (error.isAuthError || error.errorCode === 'auth_error') {
                  errorMessage = 'GENERATION FAILED: authentication failed';
                } else if (error.isOffline || error.name === 'NetworkError' || 
                          (error.message && (error.message.includes('network') || 
                           error.message.includes('connection') || 
                           error.message.includes('internet') || 
                           error.message.includes('CORS') ||
                           error.message.includes('Failed to fetch')))) {
                  errorMessage = 'GENERATION FAILED: check internet connection';
                } else if (error.message) {
                  // Extract key info from error message
                  if (error.message.includes('Insufficient') || error.message.includes('credits')) {
                    errorMessage = 'GENERATION FAILED: replenish tokens';
                  } else if (error.message.includes('auth') || error.message.includes('token')) {
                    errorMessage = 'GENERATION FAILED: authentication failed';
                  } else {
                    errorMessage = 'GENERATION FAILED: request failed';
                  }
                }
              } else if (typeof error === 'string') {
                if (error.includes('Insufficient') || error.includes('credits')) {
                  errorMessage = 'GENERATION FAILED: replenish tokens';
                } else if (error.includes('auth') || error.includes('token')) {
                  errorMessage = 'GENERATION FAILED: authentication failed';
                } else if (error.includes('network') || error.includes('connection') || 
                          error.includes('internet') || error.includes('CORS') ||
                          error.includes('Failed to fetch')) {
                  errorMessage = 'GENERATION FAILED: check internet connection';
                } else {
                  errorMessage = 'GENERATION FAILED: request failed';
                }
              }
              
              return {
                ...photo,
                generating: false,
                loading: false,
                error: errorMessage,
                permanentError: true, // Mark as permanent error
                statusText: 'Failed' // Update status text
              };
            }
            return photo;
          });
        });
      });

      // Listen to project updates to get job progress and preview images
      


      // Handle job completion for cleanup and final processing
      project.on('jobCompleted', (job) => {
        const isPreview = job.isPreview === true;
        
        // Clear job timeout when it completes (only for final, not previews)
        if (!isPreview) {
          clearJobTimeout(job.id);
        }
        
        if (!job.resultUrl) {
          console.error('Missing resultUrl for job:', job.id);
          return;
        }
        
        const jobIndex = projectStateReference.current.jobMap.get(job.id);
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        const positivePrompt = job.positivePrompt;
        
        // Handle preview vs final image loading
        if (isPreview) {
          console.log(`[PREVIEW DEBUG] Processing preview for photo ${photoIndex}:`, {
            jobId: job.id,
            resultUrl: job.resultUrl,
            previewUrl: job.previewUrl,
            isPreview,
            jobKeys: Object.keys(job)
          });
          
          // PREVIEW IMAGE - load immediately without affecting status text
          fetch(job.resultUrl)
            .then(response => {
              console.log(`[PREVIEW DEBUG] Fetch response for photo ${photoIndex}:`, {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                url: response.url
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              return response.blob();
            })
            .then(blob => {
              console.log(`[PREVIEW DEBUG] Blob created for photo ${photoIndex}:`, {
                size: blob.size,
                type: blob.type
              });
              
              const objectUrl = URL.createObjectURL(blob);
              
              setPhotos(previous => {
                const updated = [...previous];
                if (updated[photoIndex] && !updated[photoIndex].permanentError) {
                  // Clean up previous preview image URL to prevent memory leaks with frequent previews
                  const currentImages = updated[photoIndex].images;
                  if (currentImages && currentImages.length > 0 && updated[photoIndex].isPreview) {
                    currentImages.forEach(imageUrl => {
                      if (imageUrl && imageUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(imageUrl);
                      }
                    });
                  }
                  
                  const newPreviewCount = (updated[photoIndex].previewUpdateCount || 0) + 1;
                  
                  updated[photoIndex] = {
                    ...updated[photoIndex],
                    images: [objectUrl], // Show preview
                    newlyArrived: true,
                    isPreview: true, // Mark as preview for styling
                    previewUpdateCount: newPreviewCount // Track preview updates
                    // Keep existing generating: true and progress from generation events
                    // Don't override loading or statusText
                  };
                  

                }
                return updated;
              });
            })
            .catch(() => {
              // Don't update the photo state on preview load failure
            });
          
          return; // Don't process hashtags for previews
        }
        
        // FINAL IMAGE - handle hashtags and completion
        // Handle hashtag generation for final jobs
        let hashtag = '';
        
        // Debug logging to understand what we're working with
        console.log('📸 Hashtag debug:', { 
          positivePrompt, 
          stylePrompt: stylePrompt?.trim(), 
          selectedStyle,
          jobIndex
        });
        
        // Strategy 1: Try to match positivePrompt from job
        if (positivePrompt && !hashtag) {
          // First check current stylePrompts (which includes Flux prompts when appropriate)
          const foundKey = Object.entries(stylePrompts).find(([, value]) => value === positivePrompt)?.[0];
          if (foundKey && foundKey !== 'custom' && foundKey !== 'random' && foundKey !== 'randomMix') {
            hashtag = `#${foundKey}`;
            console.log('📸 Found hashtag for completed job via positivePrompt:', { positivePrompt, hashtag, foundKey });
          }
          
          // Fallback to promptsData for backward compatibility
          if (!hashtag) {
            const fallbackKey = Object.entries(promptsData).find(([, value]) => value === positivePrompt)?.[0];
            if (fallbackKey && fallbackKey !== 'custom' && fallbackKey !== 'random' && fallbackKey !== 'randomMix') {
              hashtag = `#${fallbackKey}`;
              console.log('📸 Found hashtag from promptsData fallback via positivePrompt:', { positivePrompt, hashtag, fallbackKey });
            }
          }
        }
        
        // Strategy 2: If we have a valid stylePrompt, use that to help with hashtag lookup
        if (!hashtag && stylePrompt && stylePrompt.trim()) {
          const trimmedStylePrompt = stylePrompt.trim();
          // First check current stylePrompts
          const styleKey = Object.entries(stylePrompts).find(([, value]) => value === trimmedStylePrompt)?.[0];
          if (styleKey && styleKey !== 'custom' && styleKey !== 'random' && styleKey !== 'randomMix') {
            console.log('📸 Found hashtag from stylePrompt:', styleKey);
            hashtag = `#${styleKey}`;
          }
          
          // Fallback to promptsData
          if (!hashtag) {
            const fallbackStyleKey = Object.entries(promptsData).find(([, value]) => value === trimmedStylePrompt)?.[0];
            if (fallbackStyleKey && fallbackStyleKey !== 'custom' && fallbackStyleKey !== 'random' && fallbackStyleKey !== 'randomMix') {
              console.log('📸 Found hashtag from stylePrompt fallback:', fallbackStyleKey);
              hashtag = `#${fallbackStyleKey}`;
            }
          }
        }
        
        // Strategy 3: Fall back to selectedStyle if it's a valid style
        if (!hashtag && selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' && selectedStyle !== 'oneOfEach') {
          console.log('📸 Using selectedStyle for hashtag:', selectedStyle);
          hashtag = `#${selectedStyle}`;
        }
        
        // Strategy 4: Final fallback - try to find ANY matching prompt in our style library
        if (!hashtag && positivePrompt) {
          // Check if the positive prompt contains any known style keywords
          const allStyleKeys = [...Object.keys(stylePrompts), ...Object.keys(promptsData)];
          const matchingKey = allStyleKeys.find(key => {
            const promptValue = stylePrompts[key] || promptsData[key];
            return promptValue && (
              promptValue === positivePrompt ||
              positivePrompt.includes(promptValue) ||
              promptValue.includes(positivePrompt)
            );
          });
          
          if (matchingKey && matchingKey !== 'custom' && matchingKey !== 'random' && matchingKey !== 'randomMix') {
            hashtag = `#${matchingKey}`;
            console.log('📸 Found hashtag via fuzzy matching:', { matchingKey, hashtag });
          }
        }
        
        // Load final image and update with completion status
        loadImageWithProgress(job.resultUrl, photoIndex, (loadedImageUrl) => {
          setPhotos(previous => {
            const updated = [...previous];
            if (updated[photoIndex] && !updated[photoIndex].permanentError) {
              const photoId = updated[photoIndex].id;
              
              // Play camera wind sound for this final image if we haven't already
              if (soundEnabled && !soundPlayedForPhotos.current.has(photoId) && cameraWindSoundReference.current) {
                soundPlayedForPhotos.current.add(photoId);
                
                // Reset to beginning to ensure sound plays every time
                cameraWindSoundReference.current.currentTime = 0;
                
                try {
                  cameraWindSoundReference.current.play();
                } catch (error) {
                  console.warn("Initial camera wind play attempt failed, trying promise-based approach:", error);
                  cameraWindSoundReference.current.play().catch(error => {
                    console.warn("Error playing camera wind sound:", error);
                  });
                }
              }
              
              updated[photoIndex] = {
                ...updated[photoIndex],
                images: [loadedImageUrl], // Replace preview with final image
                loading: false,
                generating: false, // Mark as complete
                progress: 100,
                newlyArrived: true,
                isPreview: false, // Clear preview flag so final image shows at full opacity
                positivePrompt,
                stylePrompt: stylePrompt.trim(),
                statusText: hashtag || (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' ? `#${selectedStyle}` : `#${(jobIndex || 0) + 1}`)
              };
            }
            return updated;
          });
        });
        
        // Check if all photos are done generating  
        setTimeout(() => {
          setPhotos(current => {
            const stillGenerating = current.some(photo => photo.generating);
            if (!stillGenerating && activeProjectReference.current) {
              // All jobs are done, clear the active project and timeouts
              console.log('All jobs completed, clearing active project');
              clearAllTimeouts();
              activeProjectReference.current = null;
              
              // Trigger promotional popup after batch completion
              triggerPromoPopupIfNeeded();
            }
            return current;
          });
        }, 100);
      });

      project.on('jobFailed', (job) => {
        // Clear job timeout when it fails
        clearJobTimeout(job.id);
        
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
          
          // Extract specific error information for individual job failures
          let errorMessage = 'GENERATION FAILED: unknown error';
          
          if (job.error) {
            if (typeof job.error === 'object') {
              // Handle error object case
              if (job.error.isInsufficientFunds || job.error.errorCode === 'insufficient_funds') {
                errorMessage = 'GENERATION FAILED: replenish tokens';
              } else if (job.error.isAuthError || job.error.errorCode === 'auth_error') {
                errorMessage = 'GENERATION FAILED: authentication failed';
              } else if (job.error.message) {
                // Extract key info from error message
                if (job.error.message.includes('Insufficient') || job.error.message.includes('credits') || job.error.message.includes('funds')) {
                  errorMessage = 'GENERATION FAILED: replenish tokens';
                } else if (job.error.message.includes('NSFW') || job.error.message.includes('filtered')) {
                  errorMessage = 'GENERATION FAILED: content filtered';
                } else if (job.error.message.includes('timeout') || job.error.message.includes('worker')) {
                  errorMessage = 'GENERATION FAILED: processing timeout';
                } else if (job.error.message.includes('network') || job.error.message.includes('connection')) {
                  errorMessage = 'GENERATION FAILED: connection error';
                } else {
                  errorMessage = 'GENERATION FAILED: processing error';
                }
              } else {
                errorMessage = 'GENERATION FAILED: processing error';
              }
            } else if (typeof job.error === 'string') {
              // Handle string error case
              if (job.error.includes('Insufficient') || job.error.includes('credits') || job.error.includes('funds')) {
                errorMessage = 'GENERATION FAILED: replenish tokens';
              } else if (job.error.includes('NSFW') || job.error.includes('filtered')) {
                errorMessage = 'GENERATION FAILED: content filtered';
              } else if (job.error.includes('timeout') || job.error.includes('worker')) {
                errorMessage = 'GENERATION FAILED: processing timeout';
              } else if (job.error.includes('network') || job.error.includes('connection')) {
                errorMessage = 'GENERATION FAILED: connection error';
              } else {
                errorMessage = 'GENERATION FAILED: processing error';
              }
            }
          }
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            error: errorMessage,
            permanentError: true, // Mark as permanent so it won't be overwritten
            statusText: 'Failed'
          };
          
          // Check if all photos are done generating
          const stillGenerating = updated.some(photo => photo.generating);
          if (!stillGenerating && activeProjectReference.current) {
            // All photos are done, clear the active project and timeouts
            console.log('All jobs failed or completed, clearing active project');
            clearAllTimeouts();
            activeProjectReference.current = null;
            
            // Trigger promotional popup after batch completion
            triggerPromoPopupIfNeeded();
          }
          
          return updated;
        });
      });

    } catch (error) {
      console.error('Generation failed:', error);
      
      // Hide upload progress on error
      setShowUploadProgress(false);
      setUploadProgress(0);
      
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
          // Extract specific error information for generation startup failures
          let errorMessage = 'GENERATION FAILED: startup error';
          let retryable = false;
          
          if (isNetworkError(error)) {
            // Handle NetworkError instances with better user messaging
            if (error.isOffline) {
              errorMessage = 'NETWORK OFFLINE: Check connection';
              retryable = true;
            } else if (error.isTimeout) {
              errorMessage = 'CONNECTION TIMEOUT: Try again';
              retryable = true;
            } else if (error.retryable) {
              errorMessage = 'NETWORK ERROR: Retry available';
              retryable = true;
            } else {
              errorMessage = 'NETWORK ERROR: Connection failed';
              retryable = false;
            }
          } else if (error) {
            const errorText = error.message || error.toString();
            if (errorText.includes('Insufficient') || errorText.includes('credits') || errorText.includes('funds')) {
              errorMessage = 'GENERATION FAILED: replenish tokens';
            } else if (errorText.includes('auth') || errorText.includes('token') || errorText.includes('401')) {
              errorMessage = 'GENERATION FAILED: authentication failed';
            } else if (errorText.includes('network') || errorText.includes('connection') || errorText.includes('fetch')) {
              errorMessage = 'GENERATION FAILED: connection error';
              retryable = true;
            } else if (errorText.includes('timeout')) {
              errorMessage = 'GENERATION FAILED: timeout error';
              retryable = true;
            } else {
              errorMessage = 'GENERATION FAILED: startup error';
            }
          }
          
          updated.push({
            id: Date.now() + index,
            generating: false,
            loading: false,
            images: [],
            error: errorMessage,
            originalDataUrl: dataUrl, // Use reference photo as placeholder
            permanentError: !retryable, // Allow retry for network errors
            retryable: retryable, // Add retryable flag
            sourceType // Include sourceType for retry context
          });
        }
        return updated;
      });
      
      // Stop camera when showing photo grid
      stopCamera();
      setShowPhotoGrid(true);
      setShowStartMenu(false);
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

    // Create a temporary URL for the file
    const tempUrl = URL.createObjectURL(file);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('upload');
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  // -------------------------
  //   Capture (webcam)
  // -------------------------
  const handleTakePhoto = async (e) => {
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
    
    // Check if we should skip countdown (back camera on mobile)
    const isMobileDevice = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const shouldSkipCountdown = isMobileDevice && !isFrontCamera;
    
    if (shouldSkipCountdown) {
      console.log('Skipping countdown for back camera on mobile device');
    } else {
      // Start countdown without slothicorn initially
      for (let index = 3; index > 0; index--) {
        setCountdown(index);
        
        // Show slothicorn when countdown reaches 2, but only for front-facing camera
        if (index === 2 && slothicornReference.current && isFrontCamera) {
          // Force the slothicorn to be visible and animated
          slothicornReference.current.style.position = 'fixed'; // Ensure it's fixed positioning
          slothicornReference.current.style.zIndex = '5000'; // Above photo grid but below action buttons
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
    }
    
    setCountdown(0);
    triggerFlashAndCapture(e);
    
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
            slothicornReference.current.style.zIndex = '5000';
          }, 1500);
        }
      }, 1200);
    }

    // Custom canvas size and aspect ratio to match the model's expectations
    const { width: canvasWidth, height: canvasHeight } = getCustomDimensions(aspectRatio);
    console.log(`Capturing at ${canvasWidth}x${canvasHeight}`);
    
    // Create a canvas for the capture
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');
    
    // Enable high-quality image resampling for best results when resizing
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    
    // Get the video dimensions
    const video = videoReference.current;
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    
    // If front camera is active, apply mirroring
    if (isFrontCamera) {
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
    }
    
    // Calculate the maximum crop area that maintains the target aspect ratio
    let sourceWidth, sourceHeight, sourceX, sourceY;
    
    console.log(`📐 Crop calculation - Video: ${video.videoWidth}x${video.videoHeight} (${videoAspect.toFixed(3)}), Canvas: ${canvas.width}x${canvas.height} (${canvasAspect.toFixed(3)})`);
    
    if (videoAspect > canvasAspect) {
      // Video is wider than target - use full height, crop width to maximize resolution
      sourceHeight = video.videoHeight;
      sourceWidth = sourceHeight * canvasAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
      sourceY = 0;
      console.log(`📐 Video wider than target: Using full height ${sourceHeight}px, cropping width to ${sourceWidth.toFixed(1)}px, offset X: ${sourceX.toFixed(1)}px`);
    } else {
      // Video is taller than target - use full width, crop height to maximize resolution
      sourceWidth = video.videoWidth;
      sourceHeight = sourceWidth / canvasAspect;
      sourceX = 0;
      sourceY = (video.videoHeight - sourceHeight) / 2;
      console.log(`📐 Video taller than target: Using full width ${sourceWidth}px, cropping height to ${sourceHeight.toFixed(1)}px, offset Y: ${sourceY.toFixed(1)}px`);
    }
    
    // Draw the optimally cropped video frame
    context.drawImage(video, 
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, canvas.width, canvas.height
    );
    
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
      
      // Redraw the frame using the same optimized crop calculation
      if (videoAspect > canvasAspect) {
        sourceHeight = video.videoHeight;
        sourceWidth = sourceHeight * canvasAspect;
        sourceX = (video.videoWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        sourceWidth = video.videoWidth;
        sourceHeight = sourceWidth / canvasAspect;
        sourceX = 0;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }
      
      context.drawImage(video, 
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, canvas.width, canvas.height
      );
      
      if (isFrontCamera) {
        context.restore();
      }
    }

    // Generate initial data URL and blob
    // const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    // Create initial PNG blob with maximum quality
    const pngBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });
    
    if (!pngBlob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Convert PNG to high-quality JPEG for efficient upload
    let finalBlob;
    try {
      const { convertPngToHighQualityJpeg } = await import('./utils/imageProcessing.js');
      finalBlob = await convertPngToHighQualityJpeg(pngBlob);
      console.log(`📊 Upload format: JPEG (converted from PNG for efficiency)`);
    } catch (conversionError) {
      console.warn('JPEG conversion failed, using original PNG:', conversionError);
      finalBlob = pngBlob;
      console.log(`📊 Upload format: PNG (fallback)`);
    }

    // Log final file size being transmitted
    const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
    console.log(`📤 Final transmission size: ${finalSizeMB}MB`);

    // Create a temporary URL for the blob and show the image adjuster
    const tempUrl = URL.createObjectURL(finalBlob);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('camera');
    
    // Store this photo data for potential re-editing
    const photoData = {
      imageUrl: tempUrl,
      source: 'camera',
      blob: finalBlob
    };

    setLastEditablePhoto(photoData);
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  const triggerFlashAndCapture = (e) => {
    // Check if we're in countdown mode, and if so, abort
    if (countdown > 0) return;
    
    // Play camera shutter sound if enabled - immediate playback for iOS
    if (soundEnabled && shutterSoundReference.current && e) {
      // Reset to beginning to ensure sound plays every time
      shutterSoundReference.current.currentTime = 0;
      
      // Use the same pattern for both browsers
      try {
        // Use a synchronous play attempt first for Safari
        shutterSoundReference.current.play();
      } catch (error) {
        console.warn("Initial play attempt failed, trying promise-based approach:", error);
        // Fallback to promise for Chrome
        shutterSoundReference.current.play().catch(error => {
          console.warn("Error playing shutter sound:", error);
        });
      }
    }
    
    // Rest of the function remains the same
    if (flashEnabled) {
      setShowFlash(true);
      setTimeout(() => {
        setShowFlash(false);
      }, 700); 
    }
    // Process the capture
    captureAndSend();
    
    // Track photo capture event
    trackEvent('Photo', 'capture', selectedStyle, 1);
  };

  const captureAndSend = async () => {
    const canvas = canvasReference.current;
    const video = videoReference.current;
    
    // Get the dimensions based on the selected aspect ratio
    const { width, height } = getCustomDimensions(aspectRatio);
    
    // Set canvas dimensions to match the selected aspect ratio
    canvas.width = width;
    canvas.height = height;
    
    const context = canvas.getContext('2d');
    
    // Enable high-quality image resampling for best results when resizing
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    
    // Fill with black to prevent transparency
    context.fillStyle = 'black';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate dimensions to maximize use of available video resolution
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    // Calculate the maximum crop area that maintains the target aspect ratio
    let sourceWidth, sourceHeight, sourceX, sourceY;
    
    if (videoAspect > canvasAspect) {
      // Video is wider than target - use full height, crop width to maximize resolution
      sourceHeight = video.videoHeight;
      sourceWidth = sourceHeight * canvasAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
      sourceY = 0;
    } else {
      // Video is taller than target - use full width, crop height to maximize resolution
      sourceWidth = video.videoWidth;
      sourceHeight = sourceWidth / canvasAspect;
      sourceX = 0;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }
    
    // Apply the mirror effect for front camera
    if (isFrontCamera) {
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
    }
    
    // Draw the optimally cropped video frame
    context.drawImage(video, 
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, canvas.width, canvas.height
    );
    
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
      
      // Redraw the frame using optimized crop calculation
      let sourceX, sourceY;
      if (videoAspect > canvasAspect) {
        sourceHeight = video.videoHeight;
        sourceWidth = sourceHeight * canvasAspect;
        sourceX = (video.videoWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        sourceWidth = video.videoWidth;
        sourceHeight = sourceWidth / canvasAspect;
        sourceX = 0;
        sourceY = (video.videoHeight - sourceHeight) / 2;
      }
      
      context.drawImage(video, 
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, canvas.width, canvas.height
      );
      
      if (isFrontCamera) {
        context.restore();
      }
    }

    // Generate initial data URL and blob
    // const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    // Create initial PNG blob with maximum quality
    const pngBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png', 1.0);
    });
    
    if (!pngBlob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Convert PNG to high-quality JPEG for efficient upload
    let finalBlob;
    try {
      const { convertPngToHighQualityJpeg } = await import('./utils/imageProcessing.js');
      finalBlob = await convertPngToHighQualityJpeg(pngBlob);
      console.log(`📊 Upload format: JPEG (converted from PNG for efficiency)`);
    } catch (conversionError) {
      console.warn('JPEG conversion failed, using original PNG:', conversionError);
      finalBlob = pngBlob;
      console.log(`📊 Upload format: PNG (fallback)`);
    }

    // Log final file size being transmitted
    const finalSizeMB = (finalBlob.size / 1024 / 1024).toFixed(2);
    console.log(`📤 Final transmission size: ${finalSizeMB}MB`);

    // Stop the camera stream after capturing the photo
    stopCamera();

    // Create a temporary URL for the blob and show the image adjuster
    const tempUrl = URL.createObjectURL(finalBlob);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('camera');
    
    // Store this photo data for potential re-editing
    const photoData = {
      imageUrl: tempUrl,
      source: 'camera',
      blob: finalBlob
    };

    setLastEditablePhoto(photoData);
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  /**
   * Handle user selection of a different camera device.
   */
  const handleCameraSelection = async (e) => {
    const deviceId = typeof e === 'string' ? e : e.target.value;
    const normalizedDeviceId = deviceId === '' ? null : deviceId;
    console.log('📹 Camera selection changed to:', normalizedDeviceId || 'auto-select');
    
    // Update local state
    setSelectedCameraDeviceId(normalizedDeviceId);
    
    // Save preference to settings
    updateSetting('preferredCameraDeviceId', normalizedDeviceId || undefined);
    
    // Switch to the new camera if one is active
    if (videoReference.current && videoReference.current.srcObject) {
      console.log('📹 Switching active camera to:', normalizedDeviceId || 'auto-select');
      await startCamera(normalizedDeviceId);
    }
    
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
          selectedModel={selectedModel}
          showControlOverlay={showControlOverlay}
          setShowControlOverlay={setShowControlOverlay}
          onThemeChange={handleThemeChange}
          dropdownPosition="bottom" // Force dropdown to appear below the button since it's at the top of the screen
          triggerButtonClass=".global-style-btn"
        />
      </div>

      {/* Upload Progress Modal */}
      <UploadProgress
        progress={uploadProgress}
        isVisible={showUploadProgress}
        statusText={uploadStatusText}
      />

      {/* Friendly Error Modal */}
      <FriendlyErrorModal 
        error={backendError}
        onClose={() => setBackendError(null)}
        onRetry={() => {
          // If there's a retry context, re-trigger the Twitter share
          if (twitterPhotoIndex !== null && lastTwitterMessage) {
            handleTwitterShare(lastTwitterMessage);
          }
        }}
      />

      {/* Success Toast */}
      <SuccessToast
        message={successMessage}
        isVisible={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
      />

      {showStartMenu ? (
        <>
          <CameraStartMenu
            onTakePhoto={handleTakePhotoOption}
            onBrowsePhoto={handleBrowsePhotoOption}
            onDragPhoto={handleDragPhotoOption}
            isProcessing={!!activeProjectReference.current || isPhotoButtonCooldown}
            hasPhotos={photos.length > 0}
            onViewPhotos={null} // Remove the onViewPhotos prop as we're moving the button out
          />
          

          
          {/* Move the corner button outside of CameraStartMenu */}
          {showStartMenu && photos.length > 0 && (
            <button 
              className="corner-btn photos-corner-btn"
              onClick={() => {
                // Pre-scroll to top for smooth transition
                window.scrollTo({ top: 0, behavior: 'smooth' });
                // Stop camera when showing photo grid
                stopCamera();
                // Show photo grid
                setShowPhotoGrid(true);
                setShowStartMenu(false);
              }}
            >
              Photos →
            </button>
          )}
        </>
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
            aspectRatio={aspectRatio}
            iosQuirkDetected={iosQuirkDetected}
            actualCameraDimensions={actualCameraDimensions}
            quirkDetectionComplete={quirkDetectionComplete}
            tezdevTheme={tezdevTheme}
            modelOptions={getModelOptions()}
            selectedModel={selectedModel}
            onModelSelect={(value) => {
              console.log(`Model selected: ${value}`);
              switchToModel(value);
            }}
            numImages={numImages}
            onNumImagesChange={(value) => {
              updateSetting('numImages', value);
            }}
            promptGuidance={promptGuidance}
            onPromptGuidanceChange={(value) => {
              updateSetting('promptGuidance', value);
            }}
            guidance={guidance}
            onGuidanceChange={(value) => {
              updateSetting('guidance', value);
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
            inferenceSteps={inferenceSteps}
            onInferenceStepsChange={(value) => {
              updateSetting('inferenceSteps', value);
            }}
            scheduler={scheduler}
            onSchedulerChange={(value) => {
              updateSetting('scheduler', value);
            }}
            timeStepSpacing={timeStepSpacing}
            onTimeStepSpacingChange={(value) => {
              updateSetting('timeStepSpacing', value);
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
            backgroundAnimationsEnabled={backgroundAnimationsEnabled}
            onBackgroundAnimationsEnabledChange={(value) => {
              updateSetting('backgroundAnimationsEnabled', value);
              saveSettingsToCookies({ backgroundAnimationsEnabled: value });
            }}
            onResetSettings={resetSettings}
            onBackToMenu={handleBackToMenu}
            lastPhotoData={lastEditablePhoto}
            onThumbnailClick={handleThumbnailClick}
          />
          
          {/* Other UI elements like canvas, flash effect, etc. */}
          <canvas ref={canvasReference} style={{ display: 'none' }} />
          
          {/* Back to Menu Button - moved outside of CameraView */}
          {!showStartMenu && !showPhotoGrid && (
            <button 
              className="corner-btn back-to-menu-btn"
              onClick={handleBackToMenu}
              aria-label="Back to Main Menu"
              data-testid="back-to-menu-button"
            >
              ← Menu
            </button>
          )}


        </>
      )}
    </div>
  );

  // -------------------------
  //   Drag overlay
  // -------------------------
  const handleBackToCamera = () => {
    // Always go directly back to camera from photo grid
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
      
      // Go directly back to camera view instead of start menu
      setShowStartMenu(false);
      
      // Restart camera since it was stopped when photo grid was shown
      const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
      console.log('📹 Restarting camera from photo grid with preferred device:', preferredDeviceId || 'auto-select');
      
      if (cameraManuallyStarted && videoReference.current) {
        // Always restart the camera since we stop it when showing photo grid
        startCamera(preferredDeviceId);
      } else {
        // Camera hasn't been manually started yet, start it now
        startCamera(preferredDeviceId);
        setCameraManuallyStarted(true);
      }
      
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
      }, 1500); // Slightly longer than animation duration (1.3s + buffer)
      
      return () => clearTimeout(timer);
    }
  }, [photos]);

  // Clean up sound tracking when photos are cleared/reset
  useEffect(() => {
    if (photos.length === 0) {
      soundPlayedForPhotos.current.clear();
    }
  }, [photos.length]);

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
    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);
    // Start camera after user selects the option - use preferred camera if available
    const preferredDeviceId = preferredCameraDeviceId || selectedCameraDeviceId;
    console.log('📹 Starting camera with preferred device:', preferredDeviceId || 'auto-select');
    await startCamera(preferredDeviceId);
    setCameraManuallyStarted(true); // User explicitly chose to take a photo
  };

  // Handler for the "Browse Photo" option in start menu
  const handleBrowsePhotoOption = async (file) => {
    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);
    
    // Make sure we have a valid file
    if (!file) return;
    
    // Check if Sogni is ready
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Please try again in a moment.');
      setShowStartMenu(true);
      return;
    }
    
    // Create a temporary URL for the file
    const tempUrl = URL.createObjectURL(file);
    setCurrentUploadedImageUrl(tempUrl);
    setCurrentUploadedSource('upload');
    
    // Store this photo data for potential re-editing
    const photoData = {
      imageUrl: tempUrl,
      source: 'upload',
      blob: file
    };

    setLastEditablePhoto(photoData);
    
    // Show the image adjuster
    setShowImageAdjuster(true);
  };

  // Handler for the "Drag Photo" option in start menu
  const handleDragPhotoOption = async () => {
    // Add exit animation class
    const startMenuElement = document.querySelector('.camera-start-menu');
    if (startMenuElement) {
      startMenuElement.classList.add('exiting');
      
      // Wait for animation to complete before hiding
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setShowStartMenu(false);
    // Show an overlay or instructions for drag and drop
    setDragActive(true);
    // This will use the existing drag and drop handlers which now use the image adjuster
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

  // Function to handle going back from camera to start menu
  const handleBackToMenu = () => {
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Hide slothicorn if visible
    if (slothicornReference.current) {
      slothicornReference.current.style.setProperty('bottom', '-360px', 'important');
      slothicornReference.current.classList.remove('animating');
    }
    
    // Show the start menu
    setShowStartMenu(true);
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

    if (!lastPhotoData.blob) {
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
        // Calculate the global photo index for frame assignment based on existing photos
        const globalPhotoIndex = (existingOriginalPhoto ? 1 : 0) + i;
        
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
          sourceType: sourceType, // Store sourceType in photo object for reference
          // Assign Taipei frame number based on photo index for equal distribution (1-6)
          taipeiFrameNumber: (globalPhotoIndex % 6) + 1,
          framePadding: 0 // Will be updated by migration effect in PhotoGallery
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
          // Handle NetworkError instances with better messaging
          let errorMessage = `Error: ${error.message || error}`;
          let retryable = false;
          
          if (isNetworkError(error)) {
            if (error.isOffline) {
              errorMessage = 'NETWORK OFFLINE: Check connection';
              retryable = true;
            } else if (error.isTimeout) {
              errorMessage = 'CONNECTION TIMEOUT: Try again';  
              retryable = true;
            } else if (error.retryable) {
              errorMessage = 'NETWORK ERROR: Retry available';
              retryable = true;
            } else {
              errorMessage = 'NETWORK ERROR: Connection failed';
              retryable = false;
            }
          } else if (error && error.message) {
            const errorText = error.message;
            if (errorText.includes('network') || errorText.includes('connection') || errorText.includes('timeout')) {
              retryable = true;
            }
          }
          
          newPhotos.push({
            id: Date.now() + i,
            generating: false,
            loading: false,
            error: errorMessage,
            originalDataUrl: lastPhotoData.dataUrl,
            permanentError: !retryable,
            retryable: retryable,
            sourceType: sourceType // Store sourceType in photo object
          });
        }
        return newPhotos;
      });
    }
  };

  // Add retry mechanism for failed photos
  const handleRetryPhoto = async (photoIndex) => {
    console.log(`Retrying photo at index ${photoIndex}`);
    
    const photo = photos[photoIndex];
    if (!photo || !photo.retryable || !lastPhotoData.blob) {
      console.error('Cannot retry: photo not retryable or no source data available');
      return;
    }
    
    // Reset photo to generating state
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          generating: true,
          loading: true,
          progress: 0,
          error: null,
          permanentError: false,
          retryable: false,
          statusText: 'Retrying...'
        };
      }
      return updated;
    });
    
    try {
      // Use the same source data to retry generation
      const { blob, dataUrl } = lastPhotoData;
      const blobCopy = blob.slice(0, blob.size, blob.type);
      
      // Wait a bit before retrying to avoid hammering the server
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Retry the generation using the same approach as generateFromBlob 
      const sourceType = photo.sourceType || 'upload';
      await generateFromBlob(blobCopy, photoIndex, dataUrl, true, sourceType);
      
    } catch (error) {
      console.error('Retry failed:', error);
      
      // Update photo with retry failure
      setPhotos(prev => {
        const updated = [...prev];
        if (updated[photoIndex]) {
          let errorMessage = 'RETRY FAILED: Try again later';
          let retryable = false;
          
          if (isNetworkError(error)) {
            if (error.isOffline) {
              errorMessage = 'STILL OFFLINE: Check connection';
              retryable = true;
            } else if (error.retryable) {
              errorMessage = 'RETRY FAILED: Network issue';
              retryable = true;
            }
          } else if (error && error.message && 
                     (error.message.includes('network') || 
                      error.message.includes('connection') || 
                      error.message.includes('timeout'))) {
            retryable = true;
          }
          
          updated[photoIndex] = {
            ...updated[photoIndex],
            generating: false,
            loading: false,
            error: errorMessage,
            permanentError: !retryable,
            retryable: retryable,
            statusText: 'Retry Failed'
          };
        }
        return updated;
      });
    }
  };

  // Add retry all function for network issues
  const handleRetryAllPhotos = async () => {
    console.log('Retrying all failed retryable photos');
    
    // Reset connection state when user manually retries
    setConnectionState('online');
    
    // Cancel any active project first to prevent conflicts
    if (activeProjectReference.current) {
      console.log('Cancelling active project before retry:', activeProjectReference.current);
      if (sogniClient) {
        try {
          await sogniClient.cancelProject(activeProjectReference.current);
        } catch (error) {
          console.warn('Error cancelling active project during retry:', error);
        }
      }
      activeProjectReference.current = null;
      clearAllTimeouts(); // Clear any existing timeouts
    }
    
    // Find all photos that can be retried
    const retryablePhotos = photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => photo.error && photo.retryable && !photo.generating);
    
    // Also handle stuck generating photos (force retry them)
    const stuckPhotos = photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => (photo.generating || photo.loading) && !photo.error);
    
    if (retryablePhotos.length === 0 && stuckPhotos.length === 0) {
      console.log('No retryable or stuck photos found');
      return;
    }
    
    // First, reset stuck photos to error state so they can be retried
    if (stuckPhotos.length > 0) {
      console.log(`Found ${stuckPhotos.length} stuck photos, converting to retryable errors`);
      setPhotos(prev => {
        const updated = [...prev];
        stuckPhotos.forEach(({ index }) => {
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              generating: false,
              loading: false,
              error: 'GENERATION STUCK: Connection timeout',
              retryable: true,
              permanentError: false,
              statusText: 'Stuck - Retry Available'
            };
          }
        });
        return updated;
      });
      
      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Get the updated photos list after state changes using a callback to ensure fresh state
    let allRetryablePhotos = [];
    setPhotos(prev => {
      allRetryablePhotos = prev
        .map((photo, index) => ({ photo, index }))
        .filter(({ photo }) => photo.error && photo.retryable && !photo.generating);
      return prev; // Don't actually change the state here
    });
    
    // Retry each photo with a small delay between retries
    for (let i = 0; i < allRetryablePhotos.length; i++) {
      const { index } = allRetryablePhotos[i];
      
      // Add a delay between retries to avoid overwhelming the server
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      try {
        await handleRetryPhoto(index);
      } catch (error) {
        console.error(`Failed to retry photo ${index}:`, error);
      }
    }
  };

  // Add this new function to handle the adjusted image after confirmation
  const handleAdjustedImage = (adjustedBlob, adjustments) => {
    // Hide the adjuster
    setShowImageAdjuster(false);
    
    // Clean up the URL object to prevent memory leaks
    if (currentUploadedImageUrl) {
      URL.revokeObjectURL(currentUploadedImageUrl);
    }
    
    // Reset the current image state
    setCurrentUploadedImageUrl('');
    
    // Update lastEditablePhoto with the adjustments so user can return to resizer from photo gallery
    if (lastEditablePhoto && adjustments) {
  
      setLastEditablePhoto({
        ...lastEditablePhoto,
        adjustments: adjustments
      });
    }
    
    // Create a new photo item with temporary placeholder
    const newPhoto = {
      id: Date.now().toString(),
      generating: true,
      images: [],
      error: null,
      originalDataUrl: null, // Will be updated with adjusted version
      newlyArrived: false,
      generationCountdown: 10,
      sourceType: currentUploadedSource === 'camera' ? 'camera' : 'upload', // Set source type based on current mode
      // Assign Taipei frame number based on current photo count for equal distribution (1-6)
      taipeiFrameNumber: (photos.length % 6) + 1,
      framePadding: 0 // Will be updated by migration effect in PhotoGallery
    };
    
    setPhotos((previous) => [...previous, newPhoto]);
    const newPhotoIndex = photos.length;

    // Create data URL from the adjusted blob
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
      const adjustedDataUrl = event.target.result;
      
      // Update the photo with the adjusted data URL as placeholder
      setPhotos(prev => {
        const updated = [...prev];
        if (updated[newPhotoIndex]) {
          updated[newPhotoIndex] = {
            ...updated[newPhotoIndex],
            originalDataUrl: adjustedDataUrl // Use adjusted version as placeholder
          };
        }
        return updated;
      });
      
      // Use the adjusted blob for generation
      generateFromBlob(adjustedBlob, newPhotoIndex, adjustedDataUrl, false, currentUploadedSource === 'camera' ? 'camera' : 'upload');
    });
    reader.readAsDataURL(adjustedBlob);
  };

  // Add this new function to handle cancellation of image adjusting
  const handleCancelAdjusting = () => {
    setShowImageAdjuster(false);
    
    // Clean up the URL object to prevent memory leaks
    if (currentUploadedImageUrl) {
      URL.revokeObjectURL(currentUploadedImageUrl);
    }
    
    // Reset the current image state
    setCurrentUploadedImageUrl('');
    
    // Show the start menu again
    setShowStartMenu(true);
  };

  // Add this to the component state declarations at the top

  // Handle thumbnail click to reopen the image adjuster
  const handleThumbnailClick = async () => {
    if (!lastEditablePhoto) return;
    
    if (lastEditablePhoto.blob) {
      // We have the blob - can reopen the adjuster
      const newTempUrl = URL.createObjectURL(lastEditablePhoto.blob);
      setCurrentUploadedImageUrl(newTempUrl);
      setCurrentUploadedSource(lastEditablePhoto.source);
      setShowImageAdjuster(true);
    } else if (lastEditablePhoto.dataUrl) {
      // We have the dataUrl from localStorage - convert back to blob
      try {
        const response = await fetch(lastEditablePhoto.dataUrl);
        const blob = await response.blob();
        const newTempUrl = URL.createObjectURL(blob);
        
        // Update the lastEditablePhoto with the new blob for future use
        setLastEditablePhoto({
          ...lastEditablePhoto,
          blob: blob,
          imageUrl: newTempUrl
        });
        
        setCurrentUploadedImageUrl(newTempUrl);
        setCurrentUploadedSource(lastEditablePhoto.source);
        setShowImageAdjuster(true);
      } catch (error) {
        console.error('Failed to restore image from dataUrl:', error);
        alert('Failed to restore previous photo. Please take a new photo.');
        setLastEditablePhoto(null);
      }
    } else {
      // No usable image data
      console.warn('No usable image data found');
      setLastEditablePhoto(null);
    }
  };

  // Create stable references using useMemo to ensure they don't change
  const defaultPosition = useMemo(() => ({ x: 0, y: 0 }), []);
  const defaultScaleValue = 1;

  // -------------------------
  //   Render
  // -------------------------
  return (
    <>
      {/* Splash Screen */}
      {showSplashScreen && (
        <SplashScreen onDismiss={() => setShowSplashScreen(false)} />
      )}
      
      {/* PWA Install Prompt */}
      {showPWAPrompt && (
        <PWAInstallPrompt 
          onClose={() => setShowPWAPrompt(false)}
        />
      )}

      {/* Twitter Share Modal */}
      <TwitterShareModal 
        isOpen={showTwitterModal}
        onClose={() => setShowTwitterModal(false)}
        onShare={handleTwitterShare}
        imageUrl={twitterPhotoIndex !== null && photos[twitterPhotoIndex] ? photos[twitterPhotoIndex].images[0] : null}
        photoData={twitterPhotoIndex !== null ? photos[twitterPhotoIndex] : null}
        tezdevTheme={tezdevTheme}
        aspectRatio={aspectRatio}
        outputFormat={outputFormat}
      />



      {/* Global Countdown Overlay - always above mascot and all UI */}
      {countdown > 0 && (
        <div className="global-countdown-overlay" data-testid="global-countdown">
          {countdown}
        </div>
      )}
      
      {currentThought && 
        (/iphone|ipad|ipod|android/i.test(navigator.userAgent) === false) && 
        !showSplashScreen && 
        !showStartMenu && (
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
          guidance={guidance}
          controlNetStrength={controlNetStrength}
          controlNetGuidanceEnd={controlNetGuidanceEnd}
          inferenceSteps={inferenceSteps}
          scheduler={scheduler}
          timeStepSpacing={timeStepSpacing}
          flashEnabled={flashEnabled}
          keepOriginalPhoto={keepOriginalPhoto}
          aspectRatio={aspectRatio}
          tezdevTheme={tezdevTheme}
          // Handlers using updateSetting
          onPositivePromptChange={handlePositivePromptChange} 
          onStylePromptChange={(value) => updateSetting('stylePrompt', value)}
          onNegativePromptChange={(value) => updateSetting('negativePrompt', value)}
          onSeedChange={(value) => updateSetting('seed', value)}
          onModelSelect={(value) => updateSetting('selectedModel', value)}
          onNumImagesChange={(value) => updateSetting('numImages', value)}
          onPromptGuidanceChange={(value) => updateSetting('promptGuidance', value)}
          onGuidanceChange={(value) => updateSetting('guidance', value)}
          onControlNetStrengthChange={(value) => updateSetting('controlNetStrength', value)}
          // Remove incorrect setters, use updateSetting instead
          onControlNetGuidanceEndChange={(value) => updateSetting('controlNetGuidanceEnd', value)}
          onInferenceStepsChange={(value) => updateSetting('inferenceSteps', value)}
          onSchedulerChange={(value) => updateSetting('scheduler', value)}
          onTimeStepSpacingChange={(value) => updateSetting('timeStepSpacing', value)}
          onFlashEnabledChange={(value) => updateSetting('flashEnabled', value)}
          onKeepOriginalPhotoChange={(value) => updateSetting('keepOriginalPhoto', value)}
          onAspectRatioChange={(value) => {
            updateSetting('aspectRatio', value);
            saveSettingsToCookies({ aspectRatio: value });
          }}
          onTezDevThemeChange={async (value) => {
            updateSetting('tezdevTheme', value);
            saveSettingsToCookies({ tezdevTheme: value });
            
            // For dynamic themes, switch to their default aspect ratio
            if (value !== 'off') {
              try {
                const theme = await themeConfigService.getTheme(value);
                if (theme?.defaultAspectRatio) {
                  updateSetting('aspectRatio', theme.defaultAspectRatio);
                  saveSettingsToCookies({ aspectRatio: theme.defaultAspectRatio });
                  
                  // Update CSS variables to match the new aspect ratio
                  const aspectRatioMap = {
                    'ultranarrow': '768/1344',
                    'narrow': '832/1216',
                    'portrait': '896/1152',
                    'square': '1024/1024',
                    'landscape': '1152/896',
                    'wide': '1216/832',
                    'ultrawide': '1344/768'
                  };
                  const cssRatio = aspectRatioMap[theme.defaultAspectRatio] || '1024/1024';
                  document.documentElement.style.setProperty('--current-aspect-ratio', cssRatio);
                }
              } catch (error) {
                console.warn('Could not load theme default aspect ratio:', error);
              }
            }
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
          backgroundAnimationsEnabled={backgroundAnimationsEnabled}
          onBackgroundAnimationsEnabledChange={(value) => {
            updateSetting('backgroundAnimationsEnabled', value);
            saveSettingsToCookies({ backgroundAnimationsEnabled: value });
          }}
          outputFormat={outputFormat}
          onOutputFormatChange={(value) => {
            updateSetting('outputFormat', value);
            saveSettingsToCookies({ outputFormat: value });
          }}
          sensitiveContentFilter={sensitiveContentFilter}
          onSensitiveContentFilterChange={(value) => {
            updateSetting('sensitiveContentFilter', value);
            saveSettingsToCookies({ sensitiveContentFilter: value });
          }}
          kioskMode={kioskMode}
          onKioskModeChange={(value) => {
            updateSetting('kioskMode', value);
            saveSettingsToCookies({ kioskMode: value });
          }}
          onResetSettings={resetSettings} // Pass context reset function
          // Camera-related props
          cameraDevices={cameraDevices}
          selectedCameraDeviceId={selectedCameraDeviceId}
          onCameraDeviceChange={handleCameraSelection} 
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
                  <li>Only one face at a time unless using Flux.1 Kontext! If multiple faces the biggest one in frame is used.</li>
                  <li>The more light / dark depth on your face the better, flat even light results can be subpar.</li>
                  <li>Try using the Custom Prompt feature and providing your own prompt!</li>
                  <li>You can even drag a photo into the camera window to use as a reference!</li>
                </ul>
                <div className="note-footer">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <a href="https://www.sogni.ai/sdk" target="_blank" rel="noopener noreferrer">
                      Vibe Coded with Sogni Client SDK<br/>Powered by Sogni Supernet ❤️
                    </a>
                    <button
                      onClick={() => {
                        setShowInfoModal(false);
                        setShowPromoPopup(true);
                      }}
                      className="signup-tip-button"
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                      title="Get 100 free credits with Sogni!"
                    >
                      Signup? ✨
                    </button>
                  </div>
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
          redoEnhancement={redoEnhancement}
          sogniClient={sogniClient}
          desiredWidth={desiredWidth}
          desiredHeight={desiredHeight}
          selectedSubIndex={selectedSubIndex}
          outputFormat={outputFormat}
          sensitiveContentFilter={sensitiveContentFilter}
          handleShareToX={handleShareToX}
          slothicornAnimationEnabled={slothicornAnimationEnabled}
          backgroundAnimationsEnabled={backgroundAnimationsEnabled}
          tezdevTheme={tezdevTheme}
          aspectRatio={aspectRatio}
          handleRetryPhoto={handleRetryPhoto}
          onPreGenerateFrame={handlePreGenerateFrameCallback}
          qrCodeData={qrCodeData}
          onCloseQR={() => setQrCodeData(null)}
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
              zIndex: 5000,
              pointerEvents: 'none'
            }}
          >
            <img 
              src="/slothicorn-camera.png" 
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

        {/* Hello sound */}
        {/*
        <audio ref={helloSoundReference} preload="auto">
          <source src={helloSound} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
        */}

        {/* Show photos button - only visible when we have photos and camera is shown */}
        {selectedPhotoIndex === null && !showPhotoGrid && photos.length > 0 && !showStartMenu && (
          <button
            onClick={() => {
              // Pre-scroll to top for smooth transition
              window.scrollTo(0, 0);
              // Stop camera when showing photo grid
              stopCamera();
              // Clean transition - explicitly ensure camera is hidden first
              setShowPhotoGrid(true);
              setShowStartMenu(false);
            }}
            className="view-photos-btn corner-btn"
          >
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
            animation: dropdownAppear 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
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
          
          /* Set aspect ratio CSS variable based on selected aspect ratio */
          :root {
            --current-aspect-ratio: ${
              aspectRatio === 'ultranarrow' ? '768/1344' :
              aspectRatio === 'narrow' ? '832/1216' :
              aspectRatio === 'portrait' ? '896/1152' : 
              aspectRatio === 'square' ? '1024/1024' : 
              aspectRatio === 'landscape' ? '1152/896' :
              aspectRatio === 'wide' ? '1216/832' :
              aspectRatio === 'ultrawide' ? '1344/768' :
              window.innerHeight > window.innerWidth ? '896/1152' : '1152/896'
            };
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
          .film-frame:not(.loading) {
            transform-origin: center center !important;
            transform: scale(1) translateZ(0) !important;
            will-change: transform, box-shadow !important;
            /* Remove the default transition to prevent background animations */
          }
          
          /* Allow loading animations to work - but not in selected/popup view */
          .film-frame.loading:not(.selected) {
            transform-origin: center center !important;
            will-change: transform, box-shadow !important;
            /* Don't override transform for loading frames - let animation handle it */
          }
          
          /* Only apply transitions on hover/active for deliberate interaction, but not on loading frames */
          /* Only apply hover effects on devices that support hover (not touch devices) */
          @media (hover: hover) and (pointer: fine) {
            .film-frame:not(.selected):not(.loading):hover {
              transform: scale(1.05) translateZ(0) !important;
              box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25) !important;
              transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), 
                          box-shadow 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
            }
            
            .film-frame:not(.selected):not(.loading):active {
              transform: scale(0.98) translateZ(0) !important;
              box-shadow: 0 6px 15px rgba(0, 0, 0, 0.2) !important;
              transition: all 0.1s ease-out !important;
            }
          }
          
          /* Ensure only the deliberately selected photo animates */
          .film-frame.selected {
            transform: scale(1) !important;
          }
          
          /* Add transition only for the specific photo being selected/deselected */
          .film-frame.animating-selection {
            transition: transform 0.5s cubic-bezier(0.2, 0, 0.2, 1) !important;
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
          // Only update if aspect ratio is not explicitly set by user
          if (!aspectRatio || aspectRatio === 'auto') {
            const isPortrait = window.innerHeight > window.innerWidth;
            document.documentElement.style.setProperty(
              '--current-aspect-ratio', 
              isPortrait ? '896/1152' : '1152/896'
            );
          }
        };
        
        // Set initial aspect ratio based on user selection or orientation
        switch (aspectRatio) {
          case 'ultranarrow':
            document.documentElement.style.setProperty('--current-aspect-ratio', '768/1344');
            break;
          case 'narrow':
            document.documentElement.style.setProperty('--current-aspect-ratio', '832/1216');
            break;
          case 'portrait':
            document.documentElement.style.setProperty('--current-aspect-ratio', '896/1152');
            break;
          case 'square':
            document.documentElement.style.setProperty('--current-aspect-ratio', '1024/1024');
            break;
          case 'landscape':
            document.documentElement.style.setProperty('--current-aspect-ratio', '1152/896');
            break;
          case 'wide':
            document.documentElement.style.setProperty('--current-aspect-ratio', '1216/832');
            break;
          case 'ultrawide':
            document.documentElement.style.setProperty('--current-aspect-ratio', '1344/768');
            break;
          default:
            // Default to orientation-based
            updateAspectRatio();
            break;
        }
        
        // Update on resize only if not using explicit aspect ratio
        window.addEventListener('resize', updateAspectRatio);
        
        return () => {
          window.removeEventListener('resize', updateAspectRatio);
          if (styleElement && document.head.contains(styleElement)) {
            styleElement.remove();
          }
        };
      }, [aspectRatio])}

      {/* Promotional Popup */}
      <PromoPopup 
        isOpen={showPromoPopup}
        onClose={handlePromoPopupClose}
      />

      {/* Network Status Notification */}
      <NetworkStatus 
        onRetryAll={handleRetryAllPhotos} 
        connectionState={connectionState}
        isGenerating={isGenerating}
      />
      
      {/* Add this section at the end, right before the closing tag */}
      {showImageAdjuster && currentUploadedImageUrl && (
        <ImageAdjuster
          key={currentUploadedImageUrl}
          imageUrl={currentUploadedImageUrl}
          onConfirm={handleAdjustedImage}
          onCancel={handleCancelAdjusting}
          initialPosition={
            lastEditablePhoto?.adjustments?.position || defaultPosition
          }
          defaultScale={
            lastEditablePhoto?.adjustments?.scale || defaultScaleValue
          }
        />
      )}

      {/* Confetti Celebration */}
      <ConfettiCelebration 
        isVisible={showConfetti && backgroundAnimationsEnabled}
        onComplete={() => setShowConfetti(false)}
      />

    </>
  );
};

export default App;

