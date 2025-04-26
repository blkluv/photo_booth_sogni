import React, { useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { defaultStylePrompts } from '../constants/settings';

interface ControlPanelProps {
  onReset: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onReset }) => {
  const {
    settings,
    updateSetting,
    showStyleDropdown,
    setShowStyleDropdown,
  } = useApp();

  const styleButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = React.useState<'top' | 'bottom'>('bottom');

  const toggleStyleDropdown = () => {
    // If already open, just close it
    if (showStyleDropdown) {
      setShowStyleDropdown(false);
      return;
    }

    // Check if dropdown would be clipped at bottom
    if (styleButtonRef.current) {
      const buttonRect = styleButtonRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      // Calculate dropdown height based on number of options (approx 40px per option)
      const styleCount = Object.keys(defaultStylePrompts).length;
      const estimatedHeight = Math.min(400, styleCount * 40); // Cap at 400px

      if (buttonRect.bottom + estimatedHeight > windowHeight) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }

    setShowStyleDropdown(true);
  };

  const styleIdToDisplay = (styleId: string) => {
    return styleId
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const getRandomStyle = () => {
    const availableStyles = Object.keys(defaultStylePrompts).filter(
      (key) => key !== 'custom' && key !== 'random' && key !== 'randomMix',
    );
    return availableStyles[Math.floor(Math.random() * availableStyles.length)];
  };

  const getRandomMixPrompts = (count: number) => {
    const availableStyles = Object.keys(defaultStylePrompts).filter(
      (key) => key !== 'custom' && key !== 'random' && key !== 'randomMix',
    );

    const selectedPrompts = [];
    for (let i = 0; i < count; i++) {
      const randomStyle =
        availableStyles[Math.floor(Math.random() * availableStyles.length)];
      selectedPrompts.push(defaultStylePrompts[randomStyle]);
    }

    return `{${selectedPrompts.join('|')}}`;
  };

  // Add an effect to close dropdown when clicking outside
  useEffect(() => {
    if (showStyleDropdown) {
      const handleClickOutside = (e: MouseEvent) => {
        const dropdown = document.querySelector('.style-dropdown');
        const button = document.querySelector('.header-style-select');

        // If click is outside dropdown and button, close dropdown
        if (
          dropdown &&
          button &&
          !dropdown.contains(e.target as Node) &&
          !button.contains(e.target as Node)
        ) {
          setShowStyleDropdown(false);
        }
      };

      document.addEventListener('click', handleClickOutside);

      // Make sure selected option is scrolled into view
      setTimeout(() => {
        const selectedOption = document.querySelector('.style-option.selected');
        if (selectedOption) {
          selectedOption.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }, 100);

      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showStyleDropdown, setShowStyleDropdown]);

  return (
    <div className="control-panel">
      <div className="settings-group">
        <button
          ref={styleButtonRef}
          className="header-style-select"
          onClick={toggleStyleDropdown}
        >
          {styleIdToDisplay(settings.selectedStyle)}
        </button>

        {showStyleDropdown && (
          <div className={`style-dropdown ${dropdownPosition}`}>
            {Object.keys(defaultStylePrompts).map((styleId) => (
              <div
                key={styleId}
                className={`style-option ${
                  settings.selectedStyle === styleId ? 'selected' : ''
                }`}
                onClick={() => {
                  updateSetting('selectedStyle', styleId);
                  setShowStyleDropdown(false);
                }}
              >
                {styleIdToDisplay(styleId)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-group">
        <label>
          Number of Images:
          <input
            type="number"
            min="1"
            max="16"
            value={settings.numImages}
            onChange={(e) => updateSetting('numImages', parseInt(e.target.value, 10))}
          />
        </label>

        <label>
          Prompt Guidance:
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={settings.promptGuidance}
            onChange={(e) => updateSetting('promptGuidance', parseFloat(e.target.value))}
          />
          {settings.promptGuidance}
        </label>

        <label>
          ControlNet Strength:
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.controlNetStrength}
            onChange={(e) => updateSetting('controlNetStrength', parseFloat(e.target.value))}
          />
          {settings.controlNetStrength}
        </label>

        <label>
          ControlNet Guidance End:
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.controlNetGuidanceEnd}
            onChange={(e) => updateSetting('controlNetGuidanceEnd', parseFloat(e.target.value))}
          />
          {settings.controlNetGuidanceEnd}
        </label>

        <label>
          <input
            type="checkbox"
            checked={settings.flashEnabled}
            onChange={(e) => updateSetting('flashEnabled', e.target.checked)}
          />
          Flash Enabled
        </label>

        <label>
          <input
            type="checkbox"
            checked={settings.keepOriginalPhoto}
            onChange={(e) => updateSetting('keepOriginalPhoto', e.target.checked)}
          />
          Keep Original Photo
        </label>

        <button onClick={onReset} className="reset-button">
          Reset Settings
        </button>
      </div>
    </div>
  );
};

export default ControlPanel; 