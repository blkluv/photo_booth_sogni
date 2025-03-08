import React, { useRef, useEffect, useState } from 'react';
import { SogniClient } from "@sogni-ai/sogni-client";

/**
 * Prompts for each style, used when generating images with Sogni
 */
const stylePrompts = {
  gorillaz: `A vibrant, stylized cartoon band portrait inspired by the edgy, urban comic style of "Gorillaz." Bold, inky outlines and gritty details, with slightly exaggerated facial features and a rebellious attitude. A blend of punk, hip-hop, and futuristic aesthetics. Characters posed in front of a graffiti-covered cityscape, evoking the moody, dystopian vibe of modern pop culture. Sharp contrasts and dramatic shadows, muted yet punchy color palette, clean character silhouettes, high detail, cinematic lighting. 4K resolution, high-quality illustration.`,
  anime: `A colorful and vibrant anime-style portrait, highly detailed with smooth shading, expressive large eyes, dynamic pose, and clean lines. Soft yet vivid color palette, captivating expression, detailed background with Japanese-inspired elements, cinematic lighting, and high-resolution.`
};

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // The style selected by the user (anime/gorillaz).
  const [selectedStyle, setSelectedStyle] = useState('anime');

  // An array of photos the user has generated:
  // each item is { id, generating, url (generated image), error }.
  const [photos, setPhotos] = useState([]);

  // For a full-screen modal of a selected photo.
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

  // Countdown state: if > 0, shows countdown overlay, then triggers capture.
  const [countdown, setCountdown] = useState(0);

  // Track whether we should show a flash overlay.
  const [showFlash, setShowFlash] = useState(false);

  // Reuse a single Sogni client instance across captures
  const [sogniClient, setSogniClient] = useState(null);
  const [isSogniReady, setIsSogniReady] = useState(false);

  useEffect(() => {
    // Start the webcam feed when the component mounts.
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => alert(`Error accessing webcam: ${err}`));
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
   * and adds a new item to the 'photos' list.
   */
  const captureAndSend = async () => {
    // Create a placeholder photo entry for "generating" in the photos array.
    const newPhoto = {
      id: Date.now(),
      generating: true,
      url: null,
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
          numberOfImages: 1,
          startingImage: new Uint8Array(arrayBuffer),
          startingImageStrength: 0.50,
          scheduler: 'DPM Solver Multistep (DPM-Solver++)',
          timeStepSpacing: 'Karras',
        });

        // When generation completes, store the final image in our photos array
        project.on('completed', (data) => {
          setPhotos(prevPhotos => {
            const updated = [...prevPhotos];
            updated[newPhotoIndex] = {
              ...updated[newPhotoIndex],
              generating: false,
              url: data[0],
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
              url: null,
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
            url: null,
            error: `Capture/Send error: ${err}`
          };
          return updated;
        });
      }
    }, 'image/png');
  };

  /**
   * Renders the thumbnail gallery for all generated photos.
   */
  const renderGallery = () => {
    return (
      <div className="thumbnail-gallery absolute bottom-0 left-0 right-0">
        {photos.map((photo, i) => {
          // If no URL but generating or error, show placeholders
          if (!photo.url) {
            if (photo.error) {
              // Error placeholder
              return (
                <div
                  key={photo.id}
                  className="flex items-center justify-center text-red-500 bg-gray-700 w-20 h-20"
                >
                  Err
                </div>
              );
            } else {
              // Generating placeholder
              return (
                <div
                  key={photo.id}
                  className="flex items-center justify-center text-gray-300 bg-gray-700 w-20 h-20 animate-pulse"
                >
                  ...
                </div>
              );
            }
          }

          // Normal thumbnail image
          return (
            <img
              key={photo.id}
              src={photo.url}
              alt={`Generated ${i}`}
              className="thumbnail"
              onClick={() => setSelectedPhotoIndex(i)}
            />
          );
        })}
      </div>
    );
  };

  /**
   * Renders a modal if a photo is selected for full screen.
   */
  const renderModal = () => {
    if (selectedPhotoIndex === null) return null;
    const photo = photos[selectedPhotoIndex];
    if (!photo || !photo.url) return null;

    return (
      <div className="modal-overlay" onClick={() => setSelectedPhotoIndex(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <img src={photo.url} alt="Full Screen" />
          <button
            className="close-button"
            onClick={() => setSelectedPhotoIndex(null)}
          >
            X
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col w-full h-screen items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        className="w-full h-full object-cover"
      />

      <canvas ref={canvasRef} className="hidden" />

      {/* Style selector and "Take Photo" button */}
      <div className="absolute top-4 left-4 bg-gray-800 bg-opacity-70 p-4 rounded-lg shadow-xl">
        <select
          className="px-4 py-2 rounded bg-gray-700 mb-2 outline-none"
          value={selectedStyle}
          onChange={(e) => setSelectedStyle(e.target.value)}
        >
          <option value="anime">Anime</option>
          <option value="gorillaz">Gorillaz</option>
        </select>

        {countdown > 0 ? (
          <button
            className="px-4 py-2 bg-blue-600 rounded opacity-50 cursor-default"
            disabled
          >
            {countdown}
          </button>
        ) : (
          <button
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition"
            onClick={handleTakePhoto}
            disabled={!isSogniReady}
          >
            {isSogniReady ? 'Take Photo' : 'Loading...'}
          </button>
        )}
      </div>

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

      {/* Full-screen image modal */}
      {renderModal()}
    </div>
  );
};

export default App;
