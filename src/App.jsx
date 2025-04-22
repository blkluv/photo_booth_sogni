// ./src/App.jsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SogniClient } from "@sogni-ai/sogni-client";
import { API_CONFIG } from './config/cors';
import { SOGNI_URLS } from './config/sogni';
import clickSound from './click.mp3';

/**
 * Default style prompts
 */
const defaultStylePrompts = {
  anime: `Charismatic adventurer, Studio Ghibli style anime, hayo miyazaki, masterpiece, whimsical, 90s anime, cute`,
  gorillaz: `Attractive, A vibrant, stylized cartoon band portrait inspired by the edgy, urban comic style of "Gorillaz." Bold, inky outlines and gritty details, with slightly exaggerated facial features and a rebellious attitude. A blend of punk, hip-hop, and futuristic aesthetics, set against a graffiti-covered cityscape.`,
  disney: `Attractive, A magical, whimsical Disney-inspired portrait with bright colors, large expressive eyes, soft outlines, and a fairytale atmosphere. Princess-like attire, dreamy background elements, and a charming, uplifting mood.`,
  pixelArt: `Attractive, A retro CryptoPunks NFT pixel art style portrait with 8-bit color palette, blocky forms, and visible pixelation. Nostalgic and charming, reminiscent of classic arcade or console games from the 80s and 90s.`,
  steampunk: `Attractive, A retro-futuristic steampunk style portrait featuring brass goggles, gears, clockwork elements, Victorian fashion, and a smoky, industrial atmosphere. Intricate mechanical details, warm metallic tones, and a sense of invention.`,
  vaporwave: `Attractive, A dreamy, neon vaporwave portrait with pastel gradients, retro 80s aesthetics, glitch effects, palm trees, and classic Greek statue motifs. Vibrant pink, purple, and cyan color palette, set in a cyber-futuristic cityscape.`,
  astronaut: `Attractive, astronaut wearing helmet, floating near a spaceship window; confined interior contrasts with vast starfield outside. soft moonlight highlights the suited figure against inky blackness, shimmering starlight. deep indigo, silver, neon-tech blues. serene awe. centered astronaut, expansive view. stunning hyper-detailed realism`,
  sketch: 'Caricature sketch',
  statue: 'Antique Roman statue with red garments',
  clown: 'a clown in full makeup, balloon animals',
  relax: 'in bubble bath submerged to face, white bubbles, pink bathtub, 35mm cinematic film',
  custom: ``,
};
defaultStylePrompts.random = `{${['anime', 'gorillaz', 'pixelArt', 'vaporwave', 'sketch', 'statue', 'clown', 'relax'].map(style => defaultStylePrompts[style]).join('|')}}`;

/**
 * Returns 1280×720 (landscape) or 720×1280 (portrait)
 * so that Sogni returns images that match the orientation.
 * These must be integers between 256 and 2048.
 */
