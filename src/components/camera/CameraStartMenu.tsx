import React, { useRef, useState, useMemo, useEffect, memo } from 'react';
import { styleIdToDisplay } from '../../utils';
import { generateGalleryFilename, getPortraitFolderWithFallback } from '../../utils/galleryLoader';
import { CUSTOM_PROMPT_IMAGE_KEY } from '../shared/CustomPromptPopup';
import { getEnabledPrompts } from '../../constants/themeGroups';
import { useApp } from '../../context/AppContext';
import urls from '../../config/urls';
import promptsDataRaw from '../../prompts.json';
import './CameraStartMenu.css';

const AUDIO_ENABLED_KEY = 'sogni_splash_audio_enabled';
const SPLASH_SEEN_KEY = 'sogni_camera_splash_seen';
const STYLE_SELECTED_KEY = 'sogni_style_explicitly_selected';

const RANDOM_TAGLINES = [
  "you been mewing bro? u low key ready for that closeup 😮‍💨",
  "wait… why do you look kinda famous rn 👀",
  "cuz u servin' face right now. No glaze. 😮‍💨",
  "bro this pic boutta be ur hinge opener fr 📸",
  "lowkey might go viral. highkey u deserve it 😮‍💨",
  "I'm just sayin' you got some main char energy right thur 🫡",
  "lowkey feel bad for everyone taking pics after u 😮‍💨",
  "(ง'̀-'́)ง ok who gave u permission to slay 😮‍💨",
  "NO BC WHY U EATIN LIKE THAT 💀🫦💀",
  "ur the reason the booth lagged 😮‍💨💻🔥",
  "camera says 'oh we EATING today' (っ˘ڡ˘ς)",
  "the booth's crying shaking throwing up rn 😭😭😭📸",
  "HELLO??? WHY U BUILT LIKE MAIN CHARACTER DLC tho? 😮‍💨",
  "no cause i audibly GASPED. Look at u 😮‍💨💀💀💀",
  "why u lookin like that, the AI not even started yet 😮‍💨💅💀",
  "not me blushing, i'm a photo booth 👉👈😭",
  "hehe ur kinda photogenic 👉👈",
  "ok but like… why u look like that tho 👉👈😮‍💨",
  "ok don't move… ur kinda serving rn 😮‍💨📸",
  "this next one's the album cover. trust. 😮‍💨💿",
  "ur boutta break the booth again 😮‍💨💻💀",
  "ok deep breath. camera's literally shaking 😮‍💨📸",
  "this not fair i'm literally code 😮‍💨😭",
  "bro chill i'm just trying to do my job 😮‍💨📸",
  "bro the camera hasn't even started yet 😮‍💨📸",
  "bro how am I blushing i'm a robot 👉👈😮‍💨"
];

interface CameraStartMenuProps {
  onTakePhoto: () => void;
  onBrowsePhoto: (file: File) => void;
  onDragPhoto: () => void;
  // Style selector props
  selectedStyle?: string;
  onStyleSelect?: (style: string) => void;
  stylePrompts?: Record<string, string>;
  onNavigateToGallery?: () => void;
  portraitType?: 'headshot' | 'medium';
  styleReferenceImage?: { blob: File; dataUrl: string; croppedBlob: Blob | null } | null;
  // Photo tracking props
  originalPhotoUrl?: string | null;
  photoSourceType?: 'camera' | 'upload' | null;
  reusablePhotoUrl?: string | null;
  reusablePhotoSourceType?: 'camera' | 'upload' | null;
  // Handler to show existing photo in adjuster
  onShowExistingUpload?: () => void;
  hasExistingUpload?: boolean;
  // Reset handlers
  onResetCameraPhoto?: () => void;
  onResetUploadedPhoto?: () => void;
  // Theme state
  currentThemes?: Record<string, boolean>;
  // Brand override
  brandTitle?: string | null;
  brandLogo?: string | null;
  brandBackgroundImage?: string | null;
}

