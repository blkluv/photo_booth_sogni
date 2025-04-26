import React from 'react';
import { useApp } from '../context/AppContext';
import { Photo } from '../types';

interface PhotoGalleryProps {
  onPhotoSelect: (index: number) => void;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ onPhotoSelect }) => {
  const {
    photos,
    selectedPhotoIndex,
    showPhotoGrid,
    settings: { keepOriginalPhoto },
    setLoadedImages,
  } = useApp();

  // Don't render if no photos or grid not shown
  if (photos.length === 0 || !showPhotoGrid) return null;

  // Create scroll handler for the down arrow
  const handleScrollDown = () => {
    const filmStrip = document.querySelector(".film-strip-container");
    if (filmStrip) {
      // Scroll down 80% of the viewport height
      const scrollAmount = window.innerHeight * 0.8;
      filmStrip.scrollBy({
        top: scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className={`film-strip-container ${showPhotoGrid ? "visible" : "hiding"}`}>
      {/* Grid of photos */}
      <div
        className="film-strip-content"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "32px",
          justifyItems: "center",
          alignItems: "end",
          width: "100%",
          maxWidth: "100vw",
        }}
      >
        {photos.map((photo: Photo, i: number) => {
          const isSelected = i === selectedPhotoIndex;
          const isReference = photo.isOriginal;
          const placeholderUrl = photo.originalDataUrl;
          const progress = Math.floor(photo.progress || 0);
          const loadingLabel = progress > 0 ? `${progress}%` : "";
          const photoNumber = isReference
            ? "Reference"
            : `#${i - keepOriginalPhoto + 1}`;
          const aspectRatio = 1152 / 896;

          // Loading or error state
          if (
            (photo.loading && photo.images.length === 0) ||
            (photo.error && photo.images.length === 0)
          ) {
            return (
              <div
                key={photo.id}
                className={`film-frame loading ${isSelected ? "selected" : ""}`}
                data-progress={progress}
                style={{
                  width: "100%",
                  maxWidth: "25vw",
                  minWidth: 180,
                  boxSizing: "border-box",
                  background: "white",
                  borderRadius: 8,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                  padding: "12px 12px 36px 12px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  className="aspect-ratio-box"
                  style={{
                    position: "relative",
                    width: "100%",
                    paddingBottom: `${100 / aspectRatio}%`,
                    overflow: "hidden",
                    borderRadius: 4,
                    backgroundColor: "black",
                  }}
                >
                  {placeholderUrl && (
                    <img
                      src={placeholderUrl}
                      alt={`Loading ${progress}%`}
                      className="placeholder-image"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: 1,
                        transition: "opacity 0.5s",
                        zIndex: 1,
                        pointerEvents: "none",
                        filter: "none",
                        backgroundColor: "black",
                      }}
                    />
                  )}
                </div>
                <div
                  className="photo-label"
                  style={{
                    marginTop: 8,
                    textAlign: "center",
                    fontFamily: "Marker Felt, Marker, Comic Sans MS, sans-serif",
                    fontWeight: 600,
                    fontSize: 18,
                    letterSpacing: 1,
                    color: "#222",
                    textShadow: "0 1px 2px #fff",
                  }}
                >
                  {loadingLabel || photoNumber}
                </div>
              </div>
            );
          }

          // Show completed image (fade in over reference)
          const thumbUrl = photo.images[0] || "";
          const handleThumbClick = () => {
            onPhotoSelect(i);
          };

          return (
            <div
              key={photo.id}
              className={`film-frame ${isSelected ? "selected" : ""}`}
              onClick={handleThumbClick}
              style={{
                width: "100%",
                maxWidth: "25vw",
                minWidth: 180,
                boxSizing: "border-box",
                background: "white",
                borderRadius: 8,
                boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                padding: "12px 12px 36px 12px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                className="aspect-ratio-box"
                style={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: `${100 / aspectRatio}%`,
                  overflow: "hidden",
                  borderRadius: 4,
                }}
              >
                {placeholderUrl && (
                  <img
                    src={placeholderUrl}
                    alt="Reference"
                    className="placeholder-image"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: Math.min(((photo.progress || 0) * 0.25) / 100, 0.25),
                      zIndex: 1,
                      pointerEvents: "none",
                      filter: "none",
                    }}
                    onLoad={() =>
                      setLoadedImages((prev) => ({
                        ...prev,
                        [photo.id]: { ...prev[photo.id], ref: true },
                      }))
                    }
                  />
                )}
                {thumbUrl && (
                  <img
                    src={thumbUrl}
                    alt={`Generated #${i}`}
                    className="generated-image"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: 1,
                      zIndex: 2,
                    }}
                    onLoad={() =>
                      setLoadedImages((prev) => ({
                        ...prev,
                        [photo.id]: { ...prev[photo.id], gen: true },
                      }))
                    }
                  />
                )}
              </div>
              <div
                className="photo-label"
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  fontFamily: "Marker Felt, Marker, Comic Sans MS, sans-serif",
                  fontWeight: 600,
                  fontSize: 18,
                  letterSpacing: 1,
                  color: "#222",
                  textShadow: "0 1px 2px #fff",
                }}
              >
                {photoNumber}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhotoGallery; 