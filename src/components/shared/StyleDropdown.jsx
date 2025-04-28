import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

// StyleDropdown component that uses portals to render outside the DOM hierarchy
const StyleDropdown = ({ 
  isOpen, 
  onClose, 
  selectedStyle, 
  updateStyle, 
  defaultStylePrompts, 
  styleIdToDisplay, 
  showControlOverlay, 
  setShowControlOverlay, 
  dropdownPosition = 'top' // Default value
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const dropdownReference = useRef(null);
  
  useEffect(() => {
    if (isOpen) {
      // Find the style button in the DOM to position the dropdown
      const styleButton = document.querySelector('.bottom-style-select');
      if (styleButton) {
        const rect = styleButton.getBoundingClientRect();
        // Position above the button for the bottom toolbar
        setPosition({
          bottom: window.innerHeight - rect.top + 10,
          left: rect.left + rect.width / 2,
          width: 280
        });
        setMounted(true);
      }
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e) => {
        if (dropdownReference.current && !dropdownReference.current.contains(e.target)) {
          // Check if the click was on the style button
          const styleButton = document.querySelector('.bottom-style-select');
          if (!styleButton || !styleButton.contains(e.target)) {
            onClose();
          }
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      
      // Scroll selected option into view
      setTimeout(() => {
        const selectedOption = document.querySelector('.style-option.selected');
        if (selectedOption && dropdownReference.current) {
          selectedOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // If not mounted or not open, don't render anything
  if (!mounted || !isOpen) return null;

  // Create portal to render the dropdown at the document root
  return ReactDOM.createPortal(
    <div 
      ref={dropdownReference}
      className={`style-dropdown ${dropdownPosition}-position`}
      style={{
        position: 'fixed',
        ...(dropdownPosition === 'top' 
          ? { bottom: position.bottom } 
          : { top: position.bottom }),
        left: position.left,
        transform: 'translateX(-50%)',
        maxHeight: 300,
        width: position.width,
        background: 'white',
        borderRadius: 5,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        overflow: 'auto',
        zIndex: 10_000,
        transformOrigin: dropdownPosition === 'top' ? 'center bottom' : 'center top',
        animation: 'dropdownAppear 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards',
        border: '1px solid rgba(0,0,0,0.1)',
        fontFamily: '"Permanent Marker", cursive',
        fontSize: 13,
      }}
    >
      <style>{`
        @keyframes dropdownAppear {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(${dropdownPosition === 'top' ? '10px' : '-10px'});
          }
          to {
            opacity: 1; 
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>

      <div className="style-section featured">
        {/* Featured options */}
        <div 
          className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('randomMix');
            onClose();
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            color: selectedStyle === 'randomMix' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'randomMix' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          <span style={{ marginRight: 8 }}>🎲</span>
          <span>Random Mix</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('random');
            onClose();
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            color: selectedStyle === 'random' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'random' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          <span style={{ marginRight: 8 }}>🔀</span>
          <span>Random</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'custom' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('custom');
            onClose();
            setShowControlOverlay(true);
          }}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            color: selectedStyle === 'custom' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'custom' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          <span style={{ marginRight: 8 }}>✏️</span>
          <span>Custom...</span>
        </div>
      </div>
      
      <div className="style-section regular">
        {Object.keys(defaultStylePrompts)
          .filter(key => key !== 'random' && key !== 'custom' && key !== 'randomMix')
          .sort()
          .map(styleKey => (
            <div 
              key={styleKey}
              className={`style-option ${selectedStyle === styleKey ? 'selected' : ''}`} 
              onClick={() => { 
                updateStyle(styleKey);
                onClose();
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                color: selectedStyle === styleKey ? '#ff5e8a' : '#333',
                background: selectedStyle === styleKey ? '#fff0f4' : 'transparent',
                fontFamily: '"Permanent Marker", cursive',
                fontSize: 13,
                textAlign: 'left'
              }}
            >
              <span>{styleIdToDisplay(styleKey)}</span>
            </div>
          ))}
      </div>
    </div>,
    document.body
  );
};

export default StyleDropdown; 