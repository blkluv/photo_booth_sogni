import React from 'react';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext.tsx';
import { saveSettingsToCookies } from '../../utils/cookies';
import './AspectRatioSelector.css';

/**
 * Component for selecting image aspect ratio
 * Displays 3 buttons with icons representing different aspect ratios:
 * - Portrait (896x1152)
 * - Square (1024x1024)
 * - Landscape (1152x896)
 */
const AspectRatioSelector = ({ visible = true }) => {
  const { settings, updateSetting } = useApp();
  const { aspectRatio } = settings;

  if (!visible) return null;

  const handleAspectRatioChange = (newAspectRatio) => {
    updateSetting('aspectRatio', newAspectRatio);
    saveSettingsToCookies({ aspectRatio: newAspectRatio });
    
    // Update CSS variables to match the new aspect ratio
    switch (newAspectRatio) {
      case 'portrait':
        document.documentElement.style.setProperty('--current-aspect-ratio', '896/1152');
        break;
      case 'landscape':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1152/896');
        break;
      case 'square':
        document.documentElement.style.setProperty('--current-aspect-ratio', '1024/1024');
        break;
      default:
        break;
    }
  };

  return (
    <div className="aspect-ratio-selector">
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'portrait' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('portrait')}
        title="Portrait (896×1152)"
        aria-label="Set portrait aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <rect x="7" y="5" width="10" height="14" rx="1" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'square' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('square')}
        title="Square (1024×1024)"
        aria-label="Set square aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <rect x="5" y="5" width="14" height="14" rx="1" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'landscape' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('landscape')}
        title="Landscape (1152×896)"
        aria-label="Set landscape aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <rect x="5" y="7" width="14" height="10" rx="1" />
        </svg>
      </button>
    </div>
  );
};

AspectRatioSelector.propTypes = {
  visible: PropTypes.bool
};

export default AspectRatioSelector; 