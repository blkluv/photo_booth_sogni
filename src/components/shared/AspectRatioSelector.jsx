import React from 'react';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext.tsx';
import { saveSettingsToCookies } from '../../utils/cookies';
import './AspectRatioSelector.css';

/**
 * Component for selecting image aspect ratio
 * Displays 3 buttons with icons representing different aspect ratios:
 * - Portrait (896x1152) - 7/9 ratio
 * - Square (1024x1024) - 1/1 ratio
 * - Landscape (1152x896) - 9/7 ratio
 * 
 * Each button shows a polaroid-style frame with appropriate aspect ratio
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
        className={`aspect-ratio-button ${aspectRatio === 'square' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('square')}
        title="Square (1:1)"
        aria-label="Set square aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame - with 1:3.5 border ratio */}
          <rect x="3" y="1" width="18" height="22" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - perfect 1:1 square */}
          <rect x="5" y="3" width="14" height="14" fill="black" />
        </svg>
      </button>
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'portrait' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('portrait')}
        title="Portrait (7:9)"
        aria-label="Set portrait aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame - with 1:3.5 border ratio */}
          <rect x="5" y="0" width="14" height="24" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - exactly 7:9 ratio */}
          <rect x="7" y="2" width="10" height="12.86" fill="black" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'landscape' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('landscape')}
        title="Landscape (9:7)"
        aria-label="Set landscape aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame - with 1:3.5 border ratio */}
          <rect x="1" y="1" width="22" height="22" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - exactly 9:7 ratio */}
          <rect x="3" y="3" width="18" height="14" fill="black" />
        </svg>
      </button>
    </div>
  );
};

AspectRatioSelector.propTypes = {
  visible: PropTypes.bool
};

export default AspectRatioSelector; 