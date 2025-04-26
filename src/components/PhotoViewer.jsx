import React from "react";
import PropTypes from 'prop-types';

const PhotoViewer = ({
  photos,
  selectedPhotoIndex,
  onClose,
  onPrev,
  onNext,
  onDelete,
  isClosing
}) => {
  if (selectedPhotoIndex === null || !photos[selectedPhotoIndex]) {
    return null;
  }

  const currentPhoto = photos[selectedPhotoIndex];
  const hasMultiplePhotos = photos.length > 1;

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowLeft':
        onPrev();
        break;
      case 'ArrowRight':
        onNext();
        break;
      case 'Escape':
        onClose();
        break;
      default:
        break;
    }
  };

  return (
    <div
      className={`selected-photo-container ${isClosing ? 'closing' : ''}`}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
    >
      <div className="photobooth-photo-viewer" onClick={e => e.stopPropagation()}>
        {hasMultiplePhotos && (
          <>
            <button className="nav-button prev" onClick={onPrev}>
              ‹
            </button>
            <button className="nav-button next" onClick={onNext}>
              ›
            </button>
          </>
        )}
        
        <div className="image-wrapper">
          {currentPhoto.images.map((imageUrl, index) => (
            <img
              key={index}
              src={imageUrl}
              alt={`Generated photo ${index + 1}`}
              className={`viewer-image ${index === 0 ? 'active' : ''}`}
            />
          ))}
          
          {currentPhoto.originalDataUrl && (
            <div className="original-photo">
              <img
                src={currentPhoto.originalDataUrl}
                alt="Original photo"
                className="viewer-image original"
              />
            </div>
          )}

          {onDelete && (
            <button
              className="delete-button"
              onClick={() => onDelete(selectedPhotoIndex)}
              aria-label="Delete photo"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

PhotoViewer.propTypes = {
  photos: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      images: PropTypes.arrayOf(PropTypes.string).isRequired,
      originalDataUrl: PropTypes.string,
      generating: PropTypes.bool,
      error: PropTypes.string
    })
  ).isRequired,
  selectedPhotoIndex: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onDelete: PropTypes.func,
  isClosing: PropTypes.bool
};

export default PhotoViewer;
