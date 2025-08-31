import React, { useMemo, useCallback, useEffect, useState, memo } from 'react';

import PropTypes from 'prop-types';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles
import '../../styles/components/PhotoGallery.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { getPhotoHashtag } from '../../services/TwitterShare';
import { downloadImageMobile, enableMobileImageDownload } from '../../utils/mobileDownload';
import { isMobile } from '../../utils/index';
import { themeConfigService } from '../../services/themeConfig';

// Memoized placeholder image component to prevent blob reloading
const PlaceholderImage = memo(({ placeholderUrl }) => {

  
  if (!placeholderUrl) return null;
  
  return (
    <img
      src={placeholderUrl}
      alt="Original reference"
      className="placeholder"
      onLoad={e => {
        // Enable mobile-optimized download functionality when image loads
        enableMobileImageDownload(e.target);
      }}
      onContextMenu={e => {
        // Allow native context menu for image downloads
        e.stopPropagation();
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        position: 'relative',
        top: 0,
        left: 0,
        opacity: 0.25,
        zIndex: 1
      }}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if the actual URL changes
  return prevProps.placeholderUrl === nextProps.placeholderUrl;
});

PlaceholderImage.displayName = 'PlaceholderImage';

PlaceholderImage.propTypes = {
  placeholderUrl: PropTypes.string
};

const PhotoGallery = ({
  photos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  showPhotoGrid,
  handleBackToCamera,
  handlePreviousPhoto,
  handleNextPhoto,
  handlePhotoViewerClick,
  handleGenerateMorePhotos,
  handleShowControlOverlay,
  isGenerating,
  keepOriginalPhoto,
  lastPhotoData,
  activeProjectReference,
  isSogniReady,
  toggleNotesModal,
  setPhotos,
  selectedStyle,
  stylePrompts,
  enhancePhoto,
  undoEnhancement,
  redoEnhancement,
  sogniClient,
  desiredWidth,
  desiredHeight,
  selectedSubIndex = 0,
  outputFormat = 'png',
  handleShareToX,
  slothicornAnimationEnabled,
  backgroundAnimationsEnabled = false,
  tezdevTheme = 'off',
  aspectRatio = null,
  handleRetryPhoto,
  onPreGenerateFrame, // New prop to handle frame pre-generation from parent
}) => {

  
  // State to track when to show the "more" button during generation
  const [showMoreButtonDuringGeneration, setShowMoreButtonDuringGeneration] = useState(false);
  
  // State to track composite framed images for right-click save compatibility
  const [framedImageUrls, setFramedImageUrls] = useState({});
  
  // State to track which photos are currently generating frames to prevent flicker
  const [generatingFrames, setGeneratingFrames] = useState(new Set());
  
  // State to hold the previous framed image during transitions to prevent flicker
  const [previousFramedImage, setPreviousFramedImage] = useState(null);
  const [previousSelectedIndex, setPreviousSelectedIndex] = useState(null);
  
  // Keep track of the previous photos array length to detect new batches
  const [previousPhotosLength, setPreviousPhotosLength] = useState(0);
  
  // State for enhancement options dropdown and prompt modal
  const [showEnhanceDropdown, setShowEnhanceDropdown] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  
  // Auto-dismiss enhancement errors after 5 seconds
  useEffect(() => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex]?.enhancementError) {
      const timer = setTimeout(() => {
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[selectedPhotoIndex]) {
            updated[selectedPhotoIndex] = {
              ...updated[selectedPhotoIndex],
              enhancementError: null
            };
          }
          return updated;
        });
      }, 5000); // 5 seconds

      return () => clearTimeout(timer);
    }
  }, [selectedPhotoIndex, photos[selectedPhotoIndex]?.enhancementError, setPhotos]);
  
  // Clear framed image cache when new photos are generated or theme changes
  useEffect(() => {
    const shouldClearCache = 
      // New batch detected (photos array got smaller, indicating a reset)
      photos.length < previousPhotosLength ||
      // Or if we have a significant change in photos (new batch)
      (photos.length > 0 && previousPhotosLength > 0 && Math.abs(photos.length - previousPhotosLength) >= 3);
    
    if (shouldClearCache) {
      console.log('Clearing framed image cache due to new photo batch');
      // Clean up existing blob URLs
      Object.values(framedImageUrls).forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      setFramedImageUrls({});
    }
    
    // Update the previous length
    setPreviousPhotosLength(photos.length);
  }, [photos.length, previousPhotosLength]);

  // Clear framed image cache when theme changes
  useEffect(() => {
    console.log('Clearing framed image cache due to theme change');
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [tezdevTheme]);

  // Clear framed image cache when aspect ratio changes
  useEffect(() => {
    console.log('Clearing framed image cache due to aspect ratio change');
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [aspectRatio]);
  
  // Effect to handle the 10-second timeout for showing the "more" button during generation
  useEffect(() => {
    if (isGenerating && selectedPhotoIndex === null) {
      // Start the 10-second timeout when generation begins
      setShowMoreButtonDuringGeneration(false);
      const timeoutId = setTimeout(() => {
        setShowMoreButtonDuringGeneration(true);
      }, 20000); // 20 seconds

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // Reset the state when not generating or when a photo is selected
      setShowMoreButtonDuringGeneration(false);
    }
  }, [isGenerating, selectedPhotoIndex]);

  // Handler for the "more" button that can either generate more or cancel current generation
  const handleMoreButtonClick = useCallback(async () => {
    // Clear framed image cache when generating more photos
    console.log('Clearing framed image cache due to "More" button click');
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
    
    if (isGenerating && activeProjectReference.current) {
      // Cancel current project and immediately start new batch
      console.log('Cancelling current project from more button:', activeProjectReference.current);
      try {
        if (sogniClient && sogniClient.cancelProject) {
          await sogniClient.cancelProject(activeProjectReference.current);
        }
        activeProjectReference.current = null;
        // Reset the timeout state
        setShowMoreButtonDuringGeneration(false);
        // Immediately start new batch after canceling
        handleGenerateMorePhotos();
      } catch (error) {
        console.warn('Error cancelling project from more button:', error);
        // Even if cancellation fails, try to start new batch
        handleGenerateMorePhotos();
      }
    } else {
      // Normal "generate more photos" behavior
      handleGenerateMorePhotos();
    }
  }, [isGenerating, activeProjectReference, sogniClient, handleGenerateMorePhotos, framedImageUrls]);

  // Utility function to clear frame cache for a specific photo
  const clearFrameCacheForPhoto = useCallback((photoIndex) => {
    console.log(`Clearing frame cache for photo #${photoIndex}`);
    setFramedImageUrls(prev => {
      const keysToRemove = Object.keys(prev).filter(key => key.startsWith(`${photoIndex}-`));
      if (keysToRemove.length === 0) return prev;
      // Revoke any blob URLs
      keysToRemove.forEach(key => {
        const url = prev[key];
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      const cleaned = { ...prev };
      keysToRemove.forEach(key => delete cleaned[key]);
      return cleaned;
    });
  }, []);

  // Handle enhancement with Krea (default behavior)
  const handleEnhanceWithKrea = useCallback(() => {
    setShowEnhanceDropdown(false);
    
    // Use the functional form of setPhotos to get the latest state
    setPhotos(currentPhotos => {
      const currentPhotoIndex = selectedPhotoIndex;
      if (currentPhotoIndex !== null && currentPhotos[currentPhotoIndex] && !currentPhotos[currentPhotoIndex].enhancing) {
        // Call enhance photo in the next tick to ensure we have the latest state
        setTimeout(() => {
          enhancePhoto({
            photo: currentPhotos[currentPhotoIndex],
            photoIndex: currentPhotoIndex,
            subIndex: selectedSubIndex || 0,
            width: desiredWidth,
            height: desiredHeight,
            sogniClient,
            setPhotos,
            outputFormat: outputFormat,
            clearFrameCache: clearFrameCacheForPhoto,
            onSetActiveProject: (projectId) => {
              activeProjectReference.current = projectId;
            }
          });
        }, 0);
      }
      return currentPhotos; // Don't modify photos array here
    });
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto]);

  // Handle enhancement with Kontext (with custom prompt)
  const handleEnhanceWithKontext = useCallback(() => {
    setShowEnhanceDropdown(false);
    setShowPromptModal(true);
    setCustomPrompt('');
  }, []);

  // Handle prompt modal submission
  const handlePromptSubmit = useCallback(() => {
    if (!customPrompt.trim()) return;
    
    setShowPromptModal(false);
    
    // Use the functional form of setPhotos to get the latest state
    setPhotos(currentPhotos => {
      const currentPhotoIndex = selectedPhotoIndex;
      if (currentPhotoIndex !== null && currentPhotos[currentPhotoIndex] && !currentPhotos[currentPhotoIndex].enhancing) {
        // Call enhance photo with Kontext in the next tick to ensure we have the latest state
        setTimeout(() => {
          enhancePhoto({
            photo: currentPhotos[currentPhotoIndex],
            photoIndex: currentPhotoIndex,
            subIndex: selectedSubIndex || 0,
            width: desiredWidth,
            height: desiredHeight,
            sogniClient,
            setPhotos,
            outputFormat: outputFormat,
            clearFrameCache: clearFrameCacheForPhoto,
            onSetActiveProject: (projectId) => {
              activeProjectReference.current = projectId;
            },
            // Pass Kontext-specific parameters
            useKontext: true,
            customPrompt: customPrompt.trim()
          });
        }, 0);
      }
      return currentPhotos; // Don't modify photos array here
    });
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto, customPrompt]);

  // Handle prompt modal cancel
  const handlePromptCancel = useCallback(() => {
    setShowPromptModal(false);
    setCustomPrompt('');
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEnhanceDropdown && !event.target.closest('.enhance-button-container')) {
        setShowEnhanceDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEnhanceDropdown]);

  // Skip rendering if there are no photos or the grid is hidden
  if (photos.length === 0 || !showPhotoGrid) return null;
  
  // Helper function to check if current theme supports the current aspect ratio
  const isThemeSupported = useCallback(() => {
    if (tezdevTheme === 'off') return false;
    
    // Check hardcoded theme aspect ratio requirements
    switch (tezdevTheme) {
      case 'supercasual':
      case 'tezoswebx':
      case 'taipeiblockchain': {
        return aspectRatio === 'narrow';
      }
      default:
        // For dynamic themes, assume they support all aspect ratios
        // The actual validation happens in applyTezDevFrame() which checks
        // themeConfigService.getFrameUrls() and gracefully handles unsupported combinations
        return true;
    }
  }, [tezdevTheme, aspectRatio]);
  
  // Calculate proper aspect ratio style based on the selected aspect ratio
  const getAspectRatioStyle = () => {
    let aspectRatioValue = '1/1'; // Default to square
    
    switch (aspectRatio) {
      case 'ultranarrow':
        aspectRatioValue = '768/1344';
        break;
      case 'narrow':
        aspectRatioValue = '832/1216';
        break;
      case 'portrait':
        aspectRatioValue = '896/1152';
        break;
      case 'square':
        aspectRatioValue = '1024/1024';
        break;
      case 'landscape':
        aspectRatioValue = '1152/896';
        break;
      case 'wide':
        aspectRatioValue = '1216/832';
        break;
      case 'ultrawide':
        aspectRatioValue = '1344/768';
        break;
      default:
        aspectRatioValue = '1024/1024';
        break;
    }
    
    return {
      width: '100%',
      aspectRatio: aspectRatioValue,
      margin: '0 auto',
      backgroundColor: 'white',
    };
  };
  
  const dynamicStyle = getAspectRatioStyle();
  

  
  // Ensure all photos have a Taipei frame number and frame padding assigned (migration for existing photos)
  useEffect(() => {
    const needsFrameNumbers = photos.some(photo => !photo.taipeiFrameNumber);
    const needsFramePadding = photos.some(photo => photo.framePadding === undefined);
    
    if (needsFrameNumbers || needsFramePadding) {
      const migratePhotos = async () => {
        const updatedPhotos = await Promise.all(
          photos.map(async (photo, index) => {
            const updatedPhoto = { ...photo };
            
            // Add frame number if missing
            if (!updatedPhoto.taipeiFrameNumber) {
              updatedPhoto.taipeiFrameNumber = (index % 6) + 1;
            }
            
            // Add frame padding if missing and we have a theme
            if (updatedPhoto.framePadding === undefined && tezdevTheme !== 'off') {
              try {
                const padding = await themeConfigService.getFramePadding(tezdevTheme);
                updatedPhoto.framePadding = padding;
              } catch (error) {
                console.warn('Could not get frame padding for photo migration:', error);
                updatedPhoto.framePadding = 0;
              }
            } else if (updatedPhoto.framePadding === undefined) {
              updatedPhoto.framePadding = 0;
            }
            
            return updatedPhoto;
          })
        );
        
        setPhotos(updatedPhotos);
      };
      
      void migratePhotos();
    }
  }, [photos, setPhotos, tezdevTheme]);

  // Get the Taipei frame number for the currently selected photo (stored in photo data)
  const getCurrentTaipeiFrameNumber = () => {
    if (selectedPhotoIndex !== null && photos[selectedPhotoIndex] && photos[selectedPhotoIndex].taipeiFrameNumber) {
      return photos[selectedPhotoIndex].taipeiFrameNumber;
    }
    // Fallback to frame 1 if not set (shouldn't happen with new photos)
    return 1;
  };

  // Helper function to pre-generate framed image for a specific photo index
  const preGenerateFrameForPhoto = useCallback(async (photoIndex) => {
    if (!isThemeSupported() || !photos[photoIndex]) {
      return;
    }

    const photo = photos[photoIndex];
    const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photo.enhancedImageUrl
      : photo.images[currentSubIndex];
    
    if (!imageUrl) return;

    const currentTaipeiFrameNumber = photo.taipeiFrameNumber || ((photoIndex % 6) + 1);
    const frameKey = `${photoIndex}-${currentSubIndex}-${tezdevTheme}-${currentTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
    
    // Only generate if we don't already have this framed image and it's not already being generated
    if (!framedImageUrls[frameKey] && !generatingFrames.has(frameKey)) {
      try {
        // Mark this frame as generating to prevent flicker
        setGeneratingFrames(prev => new Set(prev).add(frameKey));
        
        // Wait for fonts to load
        await document.fonts.ready;
        
        // Create composite framed image
        const framedImageUrl = await createPolaroidImage(imageUrl, '', {
          tezdevTheme,
          aspectRatio,
          frameWidth: 0,      // No polaroid frame for decorative themes
          frameTopWidth: 0,   // No polaroid frame for decorative themes  
          frameBottomWidth: 0, // No polaroid frame for decorative themes
          frameColor: 'transparent', // No polaroid background
          outputFormat: outputFormat,
          // For Taipei theme, pass the current frame number to ensure consistency
          taipeiFrameNumber: tezdevTheme === 'taipeiblockchain' ? currentTaipeiFrameNumber : undefined
        });
        
        // Store the framed image URL
        setFramedImageUrls(prev => ({
          ...prev,
          [frameKey]: framedImageUrl
        }));
        
        // Remove from generating set
        setGeneratingFrames(prev => {
          const newSet = new Set(prev);
          newSet.delete(frameKey);
          return newSet;
        });
      } catch (error) {
        console.error('Error pre-generating framed image:', error);
        // Remove from generating set even on error
        setGeneratingFrames(prev => {
          const newSet = new Set(prev);
          newSet.delete(frameKey);
          return newSet;
        });
      }
    }
  }, [isThemeSupported, photos, selectedSubIndex, outputFormat, aspectRatio]);

  // Expose the pre-generation function to parent component
  useEffect(() => {
    if (onPreGenerateFrame) {
      onPreGenerateFrame(preGenerateFrameForPhoto);
    }
  }, [onPreGenerateFrame, preGenerateFrameForPhoto]);
  
  const handlePhotoSelect = useCallback(async (index, e) => {
    const element = e.currentTarget;
    
    if (selectedPhotoIndex === index) {
      // Capture current position before removing selected state
      const first = element.getBoundingClientRect();
      setSelectedPhotoIndex(null);
      
      // Animate back to grid position
      requestAnimationFrame(() => {
        const last = element.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        const deltaScale = first.width / last.width;

        // Apply starting transform
        element.style.transition = 'none';
        element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale})`;
        
        // Force reflow
        element.offsetHeight;
        
        // Animate to final position
        element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
        
        // Clean up after animation - but preserve CSS transform for selected state
        setTimeout(() => {
          element.style.transition = '';
          if (!element.classList.contains('selected')) {
            element.style.transform = '';
          }
        }, 500);
      });
      return;
    }

    // When selecting a photo
    // Scroll to top first to ensure proper positioning
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Capture starting position
    const first = element.getBoundingClientRect();
    
    // Pre-generate framed image if using decorative theme before showing popup
    await preGenerateFrameForPhoto(index);
    
    // Update state to mark as selected
    setSelectedPhotoIndex(index);
    
    // After state update, calculate and animate
    requestAnimationFrame(() => {
      const last = element.getBoundingClientRect();
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      const deltaScale = first.width / last.width;
      
      // Apply starting transform
      element.style.transition = 'none';
      element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale})`;
      
      // Force reflow
      element.offsetHeight;
      
      // Animate to final position
      element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
    });
  }, [selectedPhotoIndex, setSelectedPhotoIndex, preGenerateFrameForPhoto]);

  // Create memoized hashtags for all photos
  const photoHashtags = useMemo(() => {
    if (!photos || !stylePrompts) return {};
    
    return photos.reduce((hashtags, photo) => {
      // Skip computing hashtag for loading photos
      if (photo.loading || photo.generating) {
        hashtags[photo.id] = '';
        return hashtags;
      }
      
      // Use existing hashtag if present
      if (photo.hashtag) {
        hashtags[photo.id] = photo.hashtag;
        return hashtags;
      }
      
      // If statusText already contains a hashtag, don't add another
      if (photo.statusText && photo.statusText.includes('#')) {
        hashtags[photo.id] = '';
        return hashtags;
      }
      
      // Try stylePrompt first
      if (photo.stylePrompt) {
        const foundStyleKey = Object.entries(stylePrompts).find(
          ([, value]) => value === photo.stylePrompt
        )?.[0];
        
        if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix') {
          hashtags[photo.id] = `#${foundStyleKey}`;
          return hashtags;
        }
      }
      
      // Try positivePrompt next
      if (photo.positivePrompt) {
        const foundStyleKey = Object.entries(stylePrompts).find(
          ([, value]) => value === photo.positivePrompt
        )?.[0];
        
        if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix') {
          hashtags[photo.id] = `#${foundStyleKey}`;
          return hashtags;
        }
      }
      
      // Fall back to selectedStyle
      if (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix') {
        hashtags[photo.id] = `#${selectedStyle}`;
        return hashtags;
      }
      
      // Default empty hashtag
      hashtags[photo.id] = '';
      return hashtags;
    }, {});
  }, [photos, stylePrompts, selectedStyle]);

  // Get hashtag for a specific photo (memoized lookup)
  const getStyleHashtag = useCallback((photo) => {
    return photoHashtags[photo.id] || '';
  }, [photoHashtags]);


  useEffect(() => {
    if (selectedPhotoIndex !== null) {
      document.body.classList.add('has-selected-photo');
    } else {
      document.body.classList.remove('has-selected-photo');
    }
    return () => {
      document.body.classList.remove('has-selected-photo');
    };
  }, [selectedPhotoIndex]);

  // Generate composite framed image when photo is selected with decorative theme
  useEffect(() => {
    const generateFramedImage = async () => {
      // Only generate for selected photos with supported themes
      if (selectedPhotoIndex === null || !isThemeSupported() || !photos[selectedPhotoIndex]) {
        return;
      }

      const photo = photos[selectedPhotoIndex];
      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
        ? -1 // Special case for enhanced images
        : (selectedSubIndex || 0);
        
      const imageUrl = currentSubIndex === -1
        ? photo.enhancedImageUrl
        : photo.images[currentSubIndex];
      
      if (!imageUrl) return;

      // Create a unique key for this photo + theme + format combination
      const currentTaipeiFrameNumber = getCurrentTaipeiFrameNumber();
      const frameKey = `${selectedPhotoIndex}-${currentSubIndex}-${tezdevTheme}-${currentTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
      
      // Skip if we already have this framed image
      if (framedImageUrls[frameKey]) {
        return;
      }

      try {
        // Mark this frame as generating to prevent flicker
        setGeneratingFrames(prev => new Set(prev).add(frameKey));
        
        // Wait for fonts to load
        await document.fonts.ready;
        
        // Create composite framed image using the same logic as download
        // Use the actual outputFormat setting to match framed downloads (not Twitter sharing)
        const framedImageUrl = await createPolaroidImage(imageUrl, '', {
          tezdevTheme,
          aspectRatio,
          frameWidth: 0,      // No polaroid frame for decorative themes
          frameTopWidth: 0,   // No polaroid frame for decorative themes  
          frameBottomWidth: 0, // No polaroid frame for decorative themes
          frameColor: 'transparent', // No polaroid background
          outputFormat: outputFormat, // Use the actual outputFormat setting to match framed downloads
          // For Taipei theme, pass the current frame number to ensure consistency
          taipeiFrameNumber: tezdevTheme === 'taipeiblockchain' ? currentTaipeiFrameNumber : undefined
        });
        
        // Store the framed image URL
        setFramedImageUrls(prev => ({
          ...prev,
          [frameKey]: framedImageUrl
        }));
        
        // Remove from generating set
        setGeneratingFrames(prev => {
          const newSet = new Set(prev);
          newSet.delete(frameKey);
          return newSet;
        });
        
      } catch (error) {
        console.error('Error generating framed image for right-click save:', error);
        // Remove from generating set even on error
        setGeneratingFrames(prev => {
          const newSet = new Set(prev);
          newSet.delete(frameKey);
          return newSet;
        });
      }
    };

    generateFramedImage();
  }, [selectedPhotoIndex, selectedSubIndex, photos, aspectRatio, outputFormat, framedImageUrls, isThemeSupported]);

  // Track photo selection changes to manage smooth transitions
  useEffect(() => {
    if (selectedPhotoIndex !== previousSelectedIndex && isThemeSupported()) {
      // Store the current framed image before switching
      if (previousSelectedIndex !== null && photos[previousSelectedIndex]) {
        const prevPhoto = photos[previousSelectedIndex];
        const prevSubIndex = prevPhoto.enhanced && prevPhoto.enhancedImageUrl ? -1 : (selectedSubIndex || 0);
        const prevTaipeiFrameNumber = prevPhoto.taipeiFrameNumber || 1;
        const prevFrameKey = `${previousSelectedIndex}-${prevSubIndex}-${tezdevTheme}-${prevTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
        const prevFramedImageUrl = framedImageUrls[prevFrameKey];
        
        if (prevFramedImageUrl) {
          setPreviousFramedImage(prevFramedImageUrl);
        }
      }
      
      setPreviousSelectedIndex(selectedPhotoIndex);
    }
  }, [selectedPhotoIndex, previousSelectedIndex, photos, selectedSubIndex, tezdevTheme, outputFormat, aspectRatio, framedImageUrls, isThemeSupported]);

  // Cleanup old framed image URLs to prevent memory leaks
  useEffect(() => {
    const cleanup = () => {
      const currentKeys = Object.keys(framedImageUrls);
      if (currentKeys.length > 16) { // Keep only last 16 framed images
        const keysToRemove = currentKeys.slice(0, -16);
        keysToRemove.forEach(key => {
          if (framedImageUrls[key] && framedImageUrls[key].startsWith('data:')) {
            // Revoke blob URLs to free memory (data URLs don't need revoking)
            URL.revokeObjectURL(framedImageUrls[key]);
          }
        });
        setFramedImageUrls(prev => {
          const cleaned = { ...prev };
          keysToRemove.forEach(key => delete cleaned[key]);
          return cleaned;
        });
      }
    };

    cleanup();
  }, []);

  // Universal download function that works on all devices
  const downloadImage = async (imageUrl, filename) => {
    try {
      // Use mobile-optimized download for mobile devices
      if (isMobile()) {
        const result = await downloadImageMobile(imageUrl, filename);
        // If mobile download returns true (success or user cancellation), don't fallback
        if (result) {
          return true;
        }
        // Only fallback if mobile download explicitly failed (returned false)
      }
      
      // Standard desktop download
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      return true;
    } catch (error) {
      console.error('Download failed:', error);
      // Only fallback to opening in new tab for non-mobile or when mobile explicitly fails
      if (!isMobile()) {
        window.open(imageUrl, '_blank');
      }
      return false;
    }
  };

  // Handle download photo with polaroid frame
  const handleDownloadPhoto = async (photoIndex) => {
    if (!photos[photoIndex] || !photos[photoIndex].images || photos[photoIndex].images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = photos[photoIndex].enhanced && photos[photoIndex].enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photos[photoIndex].enhancedImageUrl
      : photos[photoIndex].images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Get hashtag from photo data
      const styleHashtag = getPhotoHashtag(photos[photoIndex]);
      
      // Determine photo label (only used for default polaroid frame)
      const photoNumberLabel = photos[photoIndex]?.statusText?.split('#')[0]?.trim() || photos[photoIndex]?.label || '';
      const photoLabel = photoNumberLabel + (styleHashtag ? ` ${styleHashtag}` : '');
      
      // Generate filename based on outputFormat setting
      const cleanHashtag = styleHashtag ? styleHashtag.replace('#', '').toLowerCase() : 'sogni';
      const fileExtension = outputFormat === 'png' ? '.png' : '.jpg';
      const filename = `sogni-photobooth-${cleanHashtag}-framed${fileExtension}`;
      
      // Ensure font is loaded
      if (!document.querySelector('link[href*="Permanent+Marker"]')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
      }
      
      // Wait for fonts to load
      await document.fonts.ready;
      
      // Create framed image: supported custom theme frame OR default polaroid frame
      // Use the outputFormat setting for framed downloads (unlike Twitter which always uses JPG)
      const useTheme = isThemeSupported();
      const polaroidUrl = await createPolaroidImage(imageUrl, !useTheme ? photoLabel : '', {
        tezdevTheme: useTheme ? tezdevTheme : 'off',
        aspectRatio,
        // If theme is not supported, use default polaroid frame; otherwise no polaroid frame
        frameWidth: !useTheme ? 56 : 0,
        frameTopWidth: !useTheme ? 56 : 0,
        frameBottomWidth: !useTheme ? 196 : 0,
        frameColor: !useTheme ? 'white' : 'transparent',
        outputFormat: outputFormat, // Use the actual outputFormat setting for framed downloads
        // For Taipei theme, pass the current frame number to ensure consistency
        taipeiFrameNumber: useTheme && tezdevTheme === 'taipeiblockchain' ? photos[photoIndex].taipeiFrameNumber : undefined
      });
      
             // Handle download
       downloadImage(polaroidUrl, filename);
    } catch (error) {
      console.error('Error downloading photo:', error);
    }
  };

  // Handle download raw photo WITHOUT any frame theme (pure original image)
  const handleDownloadRawPhoto = async (photoIndex) => {
    if (!photos[photoIndex] || !photos[photoIndex].images || photos[photoIndex].images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = photos[photoIndex].enhanced && photos[photoIndex].enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photos[photoIndex].enhancedImageUrl
      : photos[photoIndex].images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Generate filename with correct extension based on outputFormat
      const styleHashtag = getPhotoHashtag(photos[photoIndex]);
      const cleanHashtag = styleHashtag ? styleHashtag.replace('#', '').toLowerCase() : 'sogni';
      
      // For raw downloads, ensure we preserve the original format from the server
      // First, try to detect the actual format from the image URL or by fetching it
      let actualExtension = outputFormat === 'jpg' ? '.jpg' : '.png';
      
      try {
        // If this is a blob URL, we can fetch it to check the MIME type
        if (imageUrl.startsWith('blob:') || imageUrl.startsWith('http')) {
          const response = await fetch(imageUrl);
          const contentType = response.headers.get('content-type');
          if (contentType) {
            if (contentType.includes('image/png')) {
              actualExtension = '.png';
            } else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
              actualExtension = '.jpg';
            }
            console.log(`[RAW DOWNLOAD] Detected image format: ${contentType}, using extension: ${actualExtension}`);
          }
          // Don't consume the response body, just use the headers
        }
      } catch (formatDetectionError) {
        console.warn('Could not detect image format, using outputFormat setting:', formatDetectionError);
        // Fall back to outputFormat setting
      }
      
      const filename = `sogni-photobooth-${cleanHashtag}-raw${actualExtension}`;
      
      // Raw download is ALWAYS the original image without any frames or processing
      console.log(`[RAW DOWNLOAD] Downloading original image as: ${filename}`);
      downloadImage(imageUrl, filename);
    } catch (error) {
      console.error('Error downloading raw photo:', error);
    }
  };

  // Detect if running as PWA
  const isPWA = useMemo(() => {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone ||
           document.referrer.includes('android-app://');
  }, []);

  return (
    <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'} ${isPWA ? 'pwa-mode' : ''}`}
      style={{
        background: 'rgba(248, 248, 248, 0.85)',
        backgroundImage: `
          linear-gradient(125deg, rgba(255,138,0,0.8), rgba(229,46,113,0.8), rgba(185,54,238,0.8), rgba(58,134,255,0.8)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px),
          repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px)
        `,
        backgroundSize: '400% 400%, 20px 20px, 20px 20px',
        animation: backgroundAnimationsEnabled && !isPWA ? 'psychedelic-shift 15s ease infinite' : 'none',
      }}
    >
      <button
        className="corner-btn"
        onClick={handleBackToCamera}
      >
        ← 📸
      </button>
      {/* Settings button - always show in photo grid */}
      {selectedPhotoIndex === null && (
        <button
          className="header-settings-btn"
          onClick={handleShowControlOverlay}
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 1000,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      )}
      {/* More button - positioned on the right side */}
      {((!isGenerating && selectedPhotoIndex === null) || (isGenerating && showMoreButtonDuringGeneration && selectedPhotoIndex === null)) && (
        <button
          className="more-photos-btn corner-btn"
          onClick={handleMoreButtonClick}
          disabled={!isGenerating && (activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            left: 'auto',
            cursor: (!isGenerating && (activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) ? 'not-allowed' : 'pointer',
            zIndex: 9999,
            opacity: (!isGenerating && (activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) ? 0.6 : 1,
            backgroundColor: isGenerating ? '#ff6b6b' : undefined, // Red background when in cancel mode
            borderColor: isGenerating ? '#ff6b6b' : undefined,
          }}
          title={isGenerating ? 'Cancel current generation and start new batch' : 'Generate more photos'}
        >
          {isGenerating ? 'Cancel & More ✨' : 'More ✨'}
        </button>
      )}
      {/* Navigation buttons - only show when a photo is selected */}
      {selectedPhotoIndex !== null && photos.length > 1 && (
        <>
          <button className="photo-nav-btn prev" onClick={handlePreviousPhoto}>
            &#8249;
          </button>
          <button className="photo-nav-btn next" onClick={handleNextPhoto}>
            &#8250;
          </button>
          <button 
            className="photo-close-btn" 
            onClick={() => setSelectedPhotoIndex(null)}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 99999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={e => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={e => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
          >
            ×
          </button>
        </>
      )}
      {/* Also add a close button when there's only one photo */}
      {selectedPhotoIndex !== null && photos.length === 1 && (
        <button 
          className="photo-close-btn" 
          onClick={() => setSelectedPhotoIndex(null)}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            fontSize: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 99999,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>
      )}
      {/* Add these buttons when a photo is selected */}
      {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
        <div className="photo-action-buttons" style={{
          display: 'flex',
          justifyContent: 'center',
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
        }}>
          {/* Share to X Button */}
          <button
            className="action-button twitter-btn"
            onClick={(e) => {
              handleShareToX(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              photos[selectedPhotoIndex].loading || 
              photos[selectedPhotoIndex].enhancing ||
              photos[selectedPhotoIndex].error ||
              !photos[selectedPhotoIndex].images ||
              photos[selectedPhotoIndex].images.length === 0
            }
          >
            <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24"><path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/></svg>
            {tezdevTheme !== 'off' ? 'Get your print!' : 'Share'}
          </button>

          {/* Download Framed Button - Always show */}
          <button
            className="action-button download-btn"
            onClick={(e) => {
              handleDownloadPhoto(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              photos[selectedPhotoIndex].loading || 
              photos[selectedPhotoIndex].enhancing ||
              photos[selectedPhotoIndex].error ||
              !photos[selectedPhotoIndex].images ||
              photos[selectedPhotoIndex].images.length === 0
            }
          >
            <span>💾</span>
            Framed
          </button>

          {/* Download Raw Button - Always show */}
          <button
            className="action-button download-raw-btn"
            onClick={(e) => {
              handleDownloadRawPhoto(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              photos[selectedPhotoIndex].loading || 
              photos[selectedPhotoIndex].enhancing ||
              photos[selectedPhotoIndex].error ||
              !photos[selectedPhotoIndex].images ||
              photos[selectedPhotoIndex].images.length === 0
            }
          >
            <span>💾</span>
            Raw
          </button>

          {/* Enhanced Enhance Button with Undo/Redo functionality */}
          <div className="enhance-button-container" style={{ position: 'relative', display: 'inline-block', zIndex: 2147483646 }}>
            {photos[selectedPhotoIndex].enhanced ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="action-button enhance-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhotoIndex !== null) {
                      undoEnhancement({
                        photoIndex: selectedPhotoIndex,
                        subIndex: selectedSubIndex || 0,
                        setPhotos,
                        clearFrameCache: clearFrameCacheForPhoto
                      });
                    }
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error}
                >
                  ↩️ Undo
                </button>
                <button
                  className={`action-button enhance-btn ${photos[selectedPhotoIndex].enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (photos[selectedPhotoIndex].enhancing) return;
                    // Show the enhance options dropdown (Krea/Kontext)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
                >
                  <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                    (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : photos[selectedPhotoIndex].canRedo ? (
              // Show both Redo and Enhance buttons when redo is available
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="action-button enhance-btn redo-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhotoIndex !== null) {
                      redoEnhancement({
                        photoIndex: selectedPhotoIndex,
                        subIndex: selectedSubIndex || 0,
                        setPhotos,
                        clearFrameCache: clearFrameCacheForPhoto
                      });
                    }
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
                >
                  ↪️ Redo
                </button>
                <button
                  className={`action-button enhance-btn ${photos[selectedPhotoIndex].enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    // Prevent double-clicking by checking if already enhancing
                    if (photos[selectedPhotoIndex].enhancing) {
                      console.log('[ENHANCE] Already enhancing, ignoring click');
                      return;
                    }
                    
                    // Show dropdown menu (same as single enhance button)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
                >
                  <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                    (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : (
              <button
                className={`action-button enhance-btn ${photos[selectedPhotoIndex].enhancing ? 'loading' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // Prevent double-clicking by checking if already enhancing
                  if (photos[selectedPhotoIndex].enhancing) {
                    console.log('[ENHANCE] Already enhancing, ignoring click');
                    return;
                  }
                  
                  // Show dropdown menu
                  setShowEnhanceDropdown(prev => !prev);
                }}
                disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
              >
                <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                  (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                    `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                    'Enhancing') : 
                  'Enhance'}</span>
              </button>
            )}

            {/* Enhancement Options Dropdown */}
            {showEnhanceDropdown && !photos[selectedPhotoIndex].enhancing && (
              <div 
                className="enhance-dropdown"
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '8px',
                  background: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  zIndex: 2147483647,
                  minWidth: '310px',
                  border: '1px solid rgba(0,0,0,0.1)'
                }}
              >
                <button
                  className="dropdown-option"
                  onClick={handleEnhanceWithKrea}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#333',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseOver={e => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                >
                  ✨ Enhance with Flux.1 Krea
                </button>
                <button
                  className="dropdown-option"
                  onClick={handleEnhanceWithKontext}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#333',
                    transition: 'background-color 0.2s ease',
                    borderTop: '1px solid rgba(0,0,0,0.1)'
                  }}
                  onMouseOver={e => e.target.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                >
                  🎨 Modify with Flux.1 Kontext
                </button>
              </div>
            )}
            
            {/* Error message */}
            {photos[selectedPhotoIndex].enhancementError && (
              <div 
                className="enhancement-error" 
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '0',
                  right: '0',
                  marginTop: '4px',
                  background: 'rgba(255, 0, 0, 0.9)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  textAlign: 'center',
                  zIndex: 10,
                  maxWidth: '200px',
                  wordWrap: 'break-word',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  // Allow users to dismiss error by clicking
                  setPhotos(prev => {
                    const updated = [...prev];
                    if (updated[selectedPhotoIndex]) {
                      updated[selectedPhotoIndex] = {
                        ...updated[selectedPhotoIndex],
                        enhancementError: null
                      };
                    }
                    return updated;
                  });
                }}
                title="Click to dismiss"
              >
                {photos[selectedPhotoIndex].enhancementError}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Settings button when viewing a photo */}
      {selectedPhotoIndex !== null && (
        <button
          className="header-settings-btn"
          onClick={handleShowControlOverlay}
          style={{
            position: 'fixed',
            top: 24,
            right: 72,
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 99999,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      )}
      {/* Help button in photo grid view */}
      <button
        className="header-info-btn"
        onClick={toggleNotesModal}
        style={{
          position: 'fixed',
          top: 24,
          right: selectedPhotoIndex !== null ? 120 : 72,
          background: 'linear-gradient(135deg, #ffb6e6 0%, #ff5e8a 100%)',
          border: 'none',
          color: '#fff',
          fontSize: 22,
          width: 38,
          height: 38,
          borderRadius: '50%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          fontWeight: 900,
          lineHeight: 1,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          zIndex: 1000,
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        }}
        title="Photobooth Tips"
      >
        ?
      </button>
      <div className={`film-strip-content ${selectedPhotoIndex === null ? '' : 'has-selected'}`} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '32px',
        justifyItems: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '32px'
      }}>
        {photos.map((photo, index) => {
          const isSelected = index === selectedPhotoIndex;
          const isReference = photo.isOriginal;
          const placeholderUrl = photo.originalDataUrl;
          const progress = Math.floor(photo.progress || 0);
          const loadingLabel = progress > 0 ? `${progress}%` : "";
          const labelText = isReference ? "Reference" : `#${index-keepOriginalPhoto+1}`;
          // Loading or error state
          if ((photo.loading && photo.images.length === 0) || (photo.error && photo.images.length === 0)) {
            return (
              <div
                key={photo.id}
                className={`film-frame loading ${isSelected ? 'selected' : ''} ${photo.newlyArrived ? 'newly-arrived' : ''} ${isSelected && isThemeSupported() && tezdevTheme === 'supercasual' ? 'super-casual-theme' : ''} ${isSelected && isThemeSupported() && tezdevTheme === 'tezoswebx' ? 'tezos-webx-theme' : ''}`}
                data-enhancing={photo.enhancing ? 'true' : undefined}
                data-error={photo.error ? 'true' : undefined}
                data-enhanced={photo.enhanced ? 'true' : undefined}
  
                onClick={() => isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index)}
                style={{
                  width: '100%',
                  margin: '0 auto',
                  backgroundColor: 'white',
                  position: 'relative',
                  borderRadius: '2px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  '--stagger-delay': `${index * 1}s` // Add staggered delay based on index
                }}
              >
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: dynamicStyle.aspectRatio,
                  overflow: 'hidden'
                }}>
                  <PlaceholderImage placeholderUrl={placeholderUrl} />
                </div>
                <div className="photo-label">
                  {photo.error ? 
                    <div>
                      <div style={{ marginBottom: '8px' }}>
                        {typeof photo.error === 'object' ? 'GENERATION FAILED: unknown error' : photo.error}
                      </div>
                      {photo.retryable && handleRetryPhoto && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryPhoto(index);
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
                            border: 'none',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                          }}
                        >
                          🔄 Retry
                        </button>
                      )}
                    </div>
                    : photo.loading || photo.generating ? 
                      (photo.statusText || loadingLabel || labelText) 
                      : (photo.statusText || labelText) + (photo.hashtag ? ` ${photo.hashtag}` : getStyleHashtag(photo) ? ` ${getStyleHashtag(photo)}` : '')}
                </div>
              </div>
            );
          }
          // Show completed image
          const thumbUrl = photo.images[0] || '';
          // Determine if photo is fully loaded - simplified condition for better theme switching
          const isLoaded = (!photo.loading && !photo.generating && photo.images.length > 0 && thumbUrl);
          
          return (
            <div 
              key={photo.id}
              className={`film-frame ${isSelected ? 'selected' : ''} ${photo.loading ? 'loading' : ''} ${isLoaded ? 'loaded' : ''} ${photo.newlyArrived ? 'newly-arrived' : ''} ${isSelected && isThemeSupported() && tezdevTheme === 'supercasual' ? 'super-casual-theme' : ''} ${isSelected && isThemeSupported() && tezdevTheme === 'tezoswebx' ? 'tezos-webx-theme' : ''} ${isSelected && isThemeSupported() && tezdevTheme === 'taipeiblockchain' ? 'taipei-blockchain-theme' : ''}`}
              onClick={e => isSelected ? handlePhotoViewerClick(e) : handlePhotoSelect(index, e)}
              data-enhancing={photo.enhancing ? 'true' : undefined}
              data-error={photo.error ? 'true' : undefined}
              data-enhanced={photo.enhanced ? 'true' : undefined}

              style={{
                width: '100%',
                margin: '0 auto',
                backgroundColor: 'white',
                position: 'relative',
                borderRadius: '2px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: dynamicStyle.aspectRatio,
                overflow: 'hidden'
              }}>
                <img 
                  src={(() => {
                    // For selected photos with supported themes, use composite framed image if available
                    if (isSelected && isThemeSupported()) {
                      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                        ? -1 // Special case for enhanced images
                        : (selectedSubIndex || 0);
                      const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                      const frameKey = `${index}-${currentSubIndex}-${tezdevTheme}-${photoTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
                      const framedImageUrl = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (framedImageUrl) {
                        // Clear previous framed image since we have the new one
                        if (previousFramedImage) {
                          setPreviousFramedImage(null);
                        }
                        return framedImageUrl;
                      }
                      
                      // If we're generating a frame and have a previous framed image, use that to prevent flicker
                      if (isGeneratingFrame && previousFramedImage) {
                        return previousFramedImage;
                      }
                      
                      // Fall back to original image
                      return thumbUrl;
                    }
                    // Default to original image
                    return thumbUrl;
                  })()}
                  alt={`Generated #${index}`}
                  onLoad={e => {
                    // Enable mobile-optimized download functionality when image loads
                    enableMobileImageDownload(e.target);
                    
                    // Remove fade-in animation to prevent post-load pulse
                    const img = e.target;
                    if (!img.classList.contains('fade-in-complete')) {
                      img.classList.add('fade-in-complete');
                      
                      // For newly arrived photos, delay opacity setting to allow transition
                      // BUT: Don't set inline opacity on placeholder images during loading - let CSS animation control it
                      if (img.classList.contains('placeholder') && photo.loading) {
                        // Skip opacity setting for loading placeholders - CSS animation controls this
                        console.log('Skipping inline opacity for loading placeholder - CSS animation controls it');
                      } else if (photo.newlyArrived) {
                        // Start with opacity 0.01 (almost invisible but not completely transparent)
                        // This prevents white background from showing while keeping transition smooth
                        img.style.opacity = '0.01';
                        setTimeout(() => {
                          img.style.opacity = photo.isPreview ? '0.25' : '1';
                        }, 10);
                      } else {
                        // Set opacity immediately without animation to prevent pulse
                        img.style.opacity = photo.isPreview ? '0.25' : '1';
                      }
                    }
                  }}
                  onError={e => {
                    if (photo.originalDataUrl && e.target.src !== photo.originalDataUrl) {
                      e.target.src = photo.originalDataUrl;
                      e.target.style.opacity = '0.7';
                      e.target.classList.add('fallback');
                      setPhotos(prev => {
                        const updated = [...prev];
                        if (updated[index]) {
                          updated[index] = {
                            ...updated[index],
                            loadError: true,
                            statusText: `${updated[index].statusText || 'Whoops, image failed to load'}`
                          };
                        }
                        return updated;
                      });
                    }
                  }}
                  onContextMenu={e => {
                    // Allow native context menu for image downloads
                    e.stopPropagation();
                  }}
                  style={(() => {
                    const baseStyle = {
                      objectFit: 'cover',
                      position: 'relative',
                      display: 'block',
                      opacity: 0 // Start invisible, will be set to 1 immediately via onLoad without transition
                    };
                    
                    // For supported themes with frame padding, account for the border
                    if (isSelected && isThemeSupported()) {
                      // Check if we have a composite framed image - if so, use full size
                      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                        ? -1 // Special case for enhanced images
                        : (selectedSubIndex || 0);
                      const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                      const frameKey = `${index}-${currentSubIndex}-${tezdevTheme}-${photoTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
                      const hasFramedImage = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (!hasFramedImage) {
                        // No composite image yet, so check for frame padding and adjust
                        // Use cached frame padding from photo data or get it dynamically
                        const framePadding = photo.framePadding || 0;
                        if (framePadding > 0) {
                          const borderPercent = `${framePadding}px`;
                          return {
                            ...baseStyle,
                            width: `calc(100% - ${framePadding * 2}px)`,
                            height: `calc(100% - ${framePadding * 2}px)`,
                            top: borderPercent,
                            left: borderPercent,
                            // Add a subtle loading state when framed image is not ready
                            filter: isGeneratingFrame ? 'brightness(0.8) saturate(0.8)' : 'brightness(0.9) saturate(0.9)',
                            transition: 'filter 0.3s ease'
                          };
                        } else {
                          // No frame padding but still loading framed image
                          return {
                            ...baseStyle,
                            filter: isGeneratingFrame ? 'brightness(0.8) saturate(0.8)' : 'brightness(0.9) saturate(0.9)',
                            transition: 'filter 0.3s ease'
                          };
                        }
                      } else {
                        // Framed image is ready, remove any loading effects
                        return {
                          ...baseStyle,
                          filter: 'none',
                          transition: 'filter 0.3s ease'
                        };
                      }
                    }
                    
                    // Default styling for all other cases
                    return {
                      ...baseStyle,
                      width: '100%',
                      top: 0,
                      left: 0
                    };
                  })()}
                />
                
                {/* Event Theme Overlays - Only show on selected (popup) view when theme is supported and not using composite framed image */}
                {thumbUrl && isLoaded && isSelected && isThemeSupported() && !(() => {
                  // Check if we have a composite framed image for this photo
                  const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                    ? -1 // Special case for enhanced images
                    : (selectedSubIndex || 0);
                  const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                  const frameKey = `${index}-${currentSubIndex}-${tezdevTheme}-${photoTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
                  return framedImageUrls[frameKey];
                })() && (
                  <>

                    {/* Super Casual Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'supercasual' && aspectRatio === 'narrow' && (
                      <img
                        src="/events/super-casual.png"
                        alt="Super Casual Frame"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    
                    {/* Tezos WebX Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'tezoswebx' && aspectRatio === 'narrow' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          backgroundImage: `url(/events/tz_webx.png)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    
                    {/* Taipei Blockchain Week Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'taipeiblockchain' && aspectRatio === 'narrow' && (
                      <img
                        src={`/events/taipei-blockchain-2025/narrow_${photo.taipeiFrameNumber || 1}.png`}
                        alt="Taipei Blockchain Week Frame"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    

                  </>
                )}
              </div>
              {/* No special label for selected view - use standard grid label below */}
              <div className="photo-label">
                {photo.loading || photo.generating ? 
                  (photo.statusText || labelText) 
                  : (photo.statusText || labelText) + (photo.hashtag ? ` ${photo.hashtag}` : getStyleHashtag(photo) ? ` ${getStyleHashtag(photo)}` : '')}
              </div>
            </div>
          );
        })}
      </div>
      {/* Only render slothicorn if animation is enabled */}
      {slothicornAnimationEnabled && (
        <div className="slothicorn-container">
          {/* Slothicorn content */}
        </div>
      )}

      {/* Custom Prompt Modal for Kontext Enhancement */}
      {showPromptModal && (
        <div 
          className="prompt-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483647,
            padding: '20px'
          }}
          onClick={handlePromptCancel}
        >
          <div 
            className="prompt-modal"
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              position: 'relative',
              color: '#222'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center'
            }}>
              Modify with Flux.1 Kontext
            </h3>
            
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '14px',
              color: '#666',
              textAlign: 'center',
              lineHeight: '1.4'
            }}>
              Type what you want to change in the picture
            </p>
            
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g., zoom out, recreate the scene in legos, add a speach bubble"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s ease',
                color: '#222',
                backgroundColor: '#fff'
              }}
              onFocus={e => e.target.style.borderColor = '#4bbbd3'}
              onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              autoFocus
            />
            
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '20px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handlePromptCancel}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #ddd',
                  background: 'white',
                  color: '#666',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.borderColor = '#ccc';
                }}
                onMouseOut={e => {
                  e.target.style.backgroundColor = 'white';
                  e.target.style.borderColor = '#ddd';
                }}
              >
                Cancel
              </button>
              
              <button
                onClick={handlePromptSubmit}
                disabled={!customPrompt.trim()}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  background: customPrompt.trim() ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' : '#ccc',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: customPrompt.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s ease',
                  opacity: customPrompt.trim() ? 1 : 0.6
                }}
                onMouseOver={e => {
                  if (customPrompt.trim()) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.3)';
                  }
                }}
                onMouseOut={e => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                🎨 Change It!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

PhotoGallery.propTypes = {
  photos: PropTypes.array.isRequired,
  selectedPhotoIndex: PropTypes.number,
  setSelectedPhotoIndex: PropTypes.func.isRequired,
  showPhotoGrid: PropTypes.bool.isRequired,
  handleBackToCamera: PropTypes.func.isRequired,
  handlePreviousPhoto: PropTypes.func.isRequired,
  handleNextPhoto: PropTypes.func.isRequired,
  handlePhotoViewerClick: PropTypes.func.isRequired,
  handleGenerateMorePhotos: PropTypes.func.isRequired,
  handleShowControlOverlay: PropTypes.func.isRequired,
  isGenerating: PropTypes.bool.isRequired,
  keepOriginalPhoto: PropTypes.bool.isRequired,
  lastPhotoData: PropTypes.object.isRequired,
  activeProjectReference: PropTypes.object.isRequired,
  isSogniReady: PropTypes.bool.isRequired,
  toggleNotesModal: PropTypes.func.isRequired,
  setPhotos: PropTypes.func.isRequired,
  selectedStyle: PropTypes.string,
  stylePrompts: PropTypes.object,
  enhancePhoto: PropTypes.func.isRequired,
  undoEnhancement: PropTypes.func.isRequired,
  redoEnhancement: PropTypes.func.isRequired,
  sogniClient: PropTypes.object.isRequired,
  desiredWidth: PropTypes.number.isRequired,
  desiredHeight: PropTypes.number.isRequired,
  selectedSubIndex: PropTypes.number,
  handleShareToX: PropTypes.func.isRequired,
  slothicornAnimationEnabled: PropTypes.bool.isRequired,
  backgroundAnimationsEnabled: PropTypes.bool,
  tezdevTheme: PropTypes.string,
  aspectRatio: PropTypes.string,
  handleRetryPhoto: PropTypes.func,
  outputFormat: PropTypes.string,
  onPreGenerateFrame: PropTypes.func, // New prop for frame pre-generation callback
};

export default React.memo(PhotoGallery); 