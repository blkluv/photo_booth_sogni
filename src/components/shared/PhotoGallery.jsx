import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles

const PhotoGallery = ({
  photos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  showPhotoGrid,
  handleBackToCamera,
  goToPreviousPhoto,
  goToNextPhoto,
  keepOriginalPhoto,
}) => {
  // Skip rendering if there are no photos or the grid is hidden
  if (photos.length === 0 || !showPhotoGrid) return null;
  
  const handlePhotoSelect = (index, e) => {
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
        element.style.transform = `rotate(var(--rotation))`;
        
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
      element.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaScale}) rotate(var(--rotation))`;
      
      // Force reflow
      element.offsetHeight;
      
      // Animate to final position
      element.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0.2, 1)';
      element.style.transform = 'rotate(0deg)';
    });
  };

  return (
    <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex === null ? '' : 'has-selected'}`}>
      {/* Back to Camera button */}
      <button
        className="back-to-camera-btn"
        onClick={handleBackToCamera}
      >
        ← Back to Camera
      </button>

      {/* Navigation buttons - only show when a photo is selected */}
      {selectedPhotoIndex !== null && photos.length > 1 && (
        <>
          <button className="photo-nav-btn prev" onClick={goToPreviousPhoto}>
            &#8249;
          </button>
          <button className="photo-nav-btn next" onClick={goToNextPhoto}>
            &#8250;
          </button>
        </>
      )}

      <div className={`film-strip-content ${selectedPhotoIndex === null ? '' : 'has-selected'}`}>
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
                onClick={() => isSelected ? setSelectedPhotoIndex(null) : setSelectedPhotoIndex(index)}
              >
                <div className="aspect-ratio-box">
                  {placeholderUrl && (
                    <img
                      src={placeholderUrl}
                      alt="Reference"
                      className="placeholder"
                      style={{ opacity: photo.loading && !photo.error ? undefined : 0.2, transition: 'opacity 0.5s' }}
                    />
                  )}
                </div>
                <div className="photo-label" style={{ color: photo.error ? '#d32f2f' : undefined, fontWeight: photo.error ? 700 : undefined }}>
                  {photo.error ? 
                    `Error: ${typeof photo.error === 'object' ? 'Generation failed' : photo.error}` 
                    : (loadingLabel || labelText)}
                </div>
              </div>
            );
          }

          // Show completed image
          const thumbUrl = photo.images[0] || '';

          return (
            <div 
              key={photo.id}
              className={`film-frame ${isSelected ? 'selected' : ''}`}
              onClick={(e) => handlePhotoSelect(index, e)}
              style={{
                '--rotation': `${isSelected ? '0deg' : 
                  `${(index % 2 === 0 ? 1 : -1) * (0.8 + (index % 3) * 0.5)}deg`}`  // More natural rotation based on index
              }}
            >
              <div className="aspect-ratio-box">
                <img
                  src={thumbUrl}
                  alt={`Generated #${index}`}
                />
              </div>
              <div className="photo-label">
                {labelText}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

PhotoGallery.propTypes = {
  photos: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      images: PropTypes.arrayOf(PropTypes.string).isRequired,
      loading: PropTypes.bool,
      error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
      originalDataUrl: PropTypes.string,
      isOriginal: PropTypes.bool,
      progress: PropTypes.number,
      newlyArrived: PropTypes.bool,
    })
  ).isRequired,
  selectedPhotoIndex: PropTypes.number,
  setSelectedPhotoIndex: PropTypes.func.isRequired,
  showPhotoGrid: PropTypes.bool.isRequired,
  handleBackToCamera: PropTypes.func.isRequired,
  goToPreviousPhoto: PropTypes.func.isRequired,
  goToNextPhoto: PropTypes.func.isRequired,
  keepOriginalPhoto: PropTypes.bool.isRequired,
};

export default PhotoGallery; 