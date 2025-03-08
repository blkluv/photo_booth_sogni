import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SogniClient } from "@sogni-ai/sogni-client";

/**
 * Prompts for each style, used when generating images with Sogni
 */
const stylePrompts = {
  anime: `A colorful and vibrant anime-style portrait, highly detailed with smooth shading, expressive large eyes, dynamic pose, and clean lines. Soft yet vivid color palette, captivating expression, detailed background with Japanese-inspired elements, cinematic lighting, and high-resolution.`,
  gorillaz: `A vibrant, stylized cartoon band portrait inspired by the edgy, urban comic style of "Gorillaz." Bold, inky outlines and gritty details, with slightly exaggerated facial features and a rebellious attitude. A blend of punk, hip-hop, and futuristic aesthetics, set against a graffiti-covered cityscape.`,
  disney: `A magical, whimsical Disney-inspired portrait with bright colors, large expressive eyes, soft outlines, and a fairytale atmosphere. Princess-like attire, dreamy background elements, and a charming, uplifting mood.`,
  pixelArt: `A retro pixel art style portrait with 8-bit color palette, blocky forms, and visible pixelation. Nostalgic and charming, reminiscent of classic arcade or console games from the 80s and 90s.`,
  steampunk: `A retro-futuristic steampunk style portrait featuring brass goggles, gears, clockwork elements, Victorian fashion, and a smoky, industrial atmosphere. Intricate mechanical details, warm metallic tones, and a sense of invention.`,
  vaporwave: `A dreamy, neon vaporwave portrait with pastel gradients, retro 80s aesthetics, glitch effects, palm trees, and classic Greek statue motifs. Vibrant pink, purple, and cyan color palette, set in a cyber-futuristic cityscape.`
};

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // The style selected by the user
  const [selectedStyle, setSelectedStyle] = useState('anime');

  // An array of photos the user has generated:
  // Each item is { id, generating, images: array of strings, error }.
  const [photos, setPhotos] = useState([]);

  // The currently selected photo index in the strip (null => live webcam)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

  // Within a selected photo, which image in its stack are we displaying?
  // e.g. 0 => first, 1 => second, etc.
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);

  // Countdown state: if > 0, shows countdown overlay, then triggers capture.
  const [countdown, setCountdown] = useState(0);

  // Track whether we should show a flash overlay.
  const [showFlash, setShowFlash] = useState(false);

  // Reuse a single Sogni client instance across captures
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // --------------------------
  //  Initialization
  // --------------------------
  useEffect(() => {
    // Start the webcam feed when the component mounts.
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user' // front-facing camera
      }
    })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        alert(`Error accessing webcam: ${err}`);
      });
  }, []);

  useEffect(() => {
    // Create and log into Sogni only once
    const initSogni = async () => {
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

    initSogni();
  }, []);

  // --------------------------
  //  Keyboard Navigation
  // --------------------------
  const handleKeyDown = useCallback((e) => {
    // Only if a photo is selected
    if (selectedPhotoIndex !== null) {
      // Left arrow: show previous photo in the strip
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedPhotoIndex((idx) => {
          const newIdx = Math.max(0, idx - 1);
          setSelectedSubIndex(0); // reset sub-index
          return newIdx;
        });
      }
      // Right arrow: show next photo in the strip
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedPhotoIndex((idx) => {
          const newIdx = Math.min(photos.length - 1, idx + 1);
          setSelectedSubIndex(0); // reset sub-index
          return newIdx;
        });
      }
      // Up arrow: previous image in the current photo's stack
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSubIndex((subIdx) => {
          const maxImages = photos[selectedPhotoIndex]?.images.length || 1;
          return Math.max(0, subIdx - 1);
        });
      }
      // Down arrow: next image in the stack
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSubIndex((subIdx) => {
          const maxImages = photos[selectedPhotoIndex]?.images.length || 1;
          return Math.min(maxImages - 1, subIdx + 1);
        });
      }
    }
  }, [photos, selectedPhotoIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // --------------------------
  //  Capturing / Sogni logic
  // --------------------------
  /**
   * Handles the entire "take photo" sequence:
   * 1) Start countdown from 3 to 1
   * 2) Flash the screen
   * 3) Capture photo and send to Sogni
   */
  const handleTakePhoto = () => {
    // If Sogni isn't ready, don't allow capturing yet
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Try again in a moment.');
      return;
    }

    // Immediately set countdown to 3 and start a 1-second interval.
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          // On countdown finish, flash, then capture.
          triggerFlashAndCapture();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /**
   * Flashes the screen white briefly, then calls captureAndSend
   */
  const triggerFlashAndCapture = () => {
    setShowFlash(true);
    setTimeout(() => {
      setShowFlash(false);
      captureAndSend();
    }, 200); // flash for 200ms
  };

  /**
   * Captures the current frame from webcam, sends it to Sogni for generation,
   * and adds a new item to the 'photos' list. (With numberOfImages=4)
   */
  const captureAndSend = async () => {
    // Create a placeholder photo entry for "generating"
    const newPhoto = {
      id: Date.now(),
      generating: true,
      images: [],
      error: null
    };
    setPhotos(prev => [...prev, newPhoto]);
    const newPhotoIndex = photos.length; // index of this newly added photo

    // Capture the canvas
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob -> array buffer -> send to Sogni
    canvas.toBlob(async (snapshotBlob) => {
      try {
        const arrayBuffer = await snapshotBlob.arrayBuffer();

        const project = await sogniClient.projects.create({
          modelId: 'flux1-schnell-fp8',
          positivePrompt: stylePrompts[selectedStyle],
          sizePreset: "landscape_9_7",
          steps: 4,
          guidance: 3,
          numberOfImages: 4, // generate a stack of 4 images
          startingImage: new Uint8Array(arrayBuffer),
          startingImageStrength: 0.50,
          scheduler: 'DPM Solver Multistep (DPM-Solver++)',
          timeStepSpacing: 'Karras',
        });

        // When generation completes, store the final images in our photos array
        project.on('completed', (data) => {
          // data is an array of 4 images
          setPhotos(prevPhotos => {
            const updated = [...prevPhotos];
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              images: data, // store the 4 resulting images
              error: null
            };
            return updated;
          });
        });

        // If generation fails, store the error
        project.on('failed', (err) => {
          setPhotos(prevPhotos => {
            const updated = [...prevPhotos];
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              images: [],
              error: `Generation failed: ${err}`
            };
            return updated;
          });
        });

      } catch (err) {
        // Some error while uploading or logging in
        setPhotos(prevPhotos => {
          const updated = [...prevPhotos];
          updated[newPhotoIndex] = {
            ...updated[newPhotoIndex],
            generating: false,
            images: [],
            error: `Capture/Send error: ${err}`
          };
          return updated;
        });
      }
    }, 'image/png');
  };

  // --------------------------
  //  Deletion
  // --------------------------
  const handleDeletePhoto = (photoIndex) => {
    setPhotos(prev => prev.filter((_, i) => i !== photoIndex));
    // If the deleted photo is selected, revert to webcam
    if (photoIndex === selectedPhotoIndex) {
      setSelectedPhotoIndex(null);
      setSelectedSubIndex(0);
    } else if (photoIndex < selectedPhotoIndex) {
      // If we delete something before the current selection, shift the selection index
      setSelectedPhotoIndex((idx) => idx - 1);
    }
  };

  // --------------------------
  //  Main Area Rendering
  // --------------------------
  /**
   * Renders the main area:
   * - If no photo is selected, show the live video
   * - If a photo is selected, show that subIndex image
   *   (clicking on it cycles to the next image in its stack)
   */
  const renderMainArea = () => {
    if (selectedPhotoIndex == null) {
      // Show the video feed (with iOS Safari fix: playsInline, muted)
      return (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      );
    }
    // Show the selected photo
    const currentPhoto = photos[selectedPhotoIndex];
    if (!currentPhoto || currentPhoto.images.length === 0) {
      // If no images or there's an error (or still generating), show a placeholder
      if (currentPhoto?.error) {
        return (
          <div className="fullscreen-photo-container">
            <div className="text-red-500 p-4">
              {currentPhoto.error}
            </div>
          </div>
        );
      } else {
        // Generating
        return (
          <div className="fullscreen-photo-container">
            <div className="animate-pulse text-gray-300 text-3xl">Generating...</div>
          </div>
        );
      }
    }
    // Show the selected image from the stack
    const imageUrl = currentPhoto.images[selectedSubIndex];

    // When we click on the image, go to next index in the stack (wrap around)
    const handleImageClick = () => {
      setSelectedSubIndex((prev) => {
        const max = currentPhoto.images.length;
        return (prev + 1) % max;
      });
    };

    return (
      <div className="fullscreen-photo-container">
        <img
          src={imageUrl}
          alt="Selected"
          className="max-h-full max-w-full object-contain cursor-pointer"
          onClick={handleImageClick}
        />
        {/* Show "X/Y" in top-right corner */}
        <div className="stack-index-indicator">
          {selectedSubIndex + 1}/{currentPhoto.images.length}
        </div>
      </div>
    );
  };

  // --------------------------
  //  Controls Rendering
  // --------------------------
  /**
   * We keep the label "Take Photo" on the button at all times,
   * but if a photo is selected, the button is half-dimmed
   * and clicking it simply goes back to the camera feed (instead of capturing).
   * Once the camera feed is showing, the next click does the normal capture flow.
   */
  const handleTakePhotoButtonClick = () => {
    if (selectedPhotoIndex !== null) {
      // Currently in "preview mode"
      // => Switch back to camera feed
      setSelectedPhotoIndex(null);
      setSelectedSubIndex(0);
    } else {
      // Currently in camera mode => proceed with normal "take photo" flow
      handleTakePhoto();
    }
  };

  const renderControls = () => {
    const isInPreview = selectedPhotoIndex !== null;

    return (
      <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-70 p-4 rounded-lg shadow-xl">
        <select
          className="px-4 py-2 rounded bg-gray-700 mb-2 outline-none"
          value={selectedStyle}
          onChange={(e) => setSelectedStyle(e.target.value)}
        >
          <option value="anime">Anime</option>
          <option value="gorillaz">Gorillaz</option>
          <option value="disney">Disney</option>
          <option value="pixelArt">Pixel Art</option>
          <option value="steampunk">Steampunk</option>
          <option value="vaporwave">Vaporwave</option>
        </select>

        <button
          className={`px-4 py-2 rounded hover:bg-blue-700 transition ${
            isSogniReady ? 'bg-blue-600' : 'bg-gray-500 cursor-not-allowed'
          } ${isInPreview ? 'opacity-50' : ''}`}
          onClick={handleTakePhotoButtonClick}
          disabled={!isSogniReady}
        >
          Take Photo
        </button>
      </div>
    );
  };

  // --------------------------
  //  Thumbnails Rendering
  // --------------------------
  /**
   * Renders the thumbnail gallery at the bottom
   */
  const renderGallery = () => {
    return (
      <div className="thumbnail-gallery absolute bottom-0 left-0 right-0">
        {photos.map((photo, i) => {
          const isSelected = i === selectedPhotoIndex;

          // If still generating or has error, we show placeholders
          if (photo.generating && photo.images.length === 0) {
            return (
              <div
                key={photo.id}
                className="flex items-center justify-center text-gray-300 bg-gray-700 w-20 h-20 animate-pulse"
              >
                ...
              </div>
            );
          }

          if (photo.error && photo.images.length === 0) {
            // Error placeholder
            return (
              <div
                key={photo.id}
                className="flex items-center justify-center text-red-500 bg-gray-700 w-20 h-20"
              >
                Err
              </div>
            );
          }

          // Show the first image in the stack as the thumbnail preview
          const thumbnailUrl = photo.images[0] || '';

          return (
            <div
              key={photo.id}
              className="thumbnail-container"
            >
              {/* "X" delete button in top-left corner if selected */}
              {isSelected && (
                <div
                  className="thumbnail-delete-button"
                  onClick={() => handleDeletePhoto(i)}
                >
                  X
                </div>
              )}

              <img
                src={thumbnailUrl}
                alt={`Generated #${i}`}
                className={`thumbnail ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedPhotoIndex(i);
                  setSelectedSubIndex(0);
                }}
              />

              {/* If there's a stack of images, show "xN" in bottom-right corner */}
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
  };

  // --------------------------
  //  Main Component Return
  // --------------------------
  return (
    <div className="relative flex flex-col w-full h-screen items-center justify-center">
      {/* Main area: either video or selected photo */}
      {renderMainArea()}

      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Floating controls in top-left */}
      {renderControls()}

      {/* Countdown overlay */}
      {countdown > 0 && (
        <div className="countdown-overlay">
          {countdown}
        </div>
      )}

      {/* Flash overlay */}
      {showFlash && (
        <div className="flash-overlay" />
      )}

      {/* Thumbnail gallery at the bottom */}
      {renderGallery()}
    </div>
  );
};

export default App;
