import React from 'react';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext.tsx';
import { saveSettingsToCookies } from '../../utils/cookies';
import './AspectRatioSelector.css';

/**
 * Component for selecting image aspect ratio
 * Displays 7 buttons with icons representing different aspect ratios
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

  return (
    <div className="aspect-ratio-selector">
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'ultranarrow' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('ultranarrow')}
        title="Ultra Narrow (9:16)"
        aria-label="Set ultra narrow aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
          {/* White polaroid frame for ultra narrow */}
          <rect x="8" y="0" width="8" height="24" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 9:16 ratio */}
          <rect x="8.5" y="1.5" width="7" height="21" fill="black" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'narrow' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('narrow')}
        title="Narrow (2:3)"
        aria-label="Set narrow aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
          {/* White polaroid frame for narrow */}
          <rect x="6" y="0" width="12" height="24" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 2:3 ratio */}
          <rect x="7" y="1.5" width="10" height="21" fill="black" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'portrait' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('portrait')}
        title="Portrait (3:4)"
        aria-label="Set portrait aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="29" height="29" fill="none">
          {/* White polaroid frame - border ratio 1:3.5 */}
          <rect x="4.12" y="0" width="15.77" height="23.59" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 3:4 ratio, area = 196 */}
          <rect x="5.83" y="1.71" width="12.35" height="15.88" fill="black" />
        </svg>
      </button>
      
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
        className={`aspect-ratio-button ${aspectRatio === 'landscape' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('landscape')}
        title="Landscape (4:3)"
        aria-label="Set landscape aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame - border ratio 1:3.5 */}
          <rect x="2.35" y="1.97" width="19.3" height="20.06" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 4:3 ratio, area = 196 */}
          <rect x="4.06" y="3.68" width="15.88" height="12.35" fill="black" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'wide' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('wide')}
        title="Wide (3:2)"
        aria-label="Set wide aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame for wide */}
          <rect x="0" y="6" width="24" height="12" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 3:2 ratio */}
          <rect x="1.5" y="7" width="21" height="10" fill="black" />
        </svg>
      </button>
      
      <button 
        className={`aspect-ratio-button ${aspectRatio === 'ultrawide' ? 'active' : ''}`}
        onClick={() => handleAspectRatioChange('ultrawide')}
        title="Ultra Wide (16:9)"
        aria-label="Set ultra wide aspect ratio"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
          {/* White polaroid frame for ultra wide */}
          <rect x="0" y="8" width="24" height="8" rx="0" fill="white" className="polaroid-frame" />
          {/* Black picture area - 16:9 ratio */}
          <rect x="1.5" y="8.5" width="21" height="7" fill="black" />
        </svg>
      </button>
    </div>
  );
};

AspectRatioSelector.propTypes = {
  visible: PropTypes.bool
};

export default AspectRatioSelector; 