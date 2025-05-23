import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getCustomDimensions } from '../../utils/imageProcessing';
import '../../styles/components/ImageAdjuster.css';

/**
 * A component that allows users to adjust the size and position of an uploaded image
 * within the desired aspect ratio frame before processing
 */
const ImageAdjuster = ({ 
  imageUrl,
  onConfirm,
  onCancel
}) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  
  // Track image position and scale
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // For responsive layout
  const [dimensions, setDimensions] = useState(getCustomDimensions());
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  
  // Handle window resize to update dimensions and orientation
  useEffect(() => {
    const handleResize = () => {
      const newDimensions = getCustomDimensions();
      const newIsPortrait = window.innerHeight > window.innerWidth;
      
      setDimensions(newDimensions);
      setIsPortrait(newIsPortrait);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
  
  // Handle image load
  const handleImageLoad = () => {
    setImageLoaded(true);
    // Reset position to center when the image loads
    setPosition({ x: 0, y: 0 });
  };
  
  // Handle mouse/touch down
  const handleDragStart = (e) => {
    let clientX, clientY;
    
    if (e.type === 'touchstart') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
      e.preventDefault();
    }
    
    setIsDragging(true);
    setDragStart({ 
      x: clientX - position.x, 
      y: clientY - position.y 
    });
  };
  
  // Handle mouse/touch move - allow unrestricted movement
  const handleDrag = (e) => {
    if (!isDragging) return;
    
    let clientX, clientY;
    
    if (e.type === 'touchmove') {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Calculate new position without any restrictions
    const newX = clientX - dragStart.x;
    const newY = clientY - dragStart.y;
    
    setPosition({ x: newX, y: newY });
  };
  
  // Handle mouse/touch up
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  // Handle zoom level change
  const handleZoomChange = (e) => {
    const newScale = parseFloat(e.target.value);
    setScale(newScale);
  };
  
  // Handle confirm button click
  const handleConfirm = () => {
    if (!containerRef.current || !imageRef.current) return;
    
    const container = containerRef.current;
    const image = imageRef.current;
    
    // Create a canvas to render the adjusted image
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    
    // Fill with black background to ensure proper borders
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    
    // Calculate the image dimensions and fit it within the canvas maintaining aspect ratio (contain)
    const imageAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = dimensions.width / dimensions.height;
    
    let drawWidth, drawHeight;
    
    if (imageAspect > canvasAspect) {
      // Image is wider than canvas relative to height
      drawWidth = dimensions.width;
      drawHeight = dimensions.width / imageAspect;
    } else {
      // Image is taller than canvas relative to width
      drawHeight = dimensions.height;
      drawWidth = dimensions.height * imageAspect;
    }
    
    // Calculate how user adjustments affect the drawing
    // Convert from screen coordinates to canvas coordinates
    const containerRect = container.getBoundingClientRect();
    const screenToCanvasX = dimensions.width / containerRect.width;
    const screenToCanvasY = dimensions.height / containerRect.height;
    
    // Apply the scale adjustment
    drawWidth *= scale;
    drawHeight *= scale;
    
    // Recalculate center offset after scaling
    const scaledOffsetX = (dimensions.width - drawWidth) / 2;
    const scaledOffsetY = (dimensions.height - drawHeight) / 2;
    
    // Apply position adjustments, converting from screen pixels to canvas pixels
    const adjustedX = scaledOffsetX + (position.x * screenToCanvasX);
    const adjustedY = scaledOffsetY + (position.y * screenToCanvasY);
    
    // Draw the image with all adjustments applied
    ctx.drawImage(
      image,
      adjustedX,
      adjustedY,
      drawWidth,
      drawHeight
    );
    
    // Convert to blob and call the confirmation callback
    canvas.toBlob((blob) => {
      onConfirm(blob);
    }, 'image/png', 1.0);
  };
  
  // Initialize image position to center
  useEffect(() => {
    if (imageRef.current) {
      setPosition({ x: 0, y: 0 });
      // Reset scale when loading a new image
      setScale(1);
    }
  }, [imageUrl]);
  
  return (
    <div className="image-adjuster-overlay">
      <div className="image-adjuster-container">
        <h2>Adjust Your Image</h2>
        <div 
          className="image-frame"
          ref={containerRef}
          style={{
            aspectRatio: `${dimensions.width}/${dimensions.height}`,
            maxWidth: isPortrait ? '90vw' : '80vw',
            maxHeight: isPortrait ? '70vh' : '60vh'
          }}
          onMouseMove={handleDrag}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchMove={handleDrag}
          onTouchEnd={handleDragEnd}
        >
          <div className="image-container">
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Adjust this image"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: imageLoaded ? 1 : 0, // Hide until loaded
                transition: 'opacity 0.3s ease'
              }}
              onLoad={handleImageLoad}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              draggable="false"
            />
          </div>
          <div className="image-frame-overlay">
            <div className="frame-corner top-left"></div>
            <div className="frame-corner top-right"></div>
            <div className="frame-corner bottom-left"></div>
            <div className="frame-corner bottom-right"></div>
          </div>
        </div>
        
        <div className="image-adjustment-controls">
          <div className="zoom-control">
            <label htmlFor="zoom-slider">
              <span role="img" aria-label="zoom">🔍</span> Size:
            </label>
            <input
              id="zoom-slider"
              type="range"
              min="0.5"
              max="3"
              step="0.01"
              value={scale}
              onChange={handleZoomChange}
            />
          </div>
          <div className="instruction-text">
            Drag anywhere to position • Use slider to resize
          </div>
        </div>
        
        <div className="image-adjustment-buttons">
          <button 
            className="cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="confirm-button" 
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

ImageAdjuster.propTypes = {
  imageUrl: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

export default ImageAdjuster; 