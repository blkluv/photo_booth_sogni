// ./src/App.jsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SogniClient } from "@sogni-ai/sogni-client";

/**
 * Default style prompts
 */
const defaultStylePrompts = {
  anime: `A colorful and vibrant anime-style portrait, highly detailed with smooth shading, expressive large eyes, dynamic pose, and clean lines. Soft yet vivid color palette, captivating expression, detailed background with Japanese-inspired elements, cinematic lighting, and high-resolution.`,
  gorillaz: `A vibrant, stylized cartoon band portrait inspired by the edgy, urban comic style of "Gorillaz." Bold, inky outlines and gritty details, with slightly exaggerated facial features and a rebellious attitude. A blend of punk, hip-hop, and futuristic aesthetics, set against a graffiti-covered cityscape.`,
  disney: `A magical, whimsical Disney-inspired portrait with bright colors, large expressive eyes, soft outlines, and a fairytale atmosphere. Princess-like attire, dreamy background elements, and a charming, uplifting mood.`,
  pixelArt: `A retro pixel art style portrait with 8-bit color palette, blocky forms, and visible pixelation. Nostalgic and charming, reminiscent of classic arcade or console games from the 80s and 90s.`,
  steampunk: `A retro-futuristic steampunk style portrait featuring brass goggles, gears, clockwork elements, Victorian fashion, and a smoky, industrial atmosphere. Intricate mechanical details, warm metallic tones, and a sense of invention.`,
  vaporwave: `A dreamy, neon vaporwave portrait with pastel gradients, retro 80s aesthetics, glitch effects, palm trees, and classic Greek statue motifs. Vibrant pink, purple, and cyan color palette, set in a cyber-futuristic cityscape.`,
  custom: ``,
};

/** 
 * Return width/height for a given Sogni sizePreset 
 */
function getSizeForPreset(preset) {
  switch (preset) {
    case 'portrait_7_9':
      return { width: 512, height: 640 };
    case 'landscape_9_7':
      return { width: 640, height: 512 };
    default:
      return { width: 512, height: 640 };
  }
}

