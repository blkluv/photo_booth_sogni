import React from 'react';
import { useApp } from '../context/AppContext';
import { Photo } from '../types';

interface PhotoViewerProps {
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete?: (index: number) => void;
  isClosing?: boolean;
}

const PhotoViewer: React.FC<PhotoViewerProps> = ({
  onClose,
  onPrev,
  onNext,
  onDelete,
  isClosing,
}) => {
  const {
    photos,
    selectedPhotoIndex,
    settings: { keepOriginalPhoto },
  } = useApp();

  if (selectedPhotoIndex === null || !photos[selectedPhotoIndex]) {
    return null;
  }

  const currentPhoto: Photo = photos[selectedPhotoIndex];
  const hasMultipleImages = currentPhoto.images.length > 1;
  const showOriginal = keepOriginalPhoto && currentPhoto.originalDataUrl;

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    }
  };

  return (
    <div
      className={`photo-viewer ${isClosing ? 'closing' : ''}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="photo-viewer-content">
        <button className="close-button" onClick={onClose}>
          ×
        </button>

        <button className="nav-button prev" onClick={onPrev}>
          ‹
        </button>

        <div className="photo-container">
          {showOriginal && (
            <div className="photo-item original">
              <img src={currentPhoto.originalDataUrl} alt="Original" />
              <div className="photo-label">Original</div>
            </div>
          )}

          {currentPhoto.images.map((imageUrl, index) => (
            <div key={index} className="photo-item">
              <img src={imageUrl} alt={`Generated ${index + 1}`} />
              {hasMultipleImages && (
                <div className="photo-label">#{index + 1}</div>
              )}
            </div>
          ))}

          {currentPhoto.error && (
            <div className="error-message">
              Error generating image: {currentPhoto.error}
            </div>
          )}
        </div>

        <button className="nav-button next" onClick={onNext}>
          ›
        </button>

        {onDelete && (
          <button
            className="delete-button"
            onClick={() => onDelete(selectedPhotoIndex)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

export default PhotoViewer; 