import React, { useEffect, useState } from 'react';
import styles from '../../styles/components/camera.module.css';
import AdvancedSettings from '../shared/AdvancedSettings';
import AspectRatioDropdown from '../shared/AspectRatioDropdown';
import { getCustomDimensions } from '../../utils/imageProcessing';
import { AspectRatioOption } from '../../types/index';

interface CameraViewProps {
  /** Video ref for the webcam stream */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the camera is ready to take photos */
  isReady: boolean;
  /** Whether the shutter button is disabled */
  isDisabled?: boolean;
  /** Label to show on the shutter button */
  buttonLabel?: string;
  /** Handler for when the shutter button is clicked */
  onTakePhoto: () => void;
  /** Whether to show the photo grid */
  showPhotoGrid?: boolean;
  /** Current style selection */
  selectedStyle?: string;
  /** Handler for style selection */
  onStyleSelect?: (style: string) => void;
  /** Whether the settings overlay is visible */
  showSettings?: boolean;
  /** Handler for toggling settings */
  onToggleSettings?: () => void;
  /** Optional test ID for testing */
  testId?: string;
  /** Handler for toggling between front and rear cameras */
  onToggleCamera?: () => void;
  /** Model options */
  modelOptions?: Array<{ label: string; value: string; }>;
  /** Selected model */
  selectedModel?: string;
  /** Handler for model selection */
  onModelSelect?: (model: string) => void;
  /** Number of images */
  numImages?: number;
  /** Handler for number of images change */
  onNumImagesChange?: (num: number) => void;
  /** Prompt guidance value */
  promptGuidance?: number;
  /** Handler for prompt guidance change */
  onPromptGuidanceChange?: (value: number) => void;
  /** ControlNet strength value */
  controlNetStrength?: number;
  /** Handler for ControlNet strength change */
  onControlNetStrengthChange?: (value: number) => void;
  /** ControlNet guidance end value */
  controlNetGuidanceEnd?: number;
  /** Handler for ControlNet guidance end change */
  onControlNetGuidanceEndChange?: (value: number) => void;
  /** Flash enabled state */
  flashEnabled?: boolean;
  /** Handler for flash enabled change */
  onFlashEnabledChange?: (enabled: boolean) => void;
  /** Keep original photo state */
  keepOriginalPhoto?: boolean;
  /** Handler for keep original photo change */
  onKeepOriginalPhotoChange?: (keep: boolean) => void;
  /** Handler for settings reset */
  onResetSettings?: () => void;
  /** Whether the front camera is active */
  isFrontCamera?: boolean;
  /** Handler for navigating back to main menu */
  onBackToMenu?: () => void;
  /** Current aspect ratio setting */
  aspectRatio?: AspectRatioOption;
  /** Whether iOS dimension quirk has been detected */
  iosQuirkDetected?: boolean;
  /** Actual camera dimensions when iOS quirk is detected */
  actualCameraDimensions?: { width: number; height: number } | null;
  /** Whether iOS quirk detection has completed */
  quirkDetectionComplete?: boolean;
  /** TezDev theme for frame overlays */
  tezdevTheme?: string;
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  isReady,
  isDisabled = false,
  buttonLabel = 'Take Photo',
  onTakePhoto,
  showPhotoGrid = false,
  selectedStyle = '',
  showSettings = false,
  onToggleSettings = () => {},
  testId,
  onToggleCamera,
  modelOptions = [],
  selectedModel = '',
  onModelSelect,
  numImages = 8,
  onNumImagesChange,
  promptGuidance = 2,
  onPromptGuidanceChange,
  controlNetStrength = 0.8,
  onControlNetStrengthChange,
  controlNetGuidanceEnd = 0.6,
  onControlNetGuidanceEndChange,
  flashEnabled = true,
  onFlashEnabledChange,
  keepOriginalPhoto = false,
  onKeepOriginalPhotoChange,
  onResetSettings,
  isFrontCamera = true,
  aspectRatio = 'square' as AspectRatioOption,
  iosQuirkDetected = false,
  actualCameraDimensions = null,
  quirkDetectionComplete = false,
  tezdevTheme = 'off',
}) => {
  // Use aspectRatio prop instead of context
  
  // Add state for responsive container sizing
  const [containerStyle, setContainerStyle] = useState({
    width: 'auto',
    height: 'auto',
    aspectRatio: '1'
  });
  
  // Helper function to get the appropriate CSS class for aspect ratio
  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case 'ultranarrow':
        return styles['aspect-ultranarrow'];
      case 'narrow':
        return styles['aspect-narrow'];
      case 'portrait':
        return styles['aspect-portrait'];
      case 'square':
        return styles['aspect-square'];
      case 'landscape':
        return styles['aspect-landscape'];
      case 'wide':
        return styles['aspect-wide'];
      case 'ultrawide':
        return styles['aspect-ultrawide'];
      default:
        return styles['aspect-square'];
    }
  };
  
  // Note: Removed getWebcamClass helper since we now use simple CSS masking
  
  // Check if device is mobile
  const [isMobile, setIsMobile] = useState(false);
  
  // Add state to track video loading
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  
  useEffect(() => {
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as { opera?: string }).opera || '';
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(String(userAgent).toLowerCase());
    };
    setIsMobile(checkIfMobile());
  }, []);

  // Calculate container dimensions that fit the viewport while maintaining aspect ratio
  useEffect(() => {
    // Only calculate container dimensions after quirk detection is complete
    if (!quirkDetectionComplete) {
      console.log(`⏳ CameraView: Waiting for iOS quirk detection to complete...`);
      return;
    }

    const calculateContainerDimensions = () => {      
      // Always use the requested aspect ratio for container dimensions
      // CSS object-fit: cover will handle cropping from the actual camera feed
      const currentDimensions = getCustomDimensions(aspectRatio);
      const currentAspectRatio = currentDimensions.width / currentDimensions.height;
      
      if (iosQuirkDetected && actualCameraDimensions) {
        console.log(`📐 CameraView: iOS quirk detected - camera provides ${actualCameraDimensions.width}x${actualCameraDimensions.height} but displaying as ${aspectRatio} (${currentDimensions.width}x${currentDimensions.height})`);
        console.log(`📐 CSS object-fit: cover will crop the ${actualCameraDimensions.width > actualCameraDimensions.height ? 'landscape' : 'portrait'} camera feed to show ${aspectRatio} portion`);
      } else {
        console.log(`📐 CameraView: Using requested ${aspectRatio} dimensions ${currentDimensions.width}x${currentDimensions.height}`);
      }
      // Get viewport dimensions (accounting for header and controls)
      const viewportWidth = window.innerWidth * 0.9; // 90% of viewport width
      const viewportHeight = window.innerHeight * 0.9; // 90% of viewport height to account for header/controls
      
      let containerWidth, containerHeight;
      
      // Determine sizing based on aspect ratio dynamically
      const isPortraitLike = currentAspectRatio < 1;
      const isSquareLike = Math.abs(currentAspectRatio - 1) < 0.1;
      
      if (isPortraitLike) {
        // Portrait-like modes (ultranarrow, narrow, portrait) - prioritize height
        containerHeight = Math.min(viewportHeight, 600);
        containerWidth = containerHeight * currentAspectRatio;
        // Check if width exceeds viewport width
        if (containerWidth > viewportWidth) {
          containerWidth = viewportWidth;
          containerHeight = containerWidth / currentAspectRatio;
        }
      } 
      else if (isSquareLike) {
        // Square mode - try to fit within viewport
        const size = Math.min(viewportWidth, viewportHeight, 600);
        containerWidth = size;
        containerHeight = size;
      }
      else {
        // Landscape-like modes (landscape, wide, ultrawide) - prioritize width
        containerWidth = Math.min(viewportWidth, 800);
        containerHeight = containerWidth / currentAspectRatio;
      }
      
      // Final common constraints for all modes
      if (containerWidth > viewportWidth) {
        containerWidth = viewportWidth;
        containerHeight = containerWidth / currentAspectRatio;
      }
      
      if (containerHeight > viewportHeight) {
        containerHeight = viewportHeight;
        containerWidth = containerHeight * currentAspectRatio;
      }
      
      setContainerStyle({
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        aspectRatio: `${currentDimensions.width}/${currentDimensions.height}`
      });
    };
    
    calculateContainerDimensions();
    
    // Recalculate on window resize
    window.addEventListener('resize', calculateContainerDimensions);
    
    return () => {
      window.removeEventListener('resize', calculateContainerDimensions);
    };
  }, [aspectRatio, iosQuirkDetected, actualCameraDimensions, quirkDetectionComplete]); // Add all quirk detection dependencies

  // Note: Removed complex video sizing logic since we now use simple CSS aspect ratio masking
  // The video container automatically handles the aspect ratio using CSS, video always stays at max resolution

  // Add effect to track video loading events
  useEffect(() => {
    const handleVideoLoadedMetadata = () => {
      console.log('Video metadata loaded, video is ready for display');
      setIsVideoLoaded(true);
    };

    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
      
      // If already loaded, set it now
      if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
        handleVideoLoadedMetadata();
      }
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
      }
    };
  }, [videoRef, aspectRatio]);

  // Note: Removed complex object-fit logic since we now use simple CSS masking
  // Video stays at max resolution and we just crop the display using container overflow

  // Determine animation class based on video loading state and showPhotoGrid
  const getAnimationClass = () => {
    if (!isVideoLoaded) {
      // If video isn't loaded yet, hide the container completely
      return styles.loading;
    }
    return showPhotoGrid ? styles.slideOut : styles.slideIn;
  };

  const renderBottomControls = () => (
    <div className={styles.bottomControls}>
      {isMobile ? (
        <>
          {/* Camera flip button for mobile devices */}
          <button
            className={styles.cameraFlipButton}
            onClick={onToggleCamera}
            aria-label={isFrontCamera ? "Switch to back camera" : "Switch to front camera"}
            data-testid="camera-flip-button"
          >
            <span className={styles.cameraFlipIcon} role="img" aria-label="Flip camera">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 5H16.83L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7V19C2 20.1 2.9 21 4 21H20C21.1 21 22 20.1 22 19V7C22 5.9 21.1 5 20 5ZM12 18C9.24 18 7 15.76 7 13C7 10.24 9.24 8 12 8C14.76 8 17 10.24 17 13C17 15.76 14.76 18 12 18Z" fill="#333333"/>
                <path d="M15 13L13 10V12H9V14H13V16L15 13Z" fill="#333333"/>
              </svg>
            </span>
          </button>
          
          {/* Shutter button - no label on mobile */}
          <button
            className={`${styles.shutterButton} ${isDisabled ? styles.cooldown : ''}`}
            onClick={onTakePhoto}
            disabled={!isReady || isDisabled}
            data-testid="shutter-button"
          >
            <span className={styles.shutterDot} />
          </button>
          
          {/* Empty space to balance the layout */}
          <div style={{ width: '24px' }} />
        </>
      ) : (
        <>
          <div className={styles.endSpacer} />

          {/* Shutter button */}
          <button
            className={`${styles.shutterButton} ${isDisabled ? styles.cooldown : ''}`}
            onClick={onTakePhoto}
            disabled={!isReady || isDisabled}
            data-testid="shutter-button"
          >
            <span className={styles.shutterDot} />
            <span className={styles.shutterLabel}>{buttonLabel}</span>
          </button>

          <div className={styles.endSpacer} />
        </>
      )}
    </div>
  );

  return (
    <div 
      className={`${styles.cameraContainer} ${getAnimationClass()}`}
      data-testid={testId || 'camera-container'}
    >
      <div className={styles.polaroidFrame} style={{ position: 'relative' }}>
        {/* Title and settings in the polaroid top border */}
        <div className={styles.polaroidHeader}>
          <div className={styles.title}>
            SOGNI PHOTOBOOTH
          </div>
        </div>
        
        {/* Camera view with custom aspect ratio */}
        <div className={styles.cameraView}>
                  <div 
          className={`${styles.cameraViewInner} ${getAspectRatioClass()}`}
          id="camera-container"
          style={{
            // Use calculated responsive dimensions
            ...containerStyle,
            overflow: 'hidden', // Hide any parts of the video outside the aspect ratio
            position: 'relative',
            margin: '0 auto' // Center the container
          }}
        >
            <video
              id="webcam"
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.webcam}
              data-testid="webcam-video"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover', // Always cover to maintain max resolution from the center
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1
              }}
            />
            
            {/* GM Vietnam Frame Overlay for Camera Preview */}
            {tezdevTheme === 'gmvietnam' && (
              <>
                {/* Top-Left Corner */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(/tezos/GMVN-FRAME-TL.png)`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'top left',
                    backgroundRepeat: 'no-repeat',
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                />
                {/* Bottom-Left Corner */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(/tezos/GMVN-FRAME-BL.png)`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'bottom left',
                    backgroundRepeat: 'no-repeat',
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        {renderBottomControls()}

        {/* Aspect Ratio Dropdown - positioned inside polaroid frame */}
        <AspectRatioDropdown 
          visible={!showSettings}
          position="bottom-right"
        />
      </div>

      {/* Advanced Settings Overlay - Use the reusable component */}
      <AdvancedSettings 
        visible={showSettings || false}
        onClose={onToggleSettings || (() => {})}
        selectedStyle={selectedStyle}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        onModelSelect={onModelSelect}
        numImages={numImages}
        onNumImagesChange={onNumImagesChange}
        promptGuidance={promptGuidance}
        onPromptGuidanceChange={onPromptGuidanceChange}
        controlNetStrength={controlNetStrength}
        onControlNetStrengthChange={onControlNetStrengthChange}
        controlNetGuidanceEnd={controlNetGuidanceEnd}
        onControlNetGuidanceEndChange={onControlNetGuidanceEndChange}
        flashEnabled={flashEnabled}
        onFlashEnabledChange={onFlashEnabledChange}
        keepOriginalPhoto={keepOriginalPhoto}
        onKeepOriginalPhotoChange={onKeepOriginalPhotoChange}
        onResetSettings={onResetSettings}
        aspectRatio={aspectRatio}
      />
    </div>
  );
};

export default CameraView; 