import React from 'react';
import PropTypes from 'prop-types';

const PhotoGallery = ({
  photos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  showPhotoGrid,
  setShowPhotoGrid
}) => {
  return (
    <div className="film-strip-container">
      <div className="film-strip">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className={`film-frame ${selectedPhotoIndex === index ? 'selected' : ''}`}
            onClick={() => setSelectedPhotoIndex(index)}
          >
            <div className="frame-content">
              {photo.generating ? (
                <div className="generating-overlay">
                  <div className="progress-bar">
                    <div
                      className="progress"
                      style={{ width: `${photo.progress || 0}%` }}
                    />
                  </div>
                  <span className="generating-text">Generating...</span>
                </div>
              ) : photo.error ? (
                <div className="error-overlay">
                  <span className="error-text">Error</span>
                </div>
              ) : null}
              <img
                src={photo.images[0]}
                alt={`Photo ${index + 1}`}
                className={`photo-thumbnail ${photo.loading ? 'loading' : ''}`}
              />
            </div>
          </div>
        ))}
      </div>
      
      {photos.length > 0 && (
        <button
          className="toggle-grid-btn"
          onClick={() => setShowPhotoGrid(!showPhotoGrid)}
        >
          {showPhotoGrid ? 'Show Strip' : 'Show Grid'}
        </button>
      )}
    </div>
  );
};

PhotoGallery.propTypes = {
  photos: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      images: PropTypes.arrayOf(PropTypes.string).isRequired,
      generating: PropTypes.bool,
      error: PropTypes.string,
      progress: PropTypes.number,
      loading: PropTypes.bool
    })
  ).isRequired,
  selectedPhotoIndex: PropTypes.number,
  setSelectedPhotoIndex: PropTypes.func.isRequired,
  showPhotoGrid: PropTypes.bool.isRequired,
  setShowPhotoGrid: PropTypes.func.isRequired
};

export default PhotoGallery;
