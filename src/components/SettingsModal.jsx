import React from "react";
import PropTypes from 'prop-types';
import { useApp } from '../context/AppContext';
import { modelOptions, defaultStylePrompts } from '../constants/settings';

const SettingsModal = ({ onClose }) => {
  const { settings, updateSetting, resetSettings } = useApp();

  return (
    <div className="control-overlay visible">
      <div className="control-overlay-content">
        <h2 className="settings-title">Settings</h2>
        <button className="dismiss-overlay-btn" onClick={onClose}>×</button>

        <div className="control-option">
          <label className="control-label">Model:</label>
          <select
            value={settings.selectedModel}
            onChange={(e) => updateSetting('selectedModel', e.target.value)}
            className="select-input"
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="control-option">
          <label className="control-label">Style:</label>
          <select
            value={settings.selectedStyle}
            onChange={(e) => updateSetting('selectedStyle', e.target.value)}
            className="select-input"
          >
            {Object.keys(defaultStylePrompts).map((key) => (
              <option key={key} value={key}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {settings.selectedStyle === 'custom' && (
          <div className="control-option">
            <label className="control-label">Custom Prompt:</label>
            <textarea
              value={settings.customPrompt || ''}
              onChange={(e) => updateSetting('customPrompt', e.target.value)}
              placeholder="Enter your custom style prompt..."
              className="textarea-input"
              rows={4}
            />
          </div>
        )}

        <div className="control-option">
          <label className="control-label">Number of Images:</label>
          <input
            type="number"
            min={1}
            max={16}
            value={settings.numImages}
            onChange={(e) => updateSetting('numImages', parseInt(e.target.value, 10))}
            className="number-input"
          />
        </div>

        <div className="control-option">
          <label className="control-label">Prompt Guidance: {settings.promptGuidance.toFixed(1)}</label>
          <input
            type="range"
            min={2}
            max={3}
            step={0.1}
            value={settings.promptGuidance}
            onChange={(e) => updateSetting('promptGuidance', parseFloat(e.target.value))}
            className="slider-input"
          />
        </div>

        <div className="control-option">
          <label className="control-label">Control Strength: {settings.controlNetStrength.toFixed(1)}</label>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.1}
            value={settings.controlNetStrength}
            onChange={(e) => updateSetting('controlNetStrength', parseFloat(e.target.value))}
            className="slider-input"
          />
        </div>

        <div className="control-option">
          <label className="control-label">Control End: {settings.controlNetGuidanceEnd.toFixed(1)}</label>
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.1}
            value={settings.controlNetGuidanceEnd}
            onChange={(e) => updateSetting('controlNetGuidanceEnd', parseFloat(e.target.value))}
            className="slider-input"
          />
        </div>

        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="flash-enabled"
            checked={settings.flashEnabled}
            onChange={(e) => updateSetting('flashEnabled', e.target.checked)}
          />
          <label htmlFor="flash-enabled" className="control-label">Flash Enabled</label>
        </div>

        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="keep-original"
            checked={settings.keepOriginalPhoto}
            onChange={(e) => updateSetting('keepOriginalPhoto', e.target.checked)}
          />
          <label htmlFor="keep-original" className="control-label">Keep Original Photo</label>
        </div>

        <div className="control-option">
          <button onClick={resetSettings} className="reset-button">
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

SettingsModal.propTypes = {
  onClose: PropTypes.func.isRequired
};

export default SettingsModal;
