import React, { useRef, useEffect, useState, useCallback } from "react";
import PropTypes from 'prop-types';
import { getCustomDimensions } from '../utils';

const Camera = ({
  onPhotoTaken,
  selectedCameraDeviceId,
  setSelectedCameraDeviceId,
  cameraDevices,
  setCameraDevices,
  flashEnabled,
  isSogniReady
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [showFlash, setShowFlash] = useState(false);
  const [showCameraError, setShowCameraError] = useState(false);

  // Get dimensions for camera
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions();

  // Start camera stream
  const startCamera = useCallback(async (deviceId) => {
    try {
      if (videoRef.current) {
        // Stop any existing stream
        const stream = videoRef.current.srcObject;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        videoRef.current.srcObject = null;
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPortrait = window.innerHeight > window.innerWidth;

      let constraints;
      if (isMobile) {
        const aspectRatio = isPortrait ? 7 / 9 : 9 / 7;
        constraints = deviceId
          ? {
              video: {
                deviceId,
                facingMode: "user",
                width: { ideal: isPortrait ? 896 : 1152 },
                height: { ideal: isPortrait ? 1152 : 896 },
                aspectRatio: { ideal: aspectRatio },
              },
            }
          : {
              video: {
                facingMode: "user",
                width: { ideal: isPortrait ? 896 : 1152 },
                height: { ideal: isPortrait ? 1152 : 896 },
                aspectRatio: { ideal: aspectRatio },
              },
            };
      } else {
        constraints = deviceId
          ? {
              video: {
                deviceId,
                width: { ideal: desiredWidth },
                height: { ideal: desiredHeight },
              },
            }
          : {
              video: {
                facingMode: "user",
                width: { ideal: desiredWidth },
                height: { ideal: desiredHeight },
              },
            };
      }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        if (isIOS) {
          videoRef.current.classList.add('ios-fix');
        }
        await videoRef.current.play().catch(err => {
          console.warn('Video play failed:', err);
        });
      }
    } catch (error) {
      console.error('Camera start error:', error);
      setShowCameraError(true);
    }
  }, [desiredWidth, desiredHeight]);

  // List available cameras
  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(videoDevices);
    } catch (error) {
      console.error('List cameras error:', error);
      setCameraDevices([]);
    }
  }, [setCameraDevices]);

  useEffect(() => {
    listCameras();
  }, []); // Run once on mount

  useEffect(() => {
    startCamera(selectedCameraDeviceId);
    return () => {
      // Cleanup: stop the stream when component unmounts or deviceId changes
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedCameraDeviceId, startCamera]);

  // Handler for taking a photo
  const handleTakePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !isSogniReady) return;

    if (flashEnabled) {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 150);
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob
    try {
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      const dataUrl = canvas.toDataURL('image/png');
      onPhotoTaken({ blob, dataUrl });
    } catch (error) {
      console.error('Error creating photo blob:', error);
    }
  };

  return (
    <div className="video-container">
      <video
        id="webcam"
        ref={videoRef}
        autoPlay
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
      />
      {showFlash && <div className="camera-flash" />}
      <div className="camera-controls">
        <button 
          className="take-photo-btn"
          onClick={handleTakePhoto}
          disabled={!isSogniReady}
        >
          Take Photo
        </button>
        <select
          className="camera-select"
          value={selectedCameraDeviceId || ""}
          onChange={(e) => setSelectedCameraDeviceId(e.target.value)}
        >
          {cameraDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || "Camera"}
            </option>
          ))}
        </select>
      </div>
      {showCameraError && (
        <div className="camera-error">
          Unable to access camera. Please check permissions and try again.
        </div>
      )}
    </div>
  );
};

Camera.propTypes = {
  onPhotoTaken: PropTypes.func.isRequired,
  selectedCameraDeviceId: PropTypes.string,
  setSelectedCameraDeviceId: PropTypes.func.isRequired,
  cameraDevices: PropTypes.array.isRequired,
  setCameraDevices: PropTypes.func.isRequired,
  flashEnabled: PropTypes.bool.isRequired,
  isSogniReady: PropTypes.bool.isRequired
};

export default Camera;
