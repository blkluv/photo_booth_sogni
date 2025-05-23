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

interface GallerySlideshowProps {
  autoplaySpeed?: number;
}

const GallerySlideshow: React.FC<GallerySlideshowProps> = ({
  autoplaySpeed = 1000,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [prevImageIndex, setPrevImageIndex] = useState(-1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Function to preload images for smoother transitions
  useEffect(() => {
    galleryImages.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Function to go to the next image with a smooth crossfade
  const goToNextImage = () => {
    setPrevImageIndex(currentImageIndex);
    setCurrentImageIndex((prevIndex) => (prevIndex + 1) % galleryImages.length);
  };

  // Auto slideshow effect - always active
  useEffect(() => {
    timerRef.current = setInterval(goToNextImage, autoplaySpeed);
    
    // Clean up the interval on component unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoplaySpeed, currentImageIndex]);

  return (
    <div className="gallery-slideshow in-splash-screen">
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