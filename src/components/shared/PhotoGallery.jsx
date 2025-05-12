import React, { useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles

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
  sogniClient,
  desiredWidth,
  desiredHeight,
  selectedSubIndex = 0,
}) => {
  // Skip rendering if there are no photos or the grid is hidden
  if (photos.length === 0 || !showPhotoGrid) return null;
  
  const squareStyle = {
    width: '100%',
    maxWidth: '240px',
    aspectRatio: '1 / 1',
    margin: '0 auto',
    backgroundColor: 'white',
  };
  
  const handlePhotoSelect = useCallback((index, e) => {
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
        
        // Clean up after animation
        setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, 500);
      });
      return;
    }

    // When selecting a photo
    // Scroll to top first to ensure proper positioning
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Capture starting position
    const first = element.getBoundingClientRect();
    
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
  }, [selectedPhotoIndex, setSelectedPhotoIndex]);

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

  return (
    <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'}`}
      style={{
        background: 'rgba(248, 248, 248, 0.85)',
        backgroundImage: `
          linear-gradient(125deg, rgba(255,138,0,0.8), rgba(229,46,113,0.8), rgba(185,54,238,0.8), rgba(58,134,255,0.8)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px),
          repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px)
        `,
        backgroundSize: '400% 400%, 20px 20px, 20px 20px',
        animation: 'psychedelic-shift 15s ease infinite',
      }}
    >
      <button
        className="back-to-camera-btn"
        onClick={handleBackToCamera}
        style={{
          position: 'fixed',
          left: '20px',
          bottom: '20px',
          background: 'linear-gradient(135deg, #ffb6e6 0%, #ff5e8a 100%)',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '16px',
          zIndex: 9999,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
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
      {!isGenerating && selectedPhotoIndex === null && (
        <button
          className="more-photos-btn"
          onClick={handleGenerateMorePhotos}
          disabled={activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '12px',
            zIndex: 9999,
            transition: 'all 0.2s ease',
            opacity: activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob ? 0.6 : 1,
          }}
          onMouseOver={e => {
            if (!(activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          }}
          onMouseDown={e => {
            if (!(activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) {
              e.currentTarget.style.transform = 'scale(0.95)';
            }
          }}
          onMouseUp={e => {
            if (!(activeProjectReference.current !== null || !isSogniReady || !lastPhotoData.blob)) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
        >
          More ✨
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
      {/* Add enhance button when a photo is selected - replace the ::after pseudo element */}
      {selectedPhotoIndex !== null && photos[selectedPhotoIndex] && (
        <button
          className="enhance-photo-btn"
          onClick={(e) => {
            const currentPhoto = photos[selectedPhotoIndex];
            // Handle undo enhance if already enhanced
            if (currentPhoto.enhanced && !currentPhoto.loading && !currentPhoto.enhancing) {
              undoEnhancement({
                photoIndex: selectedPhotoIndex,
                subIndex: selectedSubIndex,
                setPhotos
              });
            } 
            // Normal enhance flow
            else if (!currentPhoto.loading && !currentPhoto.enhancing) {
              enhancePhoto({
                photo: currentPhoto,
                photoIndex: selectedPhotoIndex,
                subIndex: selectedSubIndex,
                width: desiredWidth,
                height: desiredHeight,
                sogniClient,
                setPhotos,
                onSetActiveProject: (projectId) => {
                  activeProjectReference.current = projectId;
                }
              });
            }
            e.stopPropagation();
          }}
          disabled={
            photos[selectedPhotoIndex].loading || 
            photos[selectedPhotoIndex].enhancing ||
            photos[selectedPhotoIndex].error
          }
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            background: photos[selectedPhotoIndex].enhanced 
              ? 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)' 
              : photos[selectedPhotoIndex].enhancing 
                ? 'linear-gradient(to right, #72e3f2 0%, #4bbbd3 100%)'
                : photos[selectedPhotoIndex].error
                  ? 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)'
                  : 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error
              ? 'default'
              : 'pointer',
            fontWeight: 'bold',
            fontSize: '12px',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            overflow: 'hidden',
          }}
          onMouseOver={e => {
            if (!(photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error)) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          }}
          onMouseDown={e => {
            if (!(photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error)) {
              e.currentTarget.style.transform = 'scale(0.95)';
            }
          }}
          onMouseUp={e => {
            if (!(photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing || photos[selectedPhotoIndex].error)) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
        >
          {photos[selectedPhotoIndex].enhancing && (
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: photos[selectedPhotoIndex].progress !== undefined && photos[selectedPhotoIndex].progress > 0
                  ? `${Math.floor(photos[selectedPhotoIndex].progress * 100)}%`
                  : '5%',
                background: 'rgba(255, 255, 255, 0.2)',
                transition: 'width 0.5s ease',
                zIndex: 0,
                animation: photos[selectedPhotoIndex].progress === 0 || photos[selectedPhotoIndex].progress === undefined
                  ? 'progressPulse 1.5s infinite ease-in-out'
                  : 'none'
              }}
            />
          )}
          <span style={{ position: 'relative', zIndex: 1 }}>
            {photos[selectedPhotoIndex].enhanced 
              ? "↩️ Undo Enhance" 
              : photos[selectedPhotoIndex].enhancing 
                ? photos[selectedPhotoIndex].progress !== undefined && photos[selectedPhotoIndex].progress > 0
                  ? `✨ Enhancing... ${Math.floor(photos[selectedPhotoIndex].progress * 100)}%`
                  : "✨ Enhancing..."
                : photos[selectedPhotoIndex].error
                  ? "❌ Enhancement failed"
                  : "✨ Enhance"}
          </span>
        </button>
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
                className={`film-frame loading ${isSelected ? 'selected' : ''}`}
                data-fadepolaroid={photo.loading && !photo.error ? 'true' : undefined}
                data-enhancing={photo.enhancing ? 'true' : undefined}
                data-error={photo.error ? 'true' : undefined}
                data-enhanced={photo.enhanced ? 'true' : undefined}
                data-progress={Math.floor(photo.progress * 100) || 0}
                onClick={() => isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index)}
                style={{
                  ...squareStyle,
                  '--enhance-progress': photo.progress ? `${Math.floor(photo.progress * 100)}%` : '0%',
                  position: 'relative',
                  borderRadius: '3px',
                  padding: '12px',
                  paddingBottom: '60px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div>
                  {placeholderUrl && (
                    <img
                      src={placeholderUrl}
                      alt="Original reference"
                      className="placeholder"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        position: 'relative',
                        top: 0,
                        left: 0,
                        opacity: 0.7,
                        animation: photo.error ? '' : 'placeholderPulse 2s ease-in-out infinite',
                        zIndex: 1
                      }}
                    />
                  )}
                </div>
                <div className="photo-label" style={{ color: photo.error ? '#d32f2f' : undefined, fontWeight: photo.error ? 700 : undefined }}>
                  {photo.error ? 
                    `${typeof photo.error === 'object' ? 'Generation failed' : photo.error}` 
                    : photo.loading || photo.generating ? 
                      (photo.statusText || loadingLabel || labelText) 
                      : (photo.statusText || labelText) + (photo.hashtag ? ` ${photo.hashtag}` : getStyleHashtag(photo) ? ` ${getStyleHashtag(photo)}` : '')}
                </div>
              </div>
            );
          }
          // Show completed image
          const thumbUrl = photo.images[0] || '';
          return (
            <div 
              key={photo.id}
              className={`film-frame ${isSelected ? 'selected' : ''} ${photo.loading ? 'loading' : ''}`}
              onClick={e => isSelected ? handlePhotoViewerClick(e) : handlePhotoSelect(index, e)}
              data-enhancing={photo.enhancing ? 'true' : undefined}
              data-error={photo.error ? 'true' : undefined}
              data-enhanced={photo.enhanced ? 'true' : undefined}
              style={{
                ...squareStyle,
                '--enhance-progress': photo.progress ? `${Math.floor(photo.progress * 100)}%` : '0%',
                position: 'relative',
                borderRadius: '3px',
                padding: '12px',
                paddingBottom: '60px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                height: '100%'
              }}>
                <img
                  src={thumbUrl}
                  alt={`Generated #${index}`}
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
                            statusText: `${updated[index].statusText || ''} (Using original)`
                          };
                        }
                        return updated;
                      });
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    position: 'relative',
                    top: 0,
                    left: 0,
                    display: 'block',
                    animation: 'targetImageFadeIn 0.3s ease-in forwards'
                  }}
                />
              </div>
              <div className="photo-label">
                {photo.loading || photo.generating ? 
                  (photo.statusText || labelText) 
                  : (photo.statusText || labelText) + (photo.hashtag ? ` ${photo.hashtag}` : getStyleHashtag(photo) ? ` ${getStyleHashtag(photo)}` : '')}
              </div>
            </div>
          );
        })}
      </div>
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
  sogniClient: PropTypes.object.isRequired,
  desiredWidth: PropTypes.number.isRequired,
  desiredHeight: PropTypes.number.isRequired,
  selectedSubIndex: PropTypes.number,
};

export default React.memo(PhotoGallery); 