/**
 * Camera Service - Cross-platform camera detection and management
 */

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput';
  groupId?: string;
}

export interface CameraConstraints {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  width?: { ideal: number };
  height?: { ideal: number };
}

/**
 * Enumerate available camera devices
 * Handles cross-platform compatibility and permission requirements
 */
export const enumerateCameraDevices = async (): Promise<CameraDevice[]> => {
  try {
    // Check if mediaDevices is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn('Camera enumeration not supported in this browser');
      return [];
    }

    // First, try to get permission by requesting a basic stream
    // This is required on many browsers to get device labels
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      // Stop the temporary stream immediately
      tempStream.getTracks().forEach(track => track.stop());
    } catch (permissionError) {
      console.warn('Camera permission not granted, device labels may be empty:', permissionError);
    }

    // Enumerate devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices
      .filter(device => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
        kind: device.kind as 'videoinput',
        groupId: device.groupId,
      }));

          console.log(`📹 Found ${videoDevices.length} camera device(s):`);
      videoDevices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${getCameraDisplayName(device, index)} (ID: ${device.deviceId})`);
      });
      
      return videoDevices;
  } catch (error) {
    console.error('Error enumerating camera devices:', error);
    return [];
  }
};

/**
 * Get a friendly display name for a camera device
 */
export const getCameraDisplayName = (device: CameraDevice, index: number): string => {
  if (device.label && device.label !== `Camera ${index + 1}`) {
    return device.label;
  }

  // Try to infer camera type from deviceId or other properties
  const deviceId = device.deviceId.toLowerCase();
  
  if (deviceId.includes('front') || deviceId.includes('user')) {
    return `Front Camera ${index + 1}`;
  } else if (deviceId.includes('back') || deviceId.includes('environment')) {
    return `Back Camera ${index + 1}`;
  } else if (deviceId.includes('usb')) {
    return `USB Camera ${index + 1}`;
  } else if (deviceId.includes('built')) {
    return `Built-in Camera ${index + 1}`;
  }

  return `Camera ${index + 1}`;
};

/**
 * Find the best default camera device
 * Prioritizes front-facing cameras for photobooth use
 */
export const getDefaultCameraDevice = (devices: CameraDevice[]): CameraDevice | null => {
  if (devices.length === 0) {
    return null;
  }

  // Try to find a front-facing camera first (better for photobooth)
  const frontCamera = devices.find(device => {
    const label = device.label.toLowerCase();
    const deviceId = device.deviceId.toLowerCase();
    return label.includes('front') || 
           label.includes('user') || 
           deviceId.includes('front') || 
           deviceId.includes('user');
  });

  if (frontCamera) {
    return frontCamera;
  }

  // If no front camera found, return the first available device
  return devices[0];
};

/**
 * Validate if a camera device ID is still available
 */
export const validateCameraDevice = async (deviceId: string): Promise<boolean> => {
  try {
    const devices = await enumerateCameraDevices();
    return devices.some(device => device.deviceId === deviceId);
  } catch (error) {
    console.warn('Error validating camera device:', error);
    return false;
  }
};

/**
 * Get camera constraints for a specific device and configuration
 */
export const getCameraConstraints = (
  deviceId: string | null,
  isFrontCamera: boolean,
  requestWidth: number,
  requestHeight: number
): CameraConstraints => {
  const constraints: CameraConstraints = {
    facingMode: isFrontCamera ? 'user' : 'environment',
    width: { ideal: requestWidth },
    height: { ideal: requestHeight }
  };

  if (deviceId) {
    constraints.deviceId = deviceId;
  }

  return constraints;
};

/**
 * Check if the browser supports camera functionality
 */
export const isCameraSupported = (): boolean => {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  );
};

/**
 * Handle camera permission errors with user-friendly messages
 */
export const getCameraErrorMessage = (error: any): string => {
  if (!error) return 'Unknown camera error';

  const errorName = error.name || '';
  const errorMessage = error.message || '';

  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera access denied. Please allow camera permissions and try again.';
    
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera found. Please connect a camera and try again.';
    
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is already in use by another application. Please close other apps using the camera.';
    
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Camera does not support the requested settings. Trying with default settings.';
    
    case 'NotSupportedError':
      return 'Camera is not supported in this browser.';
    
    case 'AbortError':
      return 'Camera access was interrupted.';
    
    default:
      if (errorMessage.includes('Permission denied')) {
        return 'Camera access denied. Please allow camera permissions and try again.';
      } else if (errorMessage.includes('not found')) {
        return 'No camera found. Please connect a camera and try again.';
      } else if (errorMessage.includes('in use')) {
        return 'Camera is already in use by another application.';
      }
      
      return `Camera error: ${errorMessage || errorName || 'Unknown error'}`;
  }
};
