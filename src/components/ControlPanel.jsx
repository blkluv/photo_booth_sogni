import React from "react";
import PropTypes from 'prop-types';

const ControlPanel = ({
  selectedStyle,
  customPrompt,
  setCustomPrompt,
  cameraDevices,
  selectedCameraDeviceId,
  setSelectedCameraDeviceId,
  selectedModel,
  setSelectedModel,
  numImages,
  setNumImages,
  promptGuidance,
  setPromptGuidance,
  controlNetStrength,
  setControlNetStrength,
  controlNetGuidanceEnd,
  setControlNetGuidanceEnd,
  flashEnabled,
  setFlashEnabled,
  keepOriginalPhoto,
  setKeepOriginalPhoto,
  showControlOverlay,
  setShowControlOverlay,
  modelOptions,
  updateSetting,
  resetAllSettings
}) => {
  if (!showControlOverlay) return null;
  return (
    <div className={`control-overlay ${showControlOverlay ? "visible" : ""}`}>
      <div className="control-overlay-content">
        <h2 className="settings-title">Advanced Settings</h2>
        <button
          className="dismiss-overlay-btn"
          onClick={() => setShowControlOverlay(false)}
        >
          ×
        </button>
        {selectedStyle === "custom" && (
          <div className="control-option">
            <label className="control-label">Custom Style Prompt:</label>
            <textarea
              className="custom-style-input"
              placeholder="Enter your custom style prompt here..."
              value={customPrompt}
              onChange={(e) => {
                setCustomPrompt(e.target.value);
              }}
              rows={4}
            />
          </div>
        )}
        {cameraDevices.length > 0 && (
          <div className="control-option">
            <label className="control-label">Camera:</label>
            <select
              className="camera-select"
              onChange={(e) => setSelectedCameraDeviceId(e.target.value)}
              value={selectedCameraDeviceId || ""}
            >
              <option value="">Default (user-facing)</option>
              {cameraDevices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label || `Camera ${dev.deviceId}`}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="control-option">
          <label className="control-label">Pick an Image Model:</label>
          <select
            className="model-select"
            value={selectedModel}
            onChange={(e) =>
              updateSetting(setSelectedModel, "selectedModel")(e.target.value)
            }
          >
            {modelOptions.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <div className="control-option">
          <label className="control-label">Number of Images:</label>
          <input
            type="range"
            min={1}
            max={64}
            step={1}
            value={numImages}
            onChange={(e) =>
              updateSetting(setNumImages, "numImages")(parseInt(e.target.value))
            }
            className="slider-input"
          />
          <span className="slider-value">{numImages}</span>
        </div>
        <div className="control-option">
          <label className="control-label">Prompt Guidance:</label>
          <input
            type="range"
            min={2}
            max={3}
            step={0.1}
            value={promptGuidance}
            onChange={(e) =>
              updateSetting(
                setPromptGuidance,
                "promptGuidance",
              )(parseFloat(e.target.value))
            }
            className="slider-input"
          />
          <span className="slider-value">{promptGuidance.toFixed(1)}</span>
        </div>
        <div className="control-option">
          <label className="control-label">Instant ID Strength:</label>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.1}
            value={controlNetStrength}
            onChange={(e) =>
              updateSetting(
                setControlNetStrength,
                "controlNetStrength",
              )(parseFloat(e.target.value))
            }
            className="slider-input"
          />
          <span className="slider-value">{controlNetStrength.toFixed(1)}</span>
        </div>
        <div className="control-option">
          <label className="control-label">Instant ID Impact Stop:</label>
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.1}
            value={controlNetGuidanceEnd}
            onChange={(e) =>
              updateSetting(
                setControlNetGuidanceEnd,
                "controlNetGuidanceEnd",
              )(parseFloat(e.target.value))
            }
            className="slider-input"
          />
          <span className="slider-value">
            {controlNetGuidanceEnd.toFixed(1)}
          </span>
        </div>
        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="flash-toggle"
            checked={flashEnabled}
            onChange={(e) =>
              updateSetting(setFlashEnabled, "flashEnabled")(e.target.checked)
            }
          />
          <label htmlFor="flash-toggle" className="control-label">
            Flash
          </label>
        </div>
        <div className="control-option checkbox">
          <input
            type="checkbox"
            id="keep-original-toggle"
            checked={keepOriginalPhoto}
            onChange={(e) =>
              updateSetting(
                setKeepOriginalPhoto,
                "keepOriginalPhoto",
              )(e.target.checked)
            }
          />
          <label htmlFor="keep-original-toggle" className="control-label">
            Show Original Image
          </label>
        </div>
        <div className="control-option reset-option">
          <button className="reset-settings-btn" onClick={resetAllSettings}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

ControlPanel.propTypes = {
  selectedStyle: PropTypes.string,
  customPrompt: PropTypes.string,
  setCustomPrompt: PropTypes.func,
  cameraDevices: PropTypes.array,
  selectedCameraDeviceId: PropTypes.string,
  setSelectedCameraDeviceId: PropTypes.func,
  selectedModel: PropTypes.string,
  setSelectedModel: PropTypes.func,
  numImages: PropTypes.number,
  setNumImages: PropTypes.func,
  promptGuidance: PropTypes.number,
  setPromptGuidance: PropTypes.func,
  controlNetStrength: PropTypes.number,
  setControlNetStrength: PropTypes.func,
  controlNetGuidanceEnd: PropTypes.number,
  setControlNetGuidanceEnd: PropTypes.func,
  flashEnabled: PropTypes.bool,
  setFlashEnabled: PropTypes.func,
  keepOriginalPhoto: PropTypes.bool,
  setKeepOriginalPhoto: PropTypes.func,
  showControlOverlay: PropTypes.bool,
  setShowControlOverlay: PropTypes.func,
  modelOptions: PropTypes.array,
  updateSetting: PropTypes.func,
  resetAllSettings: PropTypes.func
};

export default ControlPanel;