const CameraStartMenu: React.FC<CameraStartMenuProps> = ({
  onTakePhoto,
  onBrowsePhoto,
  selectedStyle = '',
  onStyleSelect,
  stylePrompts = {},
  onNavigateToGallery,
  portraitType = 'medium',
  styleReferenceImage = null,
  originalPhotoUrl = null,
  photoSourceType = null,
  reusablePhotoUrl = null,
  reusablePhotoSourceType = null,
  onShowExistingUpload,
  hasExistingUpload = false,
  onResetCameraPhoto,
  onResetUploadedPhoto,
  currentThemes = {},
  brandTitle = null,
  brandLogo = null,
  brandBackgroundImage = null
}) => {
  const { settings } = useApp();
  const isKioskMode = settings.showSplashOnInactivity;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => {
    // Initialize with saved preference immediately
    const savedAudioState = localStorage.getItem(AUDIO_ENABLED_KEY);
    return savedAudioState === 'true';
  });
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [showIntro, setShowIntro] = useState(() => {
    // Check if user has seen splash before or came from halloween link or skipWelcome param
    const splashSeen = localStorage.getItem(SPLASH_SEEN_KEY) === 'true';
    const isHalloweenLink = window.location.pathname.includes('/event/halloween');
    const skipWelcome = new URL(window.location.href).searchParams.get('skipWelcome') === 'true';
    return !splashSeen && !isHalloweenLink && !skipWelcome;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  // Track if user came from intro to determine if animations should play
  const [shouldPlayAnimations, setShouldPlayAnimations] = useState(false);
  const [randomTagline] = useState(() => {
    return RANDOM_TAGLINES[Math.floor(Math.random() * RANDOM_TAGLINES.length)];
  });

  // Pick a random style for sampler modes - truly random on each page load
  // No sessionStorage - changes with every visit
  // If themes are filtered, only pick from enabled themes
  const randomStyleForSamplers = useMemo(() => {
    // Check if theme filtering is active:
    // 1. currentThemes must exist and not be empty
    // 2. At least one theme must be explicitly enabled (true)
    // 3. At least one theme must be disabled (false) - otherwise all are enabled
    const hasCurrentThemes = currentThemes && Object.keys(currentThemes).length > 0;
    const hasAnyEnabled = hasCurrentThemes && Object.values(currentThemes).some(enabled => enabled);
    const hasAnyDisabled = hasCurrentThemes && Object.values(currentThemes).some(enabled => !enabled);
    const hasThemeFiltering = hasCurrentThemes && hasAnyEnabled && hasAnyDisabled;
    
    // If no themes provided, all themes empty, or all disabled -> use all prompts as fallback
    // If theme filtering is active, use getEnabledPrompts to filter
    const filteredPrompts = hasThemeFiltering
      ? getEnabledPrompts(currentThemes, stylePrompts)
      : stylePrompts;
    
    const availableStyles = Object.keys(filteredPrompts).filter(
      key => !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery', 'simplePick'].includes(key)
    );
    
    console.log('🎲 CameraStartMenu - randomStyleForSamplers recalculating:', {
      availableStylesCount: availableStyles.length,
      hasThemeFiltering,
      hasCurrentThemes,
      hasAnyEnabled,
      hasAnyDisabled,
      selectedStyle,
      stylePromptsKeys: Object.keys(stylePrompts).slice(0, 5),
      filteredPromptsKeys: Object.keys(filteredPrompts).slice(0, 5)
    });
    
    // Wait for full prompt set to load (> 100 styles) before generating random
    // This prevents picking from partial initial load that might not include all styles
    // If theme filtering is active, lower the threshold since fewer prompts are expected
    const minPromptsThreshold = hasThemeFiltering ? 5 : 100;
    if (availableStyles.length < minPromptsThreshold) {
      console.log('⏳ Waiting for full prompts to load (currently:', availableStyles.length, 'threshold:', minPromptsThreshold, ')');
      return null;
    }
    
    // Generate new random style on each component mount
    const randomIndex = Math.floor(Math.random() * availableStyles.length);
    const selectedRandomStyle = availableStyles[randomIndex];
    console.log('🎯 Generated new random style:', selectedRandomStyle, 'at index:', randomIndex, 'of', availableStyles.length);
    return selectedRandomStyle;
  }, [stylePrompts, currentThemes]);

  // Track if user has ever explicitly selected a style
  const hasExplicitlySelectedStyle = useMemo(() => {
    return localStorage.getItem(STYLE_SELECTED_KEY) === 'true';
  }, [selectedStyle]); // Re-check when selectedStyle changes

  // Load custom prompt image from localStorage
  const [customPromptImage, setCustomPromptImage] = useState<string | null>(null);
  
  useEffect(() => {
    try {
      const imageData = localStorage.getItem(CUSTOM_PROMPT_IMAGE_KEY);
      if (imageData) {
        const parsed = JSON.parse(imageData);
        setCustomPromptImage(parsed.url);
      } else {
        setCustomPromptImage(null);
      }
    } catch (e) {
      console.warn('Failed to load custom prompt image:', e);
      setCustomPromptImage(null);
    }
  }, [selectedStyle]); // Reload when selected style changes

  // Get the appropriate icon for the selected style
  const getStyleIcon = useMemo(() => {
    if (!selectedStyle || selectedStyle === '') return '🎨';
    
    switch (selectedStyle) {
      case 'randomMix':
        return '🎲';
      case 'random':
        return '🔀';
      case 'oneOfEach':
        return '🙏';
      case 'custom':
        return '✏️';
      case 'copyImageStyle':
        return '🎨';
      case 'simplePick':
        return '🎯';
      case 'browseGallery':
        return '🖼️';
      default:
        return '🎨'; // Fallback for individual styles
    }
  }, [selectedStyle]);

  // Generate preview image path for selected style
  const stylePreviewImage = useMemo(() => {
    console.log('🖼️ stylePreviewImage recalculating - selectedStyle:', selectedStyle, 'hasStyleRef:', !!styleReferenceImage?.dataUrl);
    
    // Special handling for Custom Prompt - show saved custom prompt image
    if (selectedStyle === 'custom' && customPromptImage) {
      console.log('✏️ Using custom prompt image for preview:', customPromptImage.substring(0, 50));
      return customPromptImage;
    }
    
    // Special handling for Copy Image Style - show uploaded reference image
    if (selectedStyle === 'copyImageStyle' && styleReferenceImage?.dataUrl) {
      console.log('🎨 Using style reference image for preview:', styleReferenceImage.dataUrl.substring(0, 50));
      return styleReferenceImage.dataUrl;
    }
    
    // For random sampler modes, show a random style image in the background
    const isSamplerMode = selectedStyle && ['random', 'randomMix', 'oneOfEach', 'simplePick'].includes(selectedStyle);
    
    console.log('🖼️ stylePreviewImage recalculating:', {
      selectedStyle,
      isSamplerMode,
      randomStyleForSamplers,
      portraitType
    });
    
    if (isSamplerMode && randomStyleForSamplers) {
      try {
        const expectedFilename = generateGalleryFilename(randomStyleForSamplers);
        const folder = getPortraitFolderWithFallback(portraitType, randomStyleForSamplers, promptsDataRaw);
        const imagePath = `${urls.assetUrl}/gallery/prompts/${folder}/${expectedFilename}`;
        console.log('✅ Generated sampler image path:', imagePath);
        return imagePath;
      } catch (error) {
        console.warn('❌ Error generating random style preview image:', error);
        return null;
      }
    }
    
    // Check if it's an individual style (not a prompt sampler mode or special mode)
    const isIndividualStyle = selectedStyle &&
      !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery', 'copyImageStyle', 'simplePick'].includes(selectedStyle);

    if (isIndividualStyle) {
      try {
        const expectedFilename = generateGalleryFilename(selectedStyle);
        const folder = getPortraitFolderWithFallback(portraitType, selectedStyle, promptsDataRaw);
        const imagePath = `${urls.assetUrl}/gallery/prompts/${folder}/${expectedFilename}`;
        console.log('✅ Generated individual style image path:', imagePath);
        return imagePath;
      } catch (error) {
        console.warn('❌ Error generating style preview image:', error);
        return null;
      }
    }

    console.log('⚪ No preview image (returning null)');
    return null;
  }, [selectedStyle, portraitType, randomStyleForSamplers, styleReferenceImage, customPromptImage]);

  const handleBrowseClick = () => {
    // If there's an existing upload stored, show the adjuster with that photo first
    if (hasExistingUpload && onShowExistingUpload) {
      onShowExistingUpload();
    } else {
      // Otherwise, trigger file input to select a new photo
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (17MB limit)
      if (file.size > 17 * 1024 * 1024) {
        alert("Image must be less than 17MB.");
        // Clear the input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert("Please select an image file (PNG or JPG).");
        // Clear the input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Pass the file to the callback
      onBrowsePhoto(file);
    }
  };

  // Style selector handlers
  const handleStyleClick = () => {
    // Always go directly to full-screen Vibe Explorer
    if (onNavigateToGallery) {
      onNavigateToGallery();
    }
  };


  // Handle audio toggle
  const handleAudioToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef) {
      const newAudioState = !isAudioEnabled;
      setIsAudioEnabled(newAudioState);
      videoRef.muted = !newAudioState;

      // Save audio preference to localStorage immediately
      // This is an explicit user action, so remember their choice
      localStorage.setItem(AUDIO_ENABLED_KEY, newAudioState.toString());
      console.log('🔊 Audio explicitly', newAudioState ? 'enabled' : 'disabled', 'by user');
      
      // If enabling audio, ensure video is playing
      if (newAudioState && videoRef.paused) {
        void videoRef.play();
      }
    }
  };

  // Handle transition from intro to options
  const handleStartClick = () => {
    setIsTransitioning(true);
    // Mark splash as seen
    localStorage.setItem(SPLASH_SEEN_KEY, 'true');
    // Enable animations since we're transitioning from intro
    setShouldPlayAnimations(true);
    // Wait for exit animation to complete before showing options
    setTimeout(() => {
      setShowIntro(false);
      setIsTransitioning(false);
    }, 750);
  };

  // Handle return to splash screen
  const handleReturnToSplash = () => {
    setShowIntro(true);
  };

  return (
    <div className={`camera-start-menu ${showIntro ? 'phase-intro' : 'phase-options'}`} style={brandBackgroundImage ? { background: 'transparent' } : undefined}>
      <div className="start-menu-content">
        {showIntro ? (
          /* Intro Section - Camera + Video */
          <div className={`intro-section ${isTransitioning ? 'exiting' : ''}`}>
            {brandLogo ? (
              <div className="brand-title-row">
                <img src={brandLogo} alt="" className="brand-logo" />
                <span className="brand-title-x">x</span><span className="brand-title-sogni">Sogni<br />Photobooth</span>
              </div>
            ) : (
              <h1 className="start-menu-title">{brandTitle || 'SOGNI PHOTOBOOTH'}</h1>
            )}
            {!brandLogo && <p className="start-menu-tagline">{randomTagline}</p>}

            <div className="intro-media-container">
              {/* Polaroid Camera Mascot */}
              <div className="intro-camera-container">
                <div className="camera-speech-bubble">ready 2 make some magic?✨</div>
                <img
                  src="/polaroid-camera.png"
                  alt="Polaroid Camera"
                  className="intro-camera-image"
                  onClick={handleStartClick}
                />
              </div>

              {/* Video Container */}
              <div className="intro-video-wrapper">
                <div className="intro-video-container">
                  <video
                    ref={(el) => setVideoRef(el)}
                    src={`${urls.assetUrl}/videos/photobooth-small-yellow-40kbps.mp4`}
                    autoPlay
                    loop
                    playsInline
                    muted={!isAudioEnabled}
                    className="intro-video"
                    onLoadedData={(e) => {
                      const video = e.target as HTMLVideoElement;
                      const currentAudioSetting = localStorage.getItem(AUDIO_ENABLED_KEY) === 'true';
                      if (currentAudioSetting !== isAudioEnabled) {
                        setIsAudioEnabled(currentAudioSetting);
                      }
                      video.muted = !currentAudioSetting;
                      console.log('🔊 Video loaded with audio setting:', currentAudioSetting ? 'ON' : 'OFF');
                      
                      // Try to play with current audio setting
                      void video.play().catch(() => {
                        // Only mute if user hasn't explicitly enabled audio before
                        if (!currentAudioSetting) {
                          console.log('🔊 Autoplay failed with default muted state');
                          video.muted = true;
                          void video.play();
                        } else {
                          console.log('🔊 Autoplay with audio blocked by browser, trying muted');
                          video.muted = true;
                          setIsAudioEnabled(false);
                          void video.play();
                        }
                      });
                    }}
                  />
                  <button
                    className="audio-toggle-btn"
                    onClick={handleAudioToggle}
                    aria-label={isAudioEnabled ? "Mute audio" : "Unmute audio"}
                  >
                    {isAudioEnabled ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button className="shoot-your-own-btn" onClick={handleStartClick}>
              <span className="serve-face-text">Time to serve face</span> 🙂
            </button>

            {/* Continue button on intro screen */}
            <button
              className="continue-corner-btn corner-btn intro-continue-btn"
              onClick={handleStartClick}
            >
              Continue
            </button>
          </div>
        ) : (
          /* Options Section - 3 Polaroids */
          <div className={`options-section ${shouldPlayAnimations ? 'with-animations' : 'no-animations'}`}>
            <div className="top-content">
              {brandLogo ? (
                <div className="brand-title-row">
                  <img src={brandLogo} alt="" className="brand-logo" />
                  <span className="brand-title-x">x</span><span className="brand-title-sogni">Sogni<br />Photobooth</span>
                </div>
              ) : (
                <h1 className="start-menu-title">{brandTitle || 'SOGNI PHOTOBOOTH'}</h1>
              )}
              {!brandLogo && <p className="start-menu-tagline">{randomTagline}</p>}

              {/* All Polaroids in One Row */}
              <div className="polaroid-options-container">
                {/* Style Selector Polaroid */}
                <div className="polaroid-wrapper polaroid-1">
                  <button
                    className="polaroid-button style-selector-button"
                    onClick={handleStyleClick}
                  >
                    <div className="polaroid-content">
                      {stylePreviewImage ? (
                        <img
                          src={stylePreviewImage}
                          alt={selectedStyle ? styleIdToDisplay(selectedStyle) : 'Style preview'}
                          className="style-preview-image"
                          onError={(e) => {
                            // Fallback to emoji icon if image fails to load
                            e.currentTarget.style.display = 'none';
                            const fallbackIcon = e.currentTarget.nextElementSibling;
                            if (fallbackIcon && fallbackIcon.classList.contains('style-icon-fallback')) {
                              (fallbackIcon as HTMLElement).style.display = 'block';
                            }
                          }}
                        />
                      ) : null}
                      {/* Only show icon in content area if there's no image (not for sampler modes) */}
                      {(() => {
                        const isSamplerMode = selectedStyle && ['random', 'randomMix', 'oneOfEach', 'simplePick'].includes(selectedStyle);
                        const shouldShowIcon = !stylePreviewImage && !isSamplerMode;
                        return (
                          <span 
                            className={`style-icon ${stylePreviewImage ? 'style-icon-fallback' : ''}`} 
                            style={shouldShowIcon ? {} : { display: 'none' }}
                          >
                            {getStyleIcon}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="polaroid-label">
                      {(() => {
                        const isSamplerMode = selectedStyle && ['random', 'randomMix', 'oneOfEach', 'simplePick'].includes(selectedStyle);
                        if (isSamplerMode) {
                          const text = selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style';
                          return <>{getStyleIcon} {text}</>;
                        }
                        if (selectedStyle === 'custom') return 'Custom Prompt';
                        if (selectedStyle === 'copyImageStyle') return 'Copy Image Style';
                        return selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style';
                      })()}
                    </div>
                  </button>
                  <div className="polaroid-caption">
                    pick a vibe{hasExplicitlySelectedStyle ? ' ✓' : ''}
                  </div>
                  {/* Reset link - only show when not randomMix */}
                  {selectedStyle && selectedStyle !== 'randomMix' && (
                    <button
                      className="polaroid-reset-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStyleSelect?.('randomMix');
                      }}
                      title="Reset to Random Mix"
                    >
                      RESET
                    </button>
                  )}
                </div>

                {/* "then" separator */}
                <div className="step-separator">then</div>

                {/* Photo Option Polaroids */}
                <div className={`photo-options-group${isKioskMode ? ' kiosk-mode' : ''}`}>
                  <div className="polaroid-wrapper polaroid-2">
                    <button
                      className="polaroid-button option-button take-photo"
                      onClick={onTakePhoto}
                    >
                      <div className="polaroid-content">
                        <img
                          src={
                            (originalPhotoUrl && photoSourceType === 'camera')
                              ? originalPhotoUrl
                              : "/albert-einstein-sticks-out-his-tongue.jpg"
                          }
                          alt="Snap a photo"
                          className="polaroid-bg-image"
                        />
                      </div>
                    </button>
                    <div className="polaroid-caption">
                      snap a photo{((originalPhotoUrl && photoSourceType === 'camera') || (reusablePhotoUrl && reusablePhotoSourceType === 'camera')) ? ' ✓' : ''}
                    </div>
                    {/* Reset link - only show when there's a saved camera photo */}
                    {((originalPhotoUrl && photoSourceType === 'camera') || (reusablePhotoUrl && reusablePhotoSourceType === 'camera')) && onResetCameraPhoto && (
                      <button
                        className="polaroid-reset-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResetCameraPhoto();
                        }}
                        title="Reset camera photo"
                      >
                        RESET
                      </button>
                    )}
                  </div>

                  {/* "or" separator and upload option - hidden in kiosk mode */}
                  {!isKioskMode && (
                    <>
                      <div className="step-separator">or</div>

                      <div className="polaroid-wrapper polaroid-3">
                        <button
                          className="polaroid-button option-button browse-photo"
                          onClick={handleBrowseClick}
                        >
                          <div className="polaroid-content">
                            <img
                              src={
                                (originalPhotoUrl && photoSourceType === 'upload')
                                  ? originalPhotoUrl
                                  : (reusablePhotoUrl && reusablePhotoSourceType === 'upload')
                                    ? reusablePhotoUrl
                                    : "/gallery/sample-gallery-medium-body-jen2.jpg"
                              }
                              alt="Upload a pic"
                              className="polaroid-bg-image"
                            />
                          </div>
                        </button>
                        <div className="polaroid-caption">
                          upload a pic{((originalPhotoUrl && photoSourceType === 'upload') || (reusablePhotoUrl && reusablePhotoSourceType === 'upload')) ? ' ✓' : ''}
                        </div>
                        {/* Reset link - only show when there's a saved uploaded photo */}
                        {((originalPhotoUrl && photoSourceType === 'upload') || (reusablePhotoUrl && reusablePhotoSourceType === 'upload')) && onResetUploadedPhoto && (
                          <button
                            className="polaroid-reset-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResetUploadedPhoto();
                            }}
                            title="Reset uploaded photo"
                          >
                            RESET
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Splash button - return to intro */}
            {!showIntro && (
              <button
                className="splash-return-btn"
                onClick={handleReturnToSplash}
                title="Return to intro"
              >
                ← 🎬
              </button>
            )}

            {/* Continue button - shows on options screen */}
            {!showIntro && (
              <button
                className="continue-corner-btn corner-btn"
                onClick={onTakePhoto}
              >
                Continue
              </button>
            )}
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/png, image/jpeg"
        onChange={handleFileSelect}
      />

    </div>
  );
};

export default memo(CameraStartMenu);

