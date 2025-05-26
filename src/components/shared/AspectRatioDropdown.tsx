import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AspectRatioOption } from '../../types/index';
import { saveSettingsToCookies } from '../../utils/cookies';
import './AspectRatioDropdown.css';

interface AspectRatioDropdownProps {
  /** Whether the dropdown is visible */
  visible?: boolean;
  /** Position of the dropdown */
  position?: 'bottom-right' | 'top-center';
}

/**
 * Compact aspect ratio dropdown component for the camera view
 * Shows current aspect ratio as an icon button that opens a dropdown menu
 */
const AspectRatioDropdown: React.FC<AspectRatioDropdownProps> = ({ 
  visible = true, 
  position = 'bottom-right' 
}) => {
  const { settings, updateSetting } = useApp();
  const { aspectRatio } = settings;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleAspectRatioChange = (newAspectRatio: AspectRatioOption) => {
    updateSetting('aspectRatio', newAspectRatio);
    saveSettingsToCookies({ aspectRatio: newAspectRatio });
    setIsOpen(false);
    
    // Update CSS variables to match the new aspect ratio
    switch (newAspectRatio) {
      case 'ultranarrow':
        document.documentElement.style.setProperty('--current-aspect-ratio', '768/1344');
        break;
      case 'narrow':
        document.documentElement.style.setProperty('--current-aspect-ratio', '832/1216');
        break;
      case 'portrait':
        document.documentElement.style.setProperty('--current-aspect-ratio', '896/1152');
        break;
      case 'square':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1024/1024');
        break;
      case 'landscape':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1152/896');
        break;
      case 'wide':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1216/832');
        break;
      case 'ultrawide':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1344/768');
        break;
      default:
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Get the current aspect ratio info
  const getCurrentAspectRatioInfo = () => {
    const options = {
      'ultranarrow': { label: 'Mobile', ratio: '4:7' },
      'narrow': { label: '35mm', ratio: '13:19' },
      'portrait': { label: 'Portrait', ratio: '7:9' },
      'square': { label: 'Instant', ratio: '1:1' },
      'landscape': { label: 'Landscape', ratio: '9:7' },
      'wide': { label: 'Cinema', ratio: '19:13' },
      'ultrawide': { label: 'Widescreen', ratio: '7:4' }
    };
    return options[aspectRatio] || options['square'];
  };

  // Get the current aspect ratio SVG icon
  const getCurrentIcon = () => {
    switch (aspectRatio) {
      case 'ultranarrow':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="5.7" y="0" width="12.7" height="24" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="7.4" y="1.7" width="9.3" height="16.2" fill="#333" />
          </svg>
        );
      case 'narrow':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="4.7" y="0" width="14.6" height="24" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="6.4" y="1.7" width="11.3" height="16.5" fill="#333" />
          </svg>
        );
      case 'portrait':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="4.12" y="0" width="15.77" height="23.59" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="5.83" y="1.71" width="12.35" height="15.88" fill="#333" />
          </svg>
        );
      case 'square':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="3.29" y="1" width="17.42" height="21.71" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="5" y="2.71" width="14" height="14" fill="#333" />
          </svg>
        );
      case 'landscape':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="2.35" y="1.97" width="19.3" height="20.06" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="4.06" y="3.68" width="15.88" height="12.35" fill="#333" />
          </svg>
        );
      case 'wide':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="1.8" y="2.4" width="20.4" height="19.3" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="3.5" y="4.1" width="16.9" height="11.6" fill="#333" />
          </svg>
        );
      case 'ultrawide':
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="2.2" y="3.5" width="19.6" height="17" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="3.9" y="5.2" width="16.2" height="9.3" fill="#333" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <rect x="3.29" y="1" width="17.42" height="21.71" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
            <rect x="5" y="2.71" width="14" height="14" fill="#333" />
          </svg>
        );
    }
  };

  const aspectRatioOptions = [
    { key: 'ultranarrow', label: 'Mobile', ratio: '4:7' },
    { key: 'narrow', label: '35mm', ratio: '13:19' },
    { key: 'portrait', label: 'Portrait', ratio: '7:9' },
    { key: 'square', label: 'Instant', ratio: '1:1' },
    { key: 'landscape', label: 'Landscape', ratio: '9:7' },
    { key: 'wide', label: 'Cinema', ratio: '19:13' },
    { key: 'ultrawide', label: 'Widescreen', ratio: '7:4' },
  ];

  // Early return after all hooks are called
  if (!visible) return null;

  return (
    <div 
      className={`aspect-ratio-dropdown ${position}`} 
      ref={dropdownRef}
    >
      <button
        className={`aspect-ratio-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Change aspect ratio"
        aria-label="Change aspect ratio"
      >
        {getCurrentIcon()}
        <div className="aspect-ratio-text">
          <span className="aspect-ratio-label">{getCurrentAspectRatioInfo().label}</span>
          <span className="aspect-ratio-ratio">{getCurrentAspectRatioInfo().ratio}</span>
        </div>
        <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      
      {isOpen && (
        <div className="aspect-ratio-menu">
          {aspectRatioOptions.map((option) => (
            <button
              key={option.key}
              className={`aspect-ratio-option ${aspectRatio === option.key ? 'active' : ''}`}
              onClick={() => handleAspectRatioChange(option.key as AspectRatioOption)}
              title={`${option.label} (${option.ratio})`}
            >
              <div className="option-icon">
                {option.key === 'ultranarrow' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="5.7" y="0" width="12.7" height="24" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="7.4" y="1.7" width="9.3" height="16.2" fill="#333" />
                  </svg>
                )}
                {option.key === 'narrow' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="4.7" y="0" width="14.6" height="24" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="6.4" y="1.7" width="11.3" height="16.5" fill="#333" />
                  </svg>
                )}
                {option.key === 'portrait' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="4.12" y="0" width="15.77" height="23.59" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="5.83" y="1.71" width="12.35" height="15.88" fill="#333" />
                  </svg>
                )}
                {option.key === 'square' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="3.29" y="1" width="17.42" height="21.71" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="5" y="2.71" width="14" height="14" fill="#333" />
                  </svg>
                )}
                {option.key === 'landscape' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="2.35" y="1.97" width="19.3" height="20.06" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="4.06" y="3.68" width="15.88" height="12.35" fill="#333" />
                  </svg>
                )}
                {option.key === 'wide' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="1.8" y="2.4" width="20.4" height="19.3" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="3.5" y="4.1" width="16.9" height="11.6" fill="#333" />
                  </svg>
                )}
                {option.key === 'ultrawide' && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <rect x="2.2" y="3.5" width="19.6" height="17" rx="0" fill="white" stroke="#ccc" strokeWidth="0.5" className="polaroid-frame" />
                    <rect x="3.9" y="5.2" width="16.2" height="9.3" fill="#333" />
                  </svg>
                )}
              </div>
              <div className="option-text">
                <span className="option-label">{option.label}</span>
                <span className="option-ratio">{option.ratio}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AspectRatioDropdown; 