import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { styleIdToDisplay } from '../../utils';
import '../../styles/style-dropdown.css';
import PropTypes from 'prop-types';

// StyleDropdown component that uses portals to render outside the DOM hierarchy
const StyleDropdown = ({ 
  isOpen, 
  onClose, 
  selectedStyle, 
  updateStyle, 
  defaultStylePrompts, 
  setShowControlOverlay, 
  dropdownPosition = 'top', // Default value
  triggerButtonClass = '.bottom-style-select' // Default class for the main toolbar
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const [actualPosition, setActualPosition] = useState(dropdownPosition);
  const dropdownReference = useRef(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      // Find the style button in the DOM to position the dropdown
      const styleButton = document.querySelector(triggerButtonClass) || document.querySelector('.grid-style-btn');
      if (styleButton) {
        const rect = styleButton.getBoundingClientRect();
        const dropdownWidth = 240;
        const dropdownHeight = 380; // Approximate height for calculation
        
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
        
        // Determine if dropdown should appear above or below the button
        // based on available space and preferred position
        let calculatedPosition;
        
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (dropdownPosition === 'top') {
          // Check if there's enough space above
          if (spaceAbove >= dropdownHeight) {
            // Position above the button
            calculatedPosition = 'top';
            setPosition({
              bottom: window.innerHeight - rect.top + 10,
              left: leftPosition,
              width: dropdownWidth
            });
          } else if (spaceBelow >= dropdownHeight) {
            // Not enough space above, but enough below
            calculatedPosition = 'bottom';
            setPosition({
              top: rect.bottom + 10,
              left: leftPosition,
              width: dropdownWidth
            });
          } else {
            // Not enough space anywhere - center it as best we can
            calculatedPosition = 'bottom';
            setPosition({
              top: Math.max(10, rect.bottom - (rect.bottom + dropdownHeight - window.innerHeight + 10)),
              left: leftPosition,
              width: dropdownWidth
            });
          }
        } else {
          // Default to bottom positioning first
          if (spaceBelow >= dropdownHeight) {
            // Position below the button
            calculatedPosition = 'bottom';
            setPosition({
              top: rect.bottom + 10,
              left: leftPosition,
              width: dropdownWidth
            });
          } else if (spaceAbove >= dropdownHeight) {
            // Not enough space below, but enough above
            calculatedPosition = 'top';
            setPosition({
              bottom: window.innerHeight - rect.top + 10,
              left: leftPosition,
              width: dropdownWidth
            });
          } else {
            // Not enough space anywhere - center it
            calculatedPosition = 'bottom';
            setPosition({
              top: Math.max(10, rect.bottom - (rect.bottom + dropdownHeight - window.innerHeight + 10)),
              left: leftPosition,
              width: dropdownWidth
            });
          }
        }
        
        setActualPosition(calculatedPosition);
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
      className={`style-dropdown ${actualPosition}-position`}
      style={{
        ...(actualPosition === 'top' 
          ? { bottom: position.bottom } 
          : { top: position.top }),
        left: position.left,
      }}
    >
      <div className="style-section featured">
        {/* Featured options */}
        <div 
          className={`style-option ${selectedStyle === 'randomMix' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('randomMix');
            onClose();
          }}
        >
          <span>🎲</span>
          <span>YOLO MODE</span>
        </div>
        
        <div 
          className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`} 
          onClick={() => { 
            updateStyle('random');
            onClose();
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
            >
              <span>{styleIdToDisplay(styleKey)}</span>
            </div>
          ))}
      </div>
    </div>,
    document.body
  );
};

StyleDropdown.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  selectedStyle: PropTypes.string.isRequired,
  updateStyle: PropTypes.func.isRequired,
  defaultStylePrompts: PropTypes.object.isRequired,
  setShowControlOverlay: PropTypes.func,
  dropdownPosition: PropTypes.string,
  triggerButtonClass: PropTypes.string,
};

export default StyleDropdown; 