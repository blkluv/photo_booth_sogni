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
  dropdownPosition = 'top', // Default value
  triggerButtonClass = '.bottom-style-select' // Default class for the main toolbar
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const dropdownReference = useRef(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      // Find the style button in the DOM to position the dropdown
      const styleButton = document.querySelector(triggerButtonClass) || document.querySelector('.grid-style-btn');
      if (styleButton) {
        const rect = styleButton.getBoundingClientRect();
        const dropdownWidth = 240;
        
        // Calculate safe left position to prevent off-screen rendering
        let leftPosition = rect.left + rect.width / 2;
        
        // Check if dropdown would go off left edge of screen
        if (leftPosition - (dropdownWidth / 2) < 10) {
          leftPosition = 10 + (dropdownWidth / 2);
        }
        
        // Check if dropdown would go off right edge of screen
        if (leftPosition + (dropdownWidth / 2) > window.innerWidth - 10) {
          leftPosition = window.innerWidth - 10 - (dropdownWidth / 2);
        }
        
        if (dropdownPosition === 'top') {
          // Position above the button (for bottom toolbar)
          setPosition({
            bottom: window.innerHeight - rect.top + 10,
            left: leftPosition,
            width: dropdownWidth
          });
        } else {
          // Position below the button (for grid view)
          setPosition({
            top: rect.bottom + 10,
            left: leftPosition,
            width: dropdownWidth
          });
        }
        
        setMounted(true);
        setInitialScrollDone(false); // Reset scroll state when dropdown opens
      }
    } else {
      setMounted(false);
    }
  }, [isOpen, dropdownPosition, triggerButtonClass]);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (e) => {
        if (dropdownReference.current && !dropdownReference.current.contains(e.target)) {
          // Check if the click was on any style button
          const styleButton = document.querySelector(triggerButtonClass) || document.querySelector('.grid-style-btn');
          if (!styleButton || !styleButton.contains(e.target)) {
            onClose();
          }
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      
      // Only scroll to the selected option when dropdown initially opens, not after user scrolling
      if (!initialScrollDone) {
        setTimeout(() => {
          const selectedOption = document.querySelector('.style-option.selected');
          if (selectedOption && dropdownReference.current) {
            selectedOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setInitialScrollDone(true); // Mark initial scroll as done
          }
        }, 100);
      }
      
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen, onClose, triggerButtonClass, initialScrollDone]);

  // Add event listener to prevent auto-scrolling after user interaction
  useEffect(() => {
    if (isOpen && dropdownReference.current) {
      const handleUserScroll = () => {
        if (!initialScrollDone) {
          setInitialScrollDone(true);
        }
      };
      
      const dropdown = dropdownReference.current;
      dropdown.addEventListener('scroll', handleUserScroll, { passive: true });
      
      return () => {
        dropdown.removeEventListener('scroll', handleUserScroll);
      };
    }
  }, [isOpen, initialScrollDone]);

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
          : { top: position.top }),
        left: position.left,
        transform: 'translateX(-50%)',
        maxHeight: 380,
        width: position.width,
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        overflow: 'auto',
        zIndex: 10_000,
        transformOrigin: dropdownPosition === 'top' ? 'center bottom' : 'center top',
        border: '1px solid rgba(0,0,0,0.1)',
        fontFamily: '"Permanent Marker", cursive',
        fontSize: 14,
        padding: 8,
      }}
    >
      <style>{`
        @keyframes dropdownAppearTop {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          to {
            opacity: 1; 
            transform: translateX(-50%) translateY(0);
          }
        }
        
        @keyframes dropdownAppearBottom {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        
        .style-dropdown.top-position {
          animation: dropdownAppearTop 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
        }
        
        .style-dropdown.bottom-position {
          animation: dropdownAppearBottom 0.3s cubic-bezier(0.17, 0.67, 0.25, 1.2) forwards;
        }
      `}</style>

      <div 
        className="style-section featured"
        style={{
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
          paddingBottom: 8,
          marginBottom: 8
        }}
      >
        {/* Featured options */}
        <div 
          className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('randomMix');
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            margin: '2px 0',
            borderRadius: 4,
            cursor: 'pointer',
            color: selectedStyle === 'randomMix' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'randomMix' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 14,
            transition: 'background-color 0.2s'
          }}
        >
          <span>🎲</span>
          <span>Random Mix</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('random');
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            margin: '2px 0',
            borderRadius: 4,
            cursor: 'pointer',
            color: selectedStyle === 'random' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'random' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 14,
            transition: 'background-color 0.2s'
          }}
        >
          <span>🔀</span>
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
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            margin: '2px 0',
            borderRadius: 4,
            cursor: 'pointer',
            color: selectedStyle === 'custom' ? '#ff5e8a' : '#333',
            background: selectedStyle === 'custom' ? '#fff0f4' : 'transparent',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: 14,
            transition: 'background-color 0.2s'
          }}
        >
          <span>✏️</span>
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
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                margin: '2px 0',
                borderRadius: 4,
                cursor: 'pointer',
                color: selectedStyle === styleKey ? '#ff5e8a' : '#333',
                background: selectedStyle === styleKey ? '#fff0f4' : 'transparent',
                fontFamily: '"Permanent Marker", cursive',
                fontSize: 14,
                transition: 'background-color 0.2s'
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