function getCustomDimensions() {
  const isPortrait = window.innerHeight > window.innerWidth;
  if (isPortrait) {
    return { width: 720, height: 1280 };
  } else {
    return { width: 1280, height: 720 };
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

  // Style selection -- default to "anime"
  const [selectedStyle, setSelectedStyle] = useState('anime');
  const [customPrompt, setCustomPrompt] = useState('');

  // Each style can have a different realism value
  const initialStyleRealism = {
    anime: 45,
    gorillaz: 45,
    disney: 45,
    pixelArt: 45,
    steampunk: 45,
    vaporwave: 45,
    astronaut: 45,
    statue: 45,
    custom: 45,
    random: 45,
    sketch: 45,
    clown: 45,
    relax: 45,
  };
  const [styleRealism, setStyleRealism] = useState(initialStyleRealism);

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
    startedJobIndices: new Set(), // Track which indices have started jobs
    completedJobs: new Map(), // Store completed jobs that arrive before start
    pendingCompletions: new Map() // Store completions that arrive before we have the mapping
  });

  // Calculate aspect ratio for loading boxes
  const isPortrait = desiredHeight > desiredWidth;
  const thumbnailWidth = isPortrait ? 120 : 212; // Wider for landscape (doubled)
  const thumbnailHeight = isPortrait ? 212 : 120; // Taller for portrait (doubled)

  // First, add the model options at the top of the file
  const modelOptions = [
    { label: '🅂 Sogni.XLT 𝛂1 (SDXL Turbo)', value: 'coreml-sogniXLturbo_alpha1_ad' },
    { label: 'DreamShaper v2.1 (SDXL Turbo)', value: 'coreml-dreamshaperXL_v21TurboDPMSDE' },
    { label: 'JuggernautXL 9 + RD Photo2 (SDXL Lightning)', value: 'coreml-juggernautXL_v9Rdphoto2Lightning' }
  ];

  // At the top of App component, add new state variables
  const [selectedModel, setSelectedModel] = useState('coreml-sogniXLturbo_alpha1_ad');
  const [numImages, setNumImages] = useState(8);
  const [promptGuidance, setPromptGuidance] = useState(2.5);
  const [controlNetStrength, setControlNetStrength] = useState(0.9);
  const [controlNetGuidanceEnd, setControlNetGuidanceEnd] = useState(0.7);

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
   * Try to capture at "desiredWidth x desiredHeight".
   */
  const startCamera = useCallback(async (deviceId) => {
    const constraints = deviceId
      ? {
          video: {
            deviceId,
            width: { ideal: desiredWidth },
            height: { ideal: desiredHeight },
          },
        }
      : {
          video: {
            facingMode: 'user',
            width: { ideal: desiredWidth },
            height: { ideal: desiredHeight },
          },
        };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Add a small delay before playing to prevent the AbortError
        setTimeout(() => {
          videoRef.current.play().catch(err => {
            console.warn("Video play error:", err);
          });
        }, 100);
      }
    } catch (err) {
      console.error(`Error accessing webcam: ${err}`);
      alert(`Error accessing webcam: ${err.message}`);
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
      videoRef.current.play().catch(err => {
        console.warn("Video re-play error:", err);
      });
    }
  }, [selectedPhotoIndex]);

  // Preload images for the selected photo
  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]) {
      photos[selectedPhotoIndex].images.forEach((url) => {
        const img = new Image();
        img.src = url;
      });
    }
  }, [selectedPhotoIndex, photos]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (selectedPhotoIndex !== null) {
      const currentPhoto = photos[selectedPhotoIndex];
      const maxImages = currentPhoto?.images?.length || 1;

      // ESC => close viewer
      if (e.key === 'Escape') {
        setSelectedPhotoIndex(null);
        setSelectedSubIndex(0);
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

      // left/right => previous/next photo
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedPhotoIndex((idx) => {
          const newIdx = Math.max(0, idx - 1);
          setSelectedSubIndex(0);
          return newIdx;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedPhotoIndex((idx) => {
          const newIdx = Math.min(photos.length - 1, idx + 1);
          setSelectedSubIndex(0);
          return newIdx;
        });
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
  }, [selectedPhotoIndex, photos, lastViewedIndex]);

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

  // -------------------------
  //   Shared logic for generating images from a Blob
  // -------------------------
  const generateFromBlob = async (photoBlob, newPhotoIndex, dataUrl) => {
    try {
      // 1) Get the style prompt
      const stylePrompt = (selectedStyle === 'custom')
        ? (customPrompt || 'A custom style portrait')
        : defaultStylePrompts[selectedStyle];

      // 2) Call the describeImage API to get a textual description
      // const photoDescription = await describeImage(photoBlob);
      // with instant-id controlnet we don't need to describe the existing image, it will make the image boring
      // console.log('photoDescription', photoDescription);

      // 3) Combine them for a more relevant final prompt
      // const combinedPrompt = stylePrompt + ' ' + photoDescription;
      const combinedPrompt = stylePrompt;
      console.log('stylePrompt', stylePrompt);

      // Initialize project state BEFORE setting up event handlers
      projectStateRef.current = {
        currentPhotoIndex: newPhotoIndex,
        pendingCompletions: new Map() // Store completed jobs until we can show them
      };

      // Clear all previous photos and create new ones with proper initial state
      setPhotos(prev => {
        // Add the original photo if keepOriginalPhoto is checked
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
        
        // Add placeholder boxes for the generated images
        for (let i = 0; i < numImages; i++) {
          newPhotos.push({
            id: Date.now() + i + 1,
            generating: true,
            loading: true,
            images: [],
            error: null,
            originalDataUrl: null,
            newlyArrived: false
          });
        }

        return newPhotos;
      });

      // Set up event handlers BEFORE creating the project
      const handleJobCompleted = (job) => {
        console.log('Job completed:', job.id, job.resultUrl);
        if (!job.resultUrl) {
          console.error('Missing resultUrl for job:', job.id);
          return;
        }
        
        const { pendingCompletions, currentPhotoIndex } = projectStateRef.current;
        
        // Assign the next available index
        const jobIndex = pendingCompletions.size;
        
        // Store the completed job
        pendingCompletions.set(job.id, {
          resultUrl: job.resultUrl,
          index: jobIndex
        });
        
        // Update UI immediately with this job
        // Add 1 to the photo index if we have the original photo
        const offset = keepOriginalPhoto ? 1 : 0;
        const photoIndex = jobIndex + offset;
        console.log(`Loading image for job ${job.id} into box ${photoIndex}`);
        
        // Pre-load the image
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
              images: [job.resultUrl],
              newlyArrived: true
            };
            return updated;
          });
        };
        img.src = job.resultUrl;
      };

      // Set up event handlers
      const arrayBuffer = await photoBlob.arrayBuffer();
      const project = await sogniClient.projects.create({
        modelId: selectedModel,
        positivePrompt: combinedPrompt,
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
          mode: 'balanced',// balanced cn_priority
          guidanceStart: 0.0,
          guidanceEnd: controlNetGuidanceEnd,
        }
      });

      // Set up event handlers
      project.on('jobCompleted', handleJobCompleted);
      
      // Handle project completion (backup)
      project.on('completed', (urls) => {
        console.log('Project completed:', urls);
        if (urls.length === 0) return;
        
        // Update UI with all completed jobs if we somehow missed them
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

    } catch (err) {
      // Handle initialization errors
      if (err && err.code === 4015) {
        console.warn("Socket error (4015). Re-initializing Sogni.");
        setIsSogniReady(false);
        initializeSogni();
      }
      setPhotos(prev => {
        // For errors, replace all loading placeholders with error state
        // but keep original photo if it exists
        const updated = [];
        
        // Keep original photo if it exists
        if (keepOriginalPhoto) {
          // Find existing original photo if any
          const originalPhoto = prev.find(p => p.isOriginal);
          if (originalPhoto) {
            updated.push(originalPhoto);
          }
        }
        
        // Add error placeholders
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
    if (!isSogniReady) {
      alert('Sogni is not ready yet.');
      return;
    }

    console.log('handleTakePhoto called');
    
    // Simple countdown with await
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setCountdown(0);
    triggerFlashAndCapture();
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
      setTimeout(() => {
        setShowFlash(false);
        captureAndSend();
      }, 200);
    } else {
      captureAndSend();
    }
  };

  const captureAndSend = async () => {
    // Draw from video first
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get dataUrl and blob first
    const dataUrl = canvas.toDataURL('image/png');
    
    // Convert to blob
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png');
    });
    
    if (!blob) {
      console.error('Failed to create blob from canvas');
      return;
    }

    // Start generation with the blob
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
      <video
        id="webcam"
        ref={videoRef}
        autoPlay
        playsInline
        muted
      />
    </div>
  );

  // -------------------------
  //   Selected Photo Display
  // -------------------------
  const renderSelectedPhoto = () => {
    const currentPhoto = photos[selectedPhotoIndex];
    if (!currentPhoto) return null;

    // If still generating and no images, show "..."
    if (currentPhoto.generating && currentPhoto.images.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="animate-pulse text-gray-300 text-3xl">
            ...
          </div>
        </div>
      );
    }

    // If error and no images, show error
    if (currentPhoto.error && currentPhoto.images.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="text-red-500 p-4">{currentPhoto.error}</div>
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

    return (
      <>
        <img
          src={imageUrl}
          alt="Selected"
          className="max-h-full max-w-full object-contain cursor-pointer"
          onClick={handleImageClick}
        />
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
  const renderControlPanel = () => (
    <div className="control-panel">
      {/* Row 1: style select + optional custom input */}
      <div className="control-panel-row">
        <div className="flex flex-col">
          <label className="text-white mb-1">Photobooth style:</label>
          <select
            className="px-4 py-2 rounded bg-gray-700 outline-none"
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
          >
            <option value="random">Random</option>
            <option value="anime">Anime</option>
            <option value="gorillaz">Gorillaz</option>
            <option value="disney">Disney</option>
            <option value="pixelArt">Pixel Art</option>
            <option value="steampunk">Steampunk</option>
            <option value="vaporwave">Vaporwave</option>
            <option value="astronaut">Astronaut</option>
            <option value="sketch">Sketch</option>
            <option value="statue">Statue</option>
            <option value="clown">Clown</option>
            <option value="relax">Relax</option>
            <option value="custom">Custom...</option>
          </select>
        </div>
        {selectedStyle === 'custom' && (
          <input
            type="text"
            placeholder="Custom style..."
            className="px-4 py-2 rounded bg-gray-600 text-white outline-none ml-2"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
        )}
      </div>

      {/* Row 2: Take Photo + Settings button side by side */}
      <div className="control-panel-row">
        <button
          className={`px-4 py-2 rounded hover:bg-blue-700 transition ${
            isSogniReady ? 'bg-blue-600' : 'bg-gray-500 cursor-not-allowed'
          }`}
          onClick={() => {
            if (selectedPhotoIndex !== null) {
              setSelectedPhotoIndex(null);
              setSelectedSubIndex(0);
            } else {
              handleTakePhoto();
            }
          }}
          disabled={!isSogniReady}
        >
          {selectedPhotoIndex !== null ? 'Back to Camera' : 'Take Photo'}
        </button>

        {/* Settings gear icon: narrower button */}
        <button
          className="text-gray-300 hover:text-white bg-gray-700 px-3 py-2 rounded flex items-center justify-center"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
          style={{ width: '42px' }}
        >
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11 2v2.07a7.962 7.962 0 0 0-5.66 3.3l-1.48-.85-2 3.46 1.48.85a8.033 8.033 0 0 0 0 6.18l-1.48.85 2 3.46 1.48-.85A7.962 7.962 0 0 0 11 19.93V22h2v-2.07a7.962 7.962 0 0 0 5.66-3.3l1.48.85 2-3.46-1.48-.85a8.033 8.033 0 0 0 0-6.18l1.48-.85-2-3.46-1.48.85A7.962 7.962 0 0 0 13 4.07V2h-2Zm1 6a4 4 0 1 1-4 4 4.002 4.002 0 0 1 4-4Z"/>
          </svg>
        </button>
      </div>

      {showSettings && (
        <div className="bg-gray-700 p-3 rounded mt-2 space-y-3">
          {/* Camera selector if more than 1 device found */}
          {cameraDevices.length > 0 && (
            <label className="flex flex-col">
              <span>Camera:</span>
              <select
                className="px-2 py-1 mt-1 rounded bg-gray-600 text-white outline-none"
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
            </label>
          )}

          {/* Model selector */}
          <label className="flex flex-col">
            <span>Pick an Image Model:</span>
            <select
              className="px-2 py-1 mt-1 rounded bg-gray-600 text-white outline-none"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {modelOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>

          {/* Number of Images slider */}
          <label className="flex flex-col space-y-1">
            <span>Number of Images: {numImages}</span>
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={numImages}
              onChange={(e) => setNumImages(parseInt(e.target.value))}
              className="w-full"
            />
          </label>

          {/* Prompt Guidance slider */}
          <label className="flex flex-col space-y-1">
            <span>Prompt Guidance: {promptGuidance.toFixed(1)}</span>
            <input
              type="range"
              min={2}
              max={3}
              step={0.1}
              value={promptGuidance}
              onChange={(e) => setPromptGuidance(parseFloat(e.target.value))}
              className="w-full"
            />
          </label>

          {/* Instant ID Strength slider */}
          <label className="flex flex-col space-y-1">
            <span>Instant ID Strength: {controlNetStrength.toFixed(1)}</span>
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.1}
              value={controlNetStrength}
              onChange={(e) => setControlNetStrength(parseFloat(e.target.value))}
              className="w-full"
            />
          </label>

          {/* Instant ID Impact Stop slider */}
          <label className="flex flex-col space-y-1">
            <span>Instant ID Impact Stop: {controlNetGuidanceEnd.toFixed(1)}</span>
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.1}
              value={controlNetGuidanceEnd}
              onChange={(e) => setControlNetGuidanceEnd(parseFloat(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={flashEnabled}
              onChange={(e) => setFlashEnabled(e.target.checked)}
            />
            <span>Flash</span>
          </label>

          {/* Per-style realism slider */}
          <label className="flex flex-col space-y-1">
            <span>Realism for {selectedStyle}: {styleRealism[selectedStyle]}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={styleRealism[selectedStyle]}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setStyleRealism((prev) => ({
                  ...prev,
                  [selectedStyle]: val
                }));
              }}
            />
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={keepOriginalPhoto}
              onChange={(e) => setKeepOriginalPhoto(e.target.checked)}
            />
            <span>Keep Original Image</span>
          </label>
        </div>
      )}
    </div>
  );

  // -------------------------
  //   Thumbnails at bottom
  // -------------------------
  const renderGallery = () => (
    <div style={{ 
      position: 'absolute', 
      bottom: '30px', 
      left: '0', 
      right: '0', 
      display: 'flex',
      justifyContent: 'center',
      zIndex: 50,
      maxWidth: '100vw',
      overflow: 'hidden'
    }}>
      {photos.length > 0 && (
        <div style={{
          background: 'black',
          position: 'relative',
          overflow: 'visible',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          maxWidth: 'calc(100vw - 40px)',
          borderRadius: '0',
          padding: '0',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Top sprocket holes */}
          <div style={{
            height: '16px',
            backgroundColor: 'black',
            display: 'flex',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            padding: '0 3px'
          }}>
            {Array(20).fill(null).map((_, i) => (
              <div key={`hole-top-${i}`} style={{
                width: '14px',
                height: '8px',
                backgroundColor: 'transparent',
                border: '1px solid #333',
                borderRadius: '1px'
              }} />
            ))}
          </div>
          
          {/* Film content area */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            backgroundColor: '#221b15',
            borderTop: '1px solid #444',
            borderBottom: '1px solid #444',
            paddingTop: '3px',
            paddingBottom: '3px',
            paddingLeft: '5px',
            paddingRight: '5px',
            overflowX: 'auto',
            overflowY: 'hidden',
            maxWidth: 'calc(100vw - 40px)',
            scrollbarWidth: 'thin',
            scrollbarColor: '#444 #221b15',
            msOverflowStyle: 'none' /* IE and Edge */
          }}
          className="hide-scrollbar" /* Add custom class for webkit browsers */
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

              // If generating + no images => show loading animation
              if (photo.loading && photo.images.length === 0) {
                return (
                  <div
                    key={photo.id}
                    className="flex flex-col items-center justify-center bg-gray-700 relative overflow-hidden"
                    style={{ 
                      width: `${thumbnailWidth}px`, 
                      height: `${thumbnailHeight}px`,
                      borderRadius: '2px',
                      flexShrink: 0,
                      border: '1px solid #111',
                      boxShadow: 'inset 0 0 5px rgba(0,0,0,0.5)',
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 250 250\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
                      backgroundBlendMode: 'overlay',
                      opacity: 0.9,
                      margin: '0 5px'
                    }}
                  >
                    {/* Film grain overlay */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(40, 40, 40, 0.6)',
                    }}></div>
                    
                    {/* Frame number */}
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      fontSize: '14px',
                      color: '#999',
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      zIndex: 5
                    }}>
                      {frameNumber}
                    </div>
                    <div className="w-20 h-20 border-4 border-gray-700 border-t-transparent rounded-full animate-spin" style={{zIndex: 6}}></div>
                  </div>
                );
              }

              // If error + no images => "Err"
              if (photo.error && photo.images.length === 0) {
                return (
                  <div
                    key={photo.id}
                    className="flex items-center justify-center text-red-500 bg-gray-700"
                    style={{ 
                      width: `${thumbnailWidth}px`, 
                      height: `${thumbnailHeight}px`,
                      borderRadius: '2px',
                      flexShrink: 0,
                      border: '1px solid #111',
                      boxShadow: 'inset 0 0 5px rgba(0,0,0,0.5)',
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 250 250\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
                      backgroundBlendMode: 'overlay',
                      opacity: 0.9,
                      margin: '0 5px'
                    }}
                  >
                    {/* Film grain overlay */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(60, 20, 20, 0.6)',
                    }}></div>
                    
                    {/* Frame number */}
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      fontSize: '14px',
                      color: '#999',
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      zIndex: 5
                    }}>
                      {frameNumber}
                    </div>
                    <div className="text-lg text-center px-3 py-1 font-bold" style={{zIndex: 6, textShadow: '0 0 4px #000'}}>Error</div>
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
                  className="thumbnail-container"
                  style={{ 
                    width: `${thumbnailWidth}px`, 
                    height: `${thumbnailHeight}px`,
                    flexShrink: 0,
                    position: 'relative',
                    border: '1px solid #111',
                    boxShadow: '0 3px 6px rgba(0,0,0,0.5)',
                    backgroundColor: '#333',
                    overflow: 'hidden',
                    margin: '0 5px'
                  }}
                >
                  {/* Film grain overlay for completed images */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 250 250\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'1.4\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
                    backgroundBlendMode: 'overlay',
                    opacity: 0.15,
                    pointerEvents: 'none',
                    zIndex: 4
                  }}></div>

                  {/* Frame number */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    fontSize: '14px',
                    color: '#fff',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    zIndex: 5
                  }}>
                    {frameNumber}
                  </div>

                  {/* Show an X if selected */}
                  {isSelected && (
                    <div
                      className="thumbnail-delete-button"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 10,
                        fontSize: '16px'
                      }}
                      onClick={() => handleDeletePhoto(i)}
                    >
                      X
                    </div>
                  )}

                  <img
                    src={thumbUrl}
                    alt={`Generated #${i}`}
                    className={
                      `thumbnail ${isSelected ? 'selected' : ''} ` +
                      (photo.newlyArrived ? 'thumbnail-fade' : '')
                    }
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover',
                      borderRadius: '2px',
                      border: isSelected ? '3px solid #f59e0b' : 'none'
                    }}
                    onClick={handleThumbClick}
                  />

                  {/* If multiple images, show stack count */}
                  {photo.images.length > 1 && (
                    <div className="stack-count" style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      zIndex: 10
                    }}>
                      x{photo.images.length}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Bottom sprocket holes */}
          <div style={{
            height: '16px',
            backgroundColor: 'black',
            display: 'flex',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            padding: '0 3px'
          }}>
            {Array(20).fill(null).map((_, i) => (
              <div key={`hole-bottom-${i}`} style={{
                width: '14px',
                height: '8px',
                backgroundColor: 'transparent',
                border: '1px solid #333',
                borderRadius: '1px'
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // -------------------------
  //   Render
  // -------------------------
  return (
    <div
      className="relative w-full h-screen"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragActive && (
        <div className="drag-overlay">
          <p>Drop your image here to generate!</p>
        </div>
      )}

      {/* Main area with video in the background */}
      {renderMainArea()}

      <canvas ref={canvasRef} className="hidden" />

      {/* Control panel (top-left) */}
      {renderControlPanel()}

      {/* Overlays */}
      {countdown > 0 && (
        <div className="countdown-overlay">
          {countdown}
        </div>
      )}
      {showFlash && <div className="flash-overlay" />}

      {/* Thumbnail strip at bottom */}
      {renderGallery()}

      {/* Selected photo placed in normal flow below pinned elements */}
      {selectedPhotoIndex !== null && (
        <div className="selected-photo-container" style={{ zIndex: 200 }}>
          {renderSelectedPhoto()}
        </div>
      )}

      {/* Camera shutter sound */}
      <audio ref={shutterSoundRef} preload="auto">
        <source src={clickSound} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default App;

