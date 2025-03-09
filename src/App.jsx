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

  // The currently selected photo index in the strip (null => show webcam)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  // Which image in that photo's stack are we displaying?
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);

  // Countdown state: if > 0, shows countdown overlay, then triggers capture.
  const [countdown, setCountdown] = useState(0);

  // Track whether we should show a flash overlay.
  const [showFlash, setShowFlash] = useState(false);

  // Show/hide the settings panel
  const [showSettings, setShowSettings] = useState(false);
  // Toggle flash on/off
  const [flashEnabled, setFlashEnabled] = useState(true);
  // Realism from 0-100, default 45 -> used for startingImageStrength
  const [realism, setRealism] = useState(45);

  // Sogni client state
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  // --------------------------
  //  Sogni Initialization Function
  // --------------------------
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

  // --------------------------
  //  Initialization
  // --------------------------
  useEffect(() => {
    // Start the webcam feed when the component mounts.
    // The video element is always mounted so the stream stays active.
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => {
            console.warn("Video play error:", err);
          });
        }
      })
      .catch(err => {
        alert(`Error accessing webcam: ${err}`);
      });
    
    // Initialize Sogni client on mount.
    initializeSogni();
  }, []);

  // --------------------------
  //  (Optional) Ensure Webcam Resumes
  // --------------------------
  useEffect(() => {
    if (selectedPhotoIndex === null && videoRef.current) {
      videoRef.current.play().catch(err => {
        console.warn("Video re-play error:", err);
      });
    }
  }, [selectedPhotoIndex]);

  // --------------------------
  //  Preload Images
  // --------------------------
  const preloadImages = (urls) => {
    urls.forEach((url) => {
      const img = new Image();
      img.src = url; // This starts loading in the background
    });
  };

  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]) {
      preloadImages(photos[selectedPhotoIndex].images);
    }
  }, [selectedPhotoIndex, photos]);

  // --------------------------
  //  Keyboard Navigation
  // --------------------------
  const handleKeyDown = useCallback((e) => {
    if (selectedPhotoIndex !== null) {
      const currentPhoto = photos[selectedPhotoIndex];
      const maxImages = currentPhoto?.images?.length || 1;

      if (e.key === 'Escape') {
        setSelectedPhotoIndex(null);
        setSelectedSubIndex(0);
        return;
      }

      if (maxImages > 1) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSubIndex((subIdx) => (subIdx - 1 + maxImages) % maxImages);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSubIndex((subIdx) => (subIdx + 1) % maxImages);
        }
      }

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
    }
  }, [selectedPhotoIndex, photos]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // --------------------------
  //  Capturing / Sogni logic
  // --------------------------
  const handleTakePhoto = () => {
    if (!isSogniReady) {
      alert('Sogni is not ready yet. Try again in a moment.');
      return;
    }

    // Start countdown from 3
    setCountdown(3);
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
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
    const newPhoto = {
      id: Date.now(),
      generating: true,
      images: [],
      error: null,
    };
    setPhotos((prev) => [...prev, newPhoto]);
    const newPhotoIndex = photos.length; // index for this new photo

    // Draw the current video frame onto a canvas
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob -> array buffer -> send to Sogni
    canvas.toBlob(async (snapshotBlob) => {
      try {
        const arrayBuffer = await snapshotBlob.arrayBuffer();

        const project = await sogniClient.projects.create({
          modelId: 'flux1-schnell-fp8',
          positivePrompt: stylePrompts[selectedStyle],
          sizePreset: "landscape_9_7",
          steps: 4,
          guidance: 1,
          numberOfImages: 4,
          startingImage: new Uint8Array(arrayBuffer),
          startingImageStrength: realism / 100,
          scheduler: 'DPM Solver Multistep (DPM-Solver++)',
          timeStepSpacing: 'Karras',
        });

        project.on('completed', (data) => {
          setPhotos((prevPhotos) => {
            const updated = [...prevPhotos];
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              images: data,
              error: null,
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
              images: [],
              error: `Generation failed: ${err}`,
            };
            return updated;
          });
        });
      } catch (err) {
        // Check for the socket error and reinitialize Sogni if needed.
        if (err && err.code === 4015) {
          console.warn("Socket error detected (code 4015). Reinitializing Sogni client.");
          setIsSogniReady(false);
          initializeSogni();
        }
        setPhotos((prevPhotos) => {
          const updated = [...prevPhotos];
          updated[newPhotoIndex] = {
            ...updated[newPhotoIndex],
            generating: false,
            images: [],
            error: `Capture/Send error: ${err}`,
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
    setPhotos((prev) => {
      const newPhotos = [...prev];
      newPhotos.splice(photoIndex, 1);
      return newPhotos;
    });

    setSelectedPhotoIndex((currentIndex) => {
      if (currentIndex === null) return null;
      if (currentIndex === photoIndex) {
        const newIndex = currentIndex - 1;
        return newIndex < 0 ? null : newIndex;
      } else if (photoIndex < currentIndex) {
        return currentIndex - 1;
      }
      return currentIndex;
    });
    setSelectedSubIndex(0);
  };

  // --------------------------
  //  Main Area
  // --------------------------
  const renderMainArea = () => {
    return (
      <div className="relative w-full h-full">
        {/* Always rendered video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover absolute inset-0"
        />

        {/* Photo viewer overlay */}
        {selectedPhotoIndex !== null && (() => {
          const currentPhoto = photos[selectedPhotoIndex];
          if (!currentPhoto) return null;

          if (currentPhoto.generating && currentPhoto.images.length === 0) {
            return (
              <div className="fullscreen-photo-container absolute inset-0 flex flex-col items-center justify-center">
                <button
                  onClick={() => setSelectedPhotoIndex(null)}
                  className="absolute top-4 right-4 bg-gray-800 text-white px-2 py-1 rounded shadow"
                >
                  Close
                </button>
                <div className="animate-pulse text-gray-300 text-3xl">Generating...</div>
              </div>
            );
          }

          if (currentPhoto.error && currentPhoto.images.length === 0) {
            return (
              <div className="fullscreen-photo-container absolute inset-0 flex flex-col items-center justify-center">
                <button
                  onClick={() => setSelectedPhotoIndex(null)}
                  className="absolute top-4 right-4 bg-gray-800 text-white px-2 py-1 rounded shadow"
                >
                  Close
                </button>
                <div className="text-red-500 p-4">{currentPhoto.error}</div>
              </div>
            );
          }

          const imageUrl = currentPhoto.images[selectedSubIndex];
          const handleImageClick = () => {
            const max = currentPhoto.images.length;
            setSelectedSubIndex((prev) => (prev + 1) % max);
          };

          return (
            <div className="fullscreen-photo-container absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setSelectedPhotoIndex(null)}
                className="absolute top-4 right-4 bg-gray-800 text-white px-2 py-1 rounded shadow"
              >
                Close
              </button>

              <img
                src={imageUrl}
                alt="Selected"
                className="max-h-full max-w-full object-contain cursor-pointer"
                onClick={handleImageClick}
              />

              <div className="stack-index-indicator absolute top-4 right-16 text-xl bg-black bg-opacity-70 py-1 px-2 rounded">
                {selectedSubIndex + 1}/{currentPhoto.images.length}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // --------------------------
  //  Controls
  // --------------------------
  const handleTakePhotoButtonClick = () => {
    if (selectedPhotoIndex !== null) {
      setSelectedPhotoIndex(null);
      setSelectedSubIndex(0);
    } else {
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

        {/* Settings (cog) button */}
        <button
          className="ml-2 text-gray-300 hover:text-white"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          <svg
            width="22"
            height="22"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M11 2v2.07a7.962 7.962 0 0 0-5.66 3.3l-1.48-.85-2 3.46 1.48.85a8.033 8.033 0 0 0 0 6.18l-1.48.85 2 3.46 1.48-.85A7.962 7.962 0 0 0 11 19.93V22h2v-2.07a7.962 7.962 0 0 0 5.66-3.3l1.48.85 2-3.46-1.48-.85a8.033 8.033 0 0 0 0-6.18l1.48-.85-2-3.46-1.48.85A7.962 7.962 0 0 0 13 4.07V2h-2Zm1 6a4 4 0 1 1-4 4 4.002 4.002 0 0 1 4-4Z"/>
          </svg>
        </button>

        {/* Settings panel */}
        {showSettings && (
          <div className="bg-gray-700 p-3 rounded mt-2">
            <label className="flex items-center space-x-2 mb-2">
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
          </div>
        )}
      </div>
    );
  };

  // --------------------------
  //  Thumbnails
  // --------------------------
  const renderGallery = () => {
    return (
      <div className="thumbnail-gallery absolute bottom-0 left-0 right-0">
        {photos.map((photo, i) => {
          const isSelected = i === selectedPhotoIndex;

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
            return (
              <div
                key={photo.id}
                className="flex items-center justify-center text-red-500 bg-gray-700 w-20 h-20"
              >
                Err
              </div>
            );
          }

          const thumbUrl = photo.images[0] || '';
          const handleThumbClick = () => {
            setSelectedPhotoIndex(i);
            setSelectedSubIndex(0);
          };

          return (
            <div key={photo.id} className="thumbnail-container">
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
                className={`thumbnail ${isSelected ? 'selected' : ''}`}
                onClick={handleThumbClick}
              />

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
  //  Render
  // --------------------------
  return (
    <div className="relative flex flex-col w-full h-screen items-center justify-center">
      {renderMainArea()}
      <canvas ref={canvasRef} className="hidden" />
      {renderControls()}
      {countdown > 0 && (
        <div className="countdown-overlay">
          {countdown}
        </div>
      )}
      {showFlash && <div className="flash-overlay" />}
      {renderGallery()}
    </div>
  );
};

export default App;
