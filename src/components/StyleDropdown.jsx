import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { defaultStylePrompts } from '../constants/settings';
import '../styles/style-dropdown.css';

const StyleDropdown = ({ selectedStyle, onStyleChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState('bottom');
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      if (!buttonRef.current || !isOpen) return;
      
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      
      setDropdownPosition(spaceBelow >= 200 || spaceBelow > spaceAbove ? 'bottom' : 'top');
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    handleScroll();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  const handleStyleSelect = (style) => {
    onStyleChange(style);
    setIsOpen(false);
  };

  return (
    <div className="style-selector">
      <button
        ref={buttonRef}
        className="header-style-select"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {selectedStyle === 'random' ? 'Random Style' : selectedStyle}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`style-dropdown ${dropdownPosition}`}
          role="listbox"
          aria-label="Select a style"
        >
          <div
            className={`style-option ${selectedStyle === 'random' ? 'selected' : ''}`}
            role="option"
            aria-selected={selectedStyle === 'random'}
            onClick={() => handleStyleSelect('random')}
          >
            Random Style
          </div>
          {Object.keys(defaultStylePrompts).map((style) => (
            <div
              key={style}
              className={`style-option ${selectedStyle === style ? 'selected' : ''}`}
              role="option"
              aria-selected={selectedStyle === style}
              onClick={() => handleStyleSelect(style)}
            >
              {style}
            </div>
          ))}
          <div
            className={`style-option ${selectedStyle === 'custom' ? 'selected' : ''}`}
            role="option"
            aria-selected={selectedStyle === 'custom'}
            onClick={() => handleStyleSelect('custom')}
          >
            Custom...
          </div>
        </div>
      )}
    </div>
  );
};

StyleDropdown.propTypes = {
  selectedStyle: PropTypes.string.isRequired,
  onStyleChange: PropTypes.func.isRequired,
};

export default StyleDropdown; 