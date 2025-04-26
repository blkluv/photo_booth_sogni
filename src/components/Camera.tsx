import React, { useRef, useEffect, useState } from 'react';
import { PhotoService } from '../services/PhotoService';
import { getCustomDimensions } from '../utils';

interface CameraProps {
  onPhotoTaken: (photo: { blob: Blob; dataUrl: string }) => void;
  flashEnabled: boolean;
  isSogniReady: boolean;
  isPhotoButtonCooldown: boolean;
  onCooldownStart: () => void;
  selectedCameraDeviceId: string | null;
}

const Camera: React.FC<CameraProps> = ({
  onPhotoTaken,
  flashEnabled,
  isSogniReady,
  isPhotoButtonCooldown,
  onCooldownStart,
  selectedCameraDeviceId
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Get dimensions for camera
  const { width: desiredWidth, height: desiredHeight } = getCustomDimensions();

  const startCamera = async (deviceId: string | null) => {
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

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        if (isIOS) {
          videoRef.current.classList.add("ios-fix");
        }
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (!deviceId && err instanceof Error && err.name === "OverconstrainedError") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            if (isIOS) videoRef.current.classList.add("ios-fix");
            await videoRef.current.play();
          }
        } catch (backupErr) {
          console.error('Backup camera error:', backupErr);
        }
      }
    }
  };

  useEffect(() => {
    startCamera(selectedCameraDeviceId);
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [selectedCameraDeviceId]);

  const handleTakePhoto = async () => {
    if (!isSogniReady || isPhotoButtonCooldown) return;
    
    onCooldownStart();

    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setCountdown(0);

    if (flashEnabled) {
      setShowFlash(true);
      setTimeout(() => {
        setShowFlash(false);
        captureFrame();
      }, 250);
    } else {
      captureFrame();
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const isPortrait = window.innerHeight > window.innerWidth;

    canvas.width = isPortrait ? 896 : 1152;
    canvas.height = isPortrait ? 1152 : 896;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;

    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let destX = 0;
    let destY = 0;
    let destWidth = canvas.width;
    let destHeight = canvas.height;

    if (videoAspect > canvasAspect) {
      sourceWidth = video.videoHeight * canvasAspect;
      const sourceX = (video.videoWidth - sourceWidth) / 2;
      ctx.drawImage(
        video,
        sourceX,
        0,
        sourceWidth,
        sourceHeight,
        destX,
        destY,
        destWidth,
        destHeight
      );
    } else {
      sourceHeight = video.videoWidth / canvasAspect;
      const sourceY = (video.videoHeight - sourceHeight) / 2;
      ctx.drawImage(
        video,
        0,
        sourceY,
        sourceWidth,
        sourceHeight,
        destX,
        destY,
        destWidth,
        destHeight
      );
    }

    const dataUrl = canvas.toDataURL("image/png");
    canvas.toBlob((blob) => {
      if (blob) {
        onPhotoTaken({ blob, dataUrl });
      }
    }, "image/png");
  };

  return (
    <div className="camera-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="camera-video"
      />
      <canvas ref={canvasRef} className="hidden" />
      {countdown > 0 && (
        <div className="countdown-overlay">{countdown}</div>
      )}
      {showFlash && <div className="flash-overlay" />}
      <button
        className="take-photo-btn"
        onClick={handleTakePhoto}
        disabled={!isSogniReady || isPhotoButtonCooldown}
      >
        Take Photo
      </button>
    </div>
  );
};

export default Camera; 