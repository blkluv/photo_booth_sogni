import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import '../../styles/components/TwitterShareModal.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { getPhotoHashtag } from '../../services/TwitterShare';

// Helper to ensure Permanent Marker font is loaded
const ensureFontLoaded = () => {
  if (!document.querySelector('link[href*="Permanent+Marker"]')) {
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }
};

const TwitterShareModal = ({ 
  isOpen, 
  onClose, 
  onShare, 
  imageUrl, 
  defaultMessage = "From my latest photoshoot in Sogni Photobooth! #MadeWithSogni #SogniPhotobooth ✨",
  photoData,
  maxLength = 280
}) => {
  const [message, setMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [polaroidImageUrl, setPolaroidImageUrl] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const textareaRef = useRef(null);
  const modalRef = useRef(null);
  
  // Get hashtag from photo data if available
  const styleHashtag = getPhotoHashtag(photoData);
  
  // Determine photo label - prefer status text if available, otherwise use a combination of number label and hashtag
  const photoNumberLabel = photoData?.statusText?.split('#')[0]?.trim() || photoData?.label || '';
  
  // Combine the number label and hashtag
  const photoLabel = photoNumberLabel + (styleHashtag ? ` ${styleHashtag}` : '');
  
  // Ensure font is loaded when component mounts
  useEffect(() => {
    ensureFontLoaded();
  }, []);
  
  // Create polaroid preview when modal opens and imageUrl changes
  useEffect(() => {
    if (isOpen && imageUrl) {
      setIsLoadingPreview(true);
      
      const generatePolaroidPreview = async () => {
        try {
          // Make sure the font is loaded before generating the preview
          await document.fonts.ready;
          
          // Custom options for better polaroid styling
          const options = {
            frameBottomWidth: 150, // Updated to match Twitter sharing settings
            labelFont: '34px "Permanent Marker", cursive', // Explicit font styling
            labelColor: '#333333' // Ensure visible text color
          };
          
          console.log(`Creating polaroid preview with label: "${photoLabel}"`);
          // Create and use polaroid data URL directly - avoid converting to Blob
          const polaroidUrl = await createPolaroidImage(imageUrl, photoLabel, options);
          setPolaroidImageUrl(polaroidUrl);
        } catch (error) {
          console.error('Error creating polaroid preview:', error);
          setPolaroidImageUrl(imageUrl); // Fallback to original image
        } finally {
          setIsLoadingPreview(false);
        }
      };
      
      generatePolaroidPreview();
    }
    
    return () => {
      // Cleanup function
      setPolaroidImageUrl(null);
    };
  }, [isOpen, imageUrl, photoLabel]);
  
  useEffect(() => {
    // Initialize message with default and hashtag when modal opens
    // get the current page url with deeplink
    const currentUrl = window.location.href;
    if (isOpen) {
      const initialMessage = styleHashtag 
        ? `${defaultMessage} ${styleHashtag} ${currentUrl}?prompt=${styleHashtag}`
        : `${defaultMessage} ${currentUrl}`;
      
      setMessage(initialMessage);
      
      // Focus the textarea
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, defaultMessage, styleHashtag]);

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

  const handleShare = async () => {
    setIsSharing(true);
    try {
      await onShare(message);
      onClose();
    } catch (error) {
      console.error('Error sharing to Twitter:', error);
    } finally {
      setIsSharing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="twitter-modal-overlay">
      <div className="twitter-modal" ref={modalRef}>
        <button className="twitter-modal-close" onClick={onClose}>×</button>
        
        <div className="twitter-modal-header">
          <svg className="twitter-logo" fill="#1DA1F2" viewBox="0 0 24 24">
            <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
          </svg>
          <h2>Share to X</h2>
        </div>
        
        <div className="twitter-modal-content">
          <div className="twitter-message-container">
            <textarea
              ref={textareaRef}
              className="twitter-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What would you like to say about this photo?"
              maxLength={maxLength}
            />
            <div className="twitter-char-counter">
              {message.length}/{maxLength}
            </div>
          </div>
          
          <div className="twitter-image-preview">
            {isLoadingPreview ? (
              <div className="twitter-image-loading">
                <span className="loading-spinner"></span>
                <p>Preparing polaroid image...</p>
              </div>
            ) : polaroidImageUrl ? (
              <div className="polaroid-container">
                <img src={polaroidImageUrl} alt="Preview" />
                {photoLabel && (
                  <div className="preview-label-debug">
                    Using label: {photoLabel}
                  </div>
                )}
              </div>
            ) : imageUrl ? (
              <img src={imageUrl} alt="Preview" />
            ) : (
              <div className="twitter-no-image">No image selected</div>
            )}
          </div>
        </div>
        
        <div className="twitter-modal-footer">
          <button 
            className="twitter-share-btn" 
            onClick={handleShare}
            disabled={isSharing || !message.trim() || isLoadingPreview}
          >
            {isSharing ? (
              <span className="twitter-loading">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </span>
            ) : (
              <>
                <svg className="twitter-icon" fill="white" viewBox="0 0 24 24">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                Post
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

TwitterShareModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onShare: PropTypes.func.isRequired,
  imageUrl: PropTypes.string,
  defaultMessage: PropTypes.string,
  photoData: PropTypes.object,
  maxLength: PropTypes.number
};

export default TwitterShareModal; 