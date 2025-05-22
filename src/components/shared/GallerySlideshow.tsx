import React, { useState, useEffect, useRef } from 'react';
import './GallerySlideshow.css';

// Array of gallery images from the public folder
const galleryImages = [
  "/gallery/000_sumiDragon_photo_1747906649816.jpg",
  "/gallery/001_SogniPhotobooth_photo_1747904820619.jpg",
  "/gallery/002_lowInkRiso_photo_1747904828230.jpg",
  "/gallery/003_stoneMoss_photo_1747904985324.jpg",
  "/gallery/004_dapperVictorian_photo_1747904947474.jpg",
  "/gallery/005_comicManga_photo_1747905114103.jpg",
  "/gallery/006_animeClassic_photo_1747905136831.jpg",
  "/gallery/007_techBlueprint_photo_1747904990445.jpg",
  "/gallery/101_SogniPhotobooth_photo_1747904261203.jpg",
  "/gallery/102_kahloFloral_photo_1747905629329.jpg",
  "/gallery/103_relaxBath_photo_1747905797246.jpg",
  "/gallery/104_statueRoman_photo_1747905695828.jpg",
  "/gallery/105_cyberGlow_photo_1747905689789.jpg",
  "/gallery/106_storybookChef_photo_1747905983816.jpg",
  "/gallery/107_vectorPop_photo_1747905663247.jpg",
  "/gallery/108_woodcutInk_photo_1747905649730.jpg"
];

// Local storage key for slideshow preference
const SLIDESHOW_HIDDEN_KEY = 'sogni_slideshow_hidden';

interface GallerySlideshowProps {
  autoplaySpeed?: number;
}

const GallerySlideshow: React.FC<GallerySlideshowProps> = ({
  autoplaySpeed = 1000
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [prevImageIndex, setPrevImageIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(false);
  const [isHidden, setIsHidden] = useState(true); // Start hidden by default
  const [isClosing, setIsClosing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false); // Track whether we've checked localStorage
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check localStorage on component mount to see if the slideshow should be hidden
  useEffect(() => {
    const slideshowHidden = localStorage.getItem(SLIDESHOW_HIDDEN_KEY);
    // Only show the slideshow if the user hasn't explicitly hidden it
    if (slideshowHidden !== 'true') {
      setIsHidden(false);
    }
    // Mark as initialized after checking localStorage
    setIsInitialized(true);
  }, []);

  // Function to preload images for smoother transitions
  useEffect(() => {
    galleryImages.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Function to go to the next image with a smooth crossfade
  const goToNextImage = () => {
    if (isPaused) return;
    
    setPrevImageIndex(currentImageIndex);
    setCurrentImageIndex((prevIndex) => (prevIndex + 1) % galleryImages.length);
  };

  // Function to close the slideshow and save preference
  const handleClose = () => {
    // Start closing animation
    setIsClosing(true);
    
    // Save preference to localStorage
    localStorage.setItem(SLIDESHOW_HIDDEN_KEY, 'true');
    
    // After animation completes, hide the slideshow
    setTimeout(() => {
      setIsHidden(true);
    }, 500); // Match the animation duration
  };

  // Pause slideshow on hover
  const handleMouseEnter = () => {
    setIsPaused(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  // Auto slideshow effect
  useEffect(() => {
    if (isPaused || isHidden || isClosing) return;
    
    timerRef.current = setInterval(goToNextImage, autoplaySpeed);
    
    // Clean up the interval on component unmount or when paused
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoplaySpeed, isPaused, currentImageIndex, isHidden, isClosing]);

  // If the slideshow is hidden or not yet initialized, don't render anything
  if (isHidden || !isInitialized) {
    return null;
  }

  return (
    <div 
      className={`gallery-slideshow ${isClosing ? 'closing' : 'visible'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button 
        className="slideshow-close-btn" 
        onClick={handleClose}
        aria-label="Close demo gallery"
      >
        CLOSE
      </button>
      <div className="slideshow-image-container">
        {galleryImages.map((src, index) => (
          <img
            key={src}
            src={src}
            alt={`Gallery sample ${index + 1}`}
            className={`slideshow-image ${index === currentImageIndex ? 'active' : ''} ${index === prevImageIndex ? 'prev' : ''}`}
          />
        ))}
      </div>
    </div>
  );
};

export default GallerySlideshow; 