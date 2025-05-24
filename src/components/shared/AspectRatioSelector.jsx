import React from 'react';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext.tsx';
import { saveSettingsToCookies } from '../../utils/cookies';
import './AspectRatioSelector.css';

/**
 * Component for selecting image aspect ratio
 * Displays 3 buttons with icons representing different aspect ratios:
 * - Square (1024x1024) - 1/1 ratio
 * - Portrait (896x1152) - 7/9 ratio  
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
          {/* White polaroid frame - border ratio 1:3.5 */}
          <rect x="3.29" y="1" width="17.42" height="21.71" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 1:1 ratio, area = 196 */}
          <rect x="5" y="2.71" width="14" height="14" fill="black" />
        </svg>
      </button>
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'portrait' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('portrait')}
        title="Portrait (7:9)"
        aria-label="Set portrait aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame - border ratio 1:3.5 */}
          <rect x="4.12" y="0" width="15.77" height="23.59" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 7:9 ratio, area = 196 */}
          <rect x="5.83" y="1.71" width="12.35" height="15.88" fill="black" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'landscape' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('landscape')}
        title="Landscape (9:7)"
        aria-label="Set landscape aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame - border ratio 1:3.5 */}
          <rect x="2.35" y="1.97" width="19.3" height="20.06" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 9:7 ratio, area = 196 */}
          <rect x="4.06" y="3.68" width="15.88" height="12.35" fill="black" />
        </svg>
      </button>
    </div>
  );
};

AspectRatioSelector.propTypes = {
  visible: PropTypes.bool
};

export default AspectRatioSelector; 