/** 
 * Helper: resize dataURL to match Sogni output dimension
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

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Style selection
  const [selectedStyle, setSelectedStyle] = useState('anime');
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
  const [realism, setRealism] = useState(45);
  // keep original (5th) by default
  const [keepOriginalPhoto, setKeepOriginalPhoto] = useState(true);

  // Sogni
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // Camera devices
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraDeviceId, setSelectedCameraDeviceId] = useState(null);

  // -------------------------
  //   Sogni initialization
  // -------------------------
  const initializeSogni = async () => {
    try {
      const sogni = await SogniClient.createInstance({
        appId: import.meta.env.VITE_SOGNI_APP_ID,
        testnet: true,
        network: 'fast',
        logLevel: 'warn',
      });

      await sogni.account.login(
        import.meta.env.VITE_SOGNI_USERNAME,
        import.meta.env.VITE_SOGNI_PASSWORD
      );

      setSogniClient(sogni);
      setIsSogniReady(true);
    } catch (error) {
      alert(`Failed initializing Sogni client: ${error}`);
    }
  };

  /**
   * Start the camera stream for a given deviceId or fallback.
   */
  const startCamera = useCallback(async (deviceId) => {
    // If no deviceId, fallback to the default facingMode: 'user'
    const constraints = deviceId
      ? { video: { deviceId } }
      : { video: { facingMode: 'user' } };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      alert(`Error accessing webcam: ${err}`);
    }
  }, []);

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
            // if on a rendered image, store that, go original
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

  // -------------------------
  //   Global 1s timer for generation countdown
  // -------------------------
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

  // -------------------------
  //   Capture / Sogni logic
  // -------------------------
  const handleTakePhoto = () => {
    if (!isSogniReady) {
      alert('Sogni is not ready yet.');
      return;
    }

    // Start a 3-second countdown for the shutter
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          triggerFlashAndCapture();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const triggerFlashAndCapture = () => {
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
    // orientation for Sogni
    const isPortrait = window.innerHeight > window.innerWidth;
    const sizePreset = isPortrait ? "portrait_7_9" : "landscape_9_7";

    // Create new photo object
    const newPhoto = {
      id: Date.now(),
      generating: true,
      images: [],
      error: null,
      originalDataUrl: null,
      newlyArrived: false,
      // Our new 10-second countdown for generation
      generationCountdown: 10,
    };
    setPhotos((prev) => [...prev, newPhoto]);
    const newPhotoIndex = photos.length;

    // Draw from video
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // store original dataURL
    const dataUrl = canvas.toDataURL('image/png');
    newPhoto.originalDataUrl = dataUrl;

    // Convert to arrayBuffer -> Sogni
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        // 1) Get the style prompt
        const stylePrompt = (selectedStyle === 'custom')
          ? (customPrompt || 'A custom style portrait')
          : defaultStylePrompts[selectedStyle];

        // 2) Call the describeImage API to get a textual description of the photo
        const photoDescription = await describeImage(blob);

        // 3) Combine them for a more relevant final prompt
        const combinedPrompt = stylePrompt + '\n' + photoDescription;

        // 4) Send to Sogni
        const arrayBuffer = await blob.arrayBuffer();
        const project = await sogniClient.projects.create({
          modelId: 'flux1-schnell-fp8',
          // Use the combined prompt
          positivePrompt: combinedPrompt,
          sizePreset,
          steps: 4,
          guidance: 1,
          numberOfImages: 4,
          startingImage: new Uint8Array(arrayBuffer),
          startingImageStrength: realism / 100,
          scheduler: 'DPM Solver Multistep (DPM-Solver++)',
          timeStepSpacing: 'Karras',
        });

        project.on('completed', async (generated) => {
          let finalImages = [...generated];

          // If keep original, resize + add as 5th
          if (keepOriginalPhoto && newPhoto.originalDataUrl) {
            const { width, height } = getSizeForPreset(sizePreset);
            const resizedOriginal = await resizeDataUrl(
              newPhoto.originalDataUrl, width, height
            );
            finalImages.push(resizedOriginal);
          }

          setPhotos((prevPhotos) => {
            const updated = [...prevPhotos];
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              generationCountdown: 0,  // Done generating
              images: finalImages,
              newlyArrived: true,
            };
            return updated;
          });
        });

        project.on('failed', (err) => {
          setPhotos((prevPhotos) => {
            const updated = [...prevPhotos];
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              generationCountdown: 0,
              images: [],
              error: `Generation failed: ${err}`,
            };
            return updated;
          });
        });
      } catch (err) {
        // possibly re-init on socket error
        if (err && err.code === 4015) {
          console.warn("Socket error (4015). Re-initializing Sogni.");
          setIsSogniReady(false);
          initializeSogni();
        }
        setPhotos((prevPhotos) => {
          const updated = [...prevPhotos];
          updated[newPhotoIndex] = {
            ...updated[newPhotoIndex],
            generating: false,
            generationCountdown: 0,
            images: [],
            error: `Capture/Send error: ${err}`,
          };
          return updated;
        });
      }
    }, 'image/png');
  };

  // Delete photo
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
    <div className="relative w-full h-full">
      {/* The video behind everything */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ height: '100%' }}
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
    const imageUrl = currentPhoto.images[selectedSubIndex];
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
          {selectedSubIndex + 1}/{currentPhoto.images.length}
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
        <select
          className="px-4 py-2 rounded bg-gray-700 outline-none"
          value={selectedStyle}
          onChange={(e) => setSelectedStyle(e.target.value)}
        >
          <option value="anime">Anime</option>
          <option value="gorillaz">Gorillaz</option>
          <option value="disney">Disney</option>
          <option value="pixelArt">Pixel Art</option>
          <option value="steampunk">Steampunk</option>
          <option value="vaporwave">Vaporwave</option>
          <option value="custom">Custom...</option>
        </select>

        {selectedStyle === 'custom' && (
          <input
            type="text"
            placeholder="Custom style..."
            className="px-4 py-2 rounded bg-gray-600 text-white outline-none"
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

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={flashEnabled}
              onChange={(e) => setFlashEnabled(e.target.checked)}
            />
            <span>Flash</span>
          </label>

          <label className="flex flex-col space-y-1">
            <span>Realism: {realism}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={realism}
              onChange={(e) => setRealism(parseInt(e.target.value))}
            />
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={keepOriginalPhoto}
              onChange={(e) => setKeepOriginalPhoto(e.target.checked)}
            />
            <span>Keep Original (5th Image)</span>
          </label>
        </div>
      )}
    </div>
  );

  // -------------------------
  //   Thumbnails at bottom
  // -------------------------
  const renderGallery = () => (
    <div className="thumbnail-gallery">
      {photos.map((photo, i) => {
        const isSelected = i === selectedPhotoIndex;

        // If generating + no images => show numeric countdown only
        if (photo.generating && photo.images.length === 0) {
          return (
            <div
              key={photo.id}
              className="flex items-center justify-center text-gray-300 bg-gray-700 w-20 h-20 animate-pulse"
            >
              {photo.generationCountdown > 0 ? (
                <div className="text-xl">{photo.generationCountdown}</div>
              ) : (
                <div className="text-xl">...</div>
              )}
            </div>
          );
        }

        // If error + no images => "Err"
        if (photo.error && photo.images.length === 0) {
          return (
            <div
              key={photo.id}
              className="flex items-center justify-center text-red-500 bg-gray-700 w-20 h-20"
            >
              Err
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
          <div key={photo.id} className="thumbnail-container">
            {/* Show an X if selected */}
            {isSelected && (
              <div
                className="thumbnail-delete-button"
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
              onClick={handleThumbClick}
            />

            {/* If multiple images, show stack count */}
            {photo.images.length > 1 && (
              <div className="stack-count">
                x{photo.images.length}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // -------------------------
  //   Render
  // -------------------------
  return (
    <div className="relative w-full h-screen">
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
        <div className="selected-photo-container">
          {renderSelectedPhoto()}
        </div>
      )}
    </div>
  );
};

export default App;
