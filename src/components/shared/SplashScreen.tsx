import React, { useState, useEffect } from 'react';
import GallerySlideshow from './GallerySlideshow';
import './SplashScreen.css';

// Updated key for splash screen visibility to force existing users to see it
const SPLASH_HIDDEN_KEY = 'sogni_splash_v2_hidden';

interface SplashScreenProps {
  onDismiss: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onDismiss }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isHiding, setIsHiding] = useState(false);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  // Check localStorage on component mount
  useEffect(() => {
    const splashHidden = localStorage.getItem(SPLASH_HIDDEN_KEY);
    if (splashHidden === 'true') {
      onDismiss(); // Immediately dismiss if previously hidden
    }
    setHasCheckedStorage(true);
  }, [onDismiss]);

  // Handle dismissing the splash screen
  const handleDismiss = () => {
    setIsHiding(true);
    // Save preference to localStorage
    localStorage.setItem(SPLASH_HIDDEN_KEY, 'true');
    
    // Wait for animation to complete before calling onDismiss
    // Add extra time to ensure animations complete fully
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 1600); // Extended from 1200ms to 1600ms to ensure animations complete
  };

  // Don't render anything until we've checked localStorage
  if (!hasCheckedStorage || !isVisible) {
    return null;
  }

  return (
    <div 
      className={`splash-screen ${isHiding ? 'hiding' : ''}`}
      onClick={handleDismiss}
    >
      <div className="splash-content" onClick={(e) => e.stopPropagation()}>
        
        <div className="splash-layout">
          <div className="polaroid-splash-container">
            <img 
              src="/polaroid-camera.png" 
              alt="Polaroid Camera" 
              className="polaroid-image" 
            />
            <div className="camera-bubble">ready 2 create magic? 📸</div>
          </div>
          
          <div className="slideshow-container">
            <GallerySlideshow autoplaySpeed={1500} />
          </div>
        </div>
        
        <div className="splash-cta-section">
          <h2 className="splash-tagline" onClick={handleDismiss}>
            Let&apos;s Gooo! 🚀
          </h2>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen; 