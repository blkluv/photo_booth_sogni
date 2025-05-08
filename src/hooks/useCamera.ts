import { useState, useEffect, useRef, MutableRefObject } from 'react';

interface CameraHookResult {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  cameraDevices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  isIOS: boolean;
  startCamera: (deviceId?: string) => Promise<void>;
  handleCameraSelection: (deviceId: string) => Promise<void>;
}

export function useCamera(): CameraHookResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const isIOS = (): boolean => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  };

  const startCamera = async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        await videoRef.current.play();
      }
    } catch (error) {
      console.error("Error starting camera:", error);
      throw error;
    }
  };

  const handleCameraSelection = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    await startCamera(deviceId);
  };

  useEffect(() => {
    // Get available camera devices
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameraDevices(videoDevices);
        
        // If no device is selected, select the first one
        if (!selectedDeviceId && videoDevices.length > 0) {
          void handleCameraSelection(videoDevices[0].deviceId);
        }
      })
      .catch(error => {
        console.error("Error getting camera devices:", error);
      });
  }, []);

  return {
    videoRef,
    cameraDevices,
    selectedDeviceId,
    isIOS: isIOS(),
    startCamera,
    handleCameraSelection,
  };
} 