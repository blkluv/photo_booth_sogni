import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/PromoPopup.css';

const PromoPopup = ({ isOpen, onClose }) => {
  const modalRef = useRef(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handleSignupClick = () => {
    window.open('https://app.sogni.ai/create?code=PHOTOBOOTH', '_blank');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="promo-modal-overlay">
      <div className="promo-modal" ref={modalRef}>
        <button className="promo-modal-close" onClick={onClose}>×</button>
        
        <div className="promo-modal-header">
          <div className="promo-logo">
            <span className="sogni-logo">✨</span>
          </div>
          <h2>Enjoying Photobooth?</h2>
        </div>
        
        <div className="promo-modal-content">
          <div className="promo-message">
            <h3>Unlock the Full Power of Sogni!</h3>
            <p>
              Take your creativity to the next level with our complete AI art platform.
              Get <strong>100 FREE render credits</strong> when you sign up today!
            </p>
            
            <div className="promo-features">
              <div className="feature-item">
                <span className="feature-icon">🎨</span>
                <span>Advanced AI Models</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🖼️</span>
                <span>High-Resolution Outputs</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <span>Lightning Fast Generation</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🎭</span>
                <span>Unlimited Style Options</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="promo-modal-footer">
          <button 
            className="promo-signup-btn" 
            onClick={handleSignupClick}
          >
            <span className="signup-text">Get 100 Free Credits</span>
            <span className="signup-arrow">→</span>
          </button>
          
          <button 
            className="promo-maybe-later" 
            onClick={onClose}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

PromoPopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PromoPopup; 