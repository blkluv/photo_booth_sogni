import React, { useRef } from 'react';
import './CameraStartMenu.css';

interface CameraStartMenuProps {
  onTakePhoto: () => void;
  onBrowsePhoto: (file: File) => void;
  onDragPhoto: () => void;
  isProcessing?: boolean;
  hasPhotos?: boolean;
  onViewPhotos?: () => void;
}

const CameraStartMenu: React.FC<CameraStartMenuProps> = ({ 
  onTakePhoto, 
  onBrowsePhoto,
  isProcessing = false,
  hasPhotos = false,
  onViewPhotos
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBrowseClick = () => {
    if (isProcessing) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (2MB limit)
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be less than 5MB.");
        // Clear the input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        alert("Please select an image file (PNG or JPG).");
        // Clear the input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      // Pass the file to the callback
      onBrowsePhoto(file);
    }
  };

  return (
    <div className="camera-start-menu">
      <div className="start-menu-content">
        <h1 className="start-menu-title">Sogni Photobooth</h1>
        <div className="start-menu-description">
          Transform yourself with AI-powered style transfer
        </div>
        
        {isProcessing && (
          <div className="processing-message">
            <div className="spinner"></div>
            <div className="message">Processing previous image...</div>
          </div>
        )}
        
        <div className={`start-menu-options ${isProcessing ? 'disabled' : ''}`}>
          <button 
            className="option-button take-photo"
            onClick={isProcessing ? undefined : onTakePhoto}
            disabled={isProcessing}
          >
            <div className="option-icon">📸</div>
            <div className="option-label">Take Photo</div>
          </button>
          
          <button 
            className="option-button browse-photo"
            onClick={isProcessing ? undefined : handleBrowseClick}
            disabled={isProcessing}
          >
            <div className="option-icon">🖼️</div>
            <div className="option-label">Browse Photo</div>
          </button>
          
          <div className="option-button drag-photo info-only">
            <div className="option-icon">✋</div>
            <div className="option-label">Drag & Drop Photo</div>
          </div>
        </div>
        
        {hasPhotos && onViewPhotos && (
          <div className="view-photos-link">
            <button 
              className="view-photos-button"
              onClick={onViewPhotos}
            >
              Back to Photos
            </button>
          </div>
        )}
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="image/png, image/jpeg"
        onChange={handleFileSelect}
        disabled={isProcessing}
      />
    </div>
  );
};

export default CameraStartMenu; 