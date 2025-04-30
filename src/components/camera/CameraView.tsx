import React, { useRef, useEffect, useState } from 'react';
import styles from '../../styles/components/camera.module.css';

interface CameraViewProps {
  /** Video ref for the webcam stream */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Whether the camera is ready to take photos */
  isReady: boolean;
  /** Current countdown value (0 means no countdown) */
  countdown: number;
  /** Whether the shutter button is disabled */
  isDisabled?: boolean;
  /** Label to show on the shutter button */
  buttonLabel?: string;
  /** Handler for when the shutter button is clicked */
  onTakePhoto: () => void;
  /** Whether to show the photo grid */
  showPhotoGrid?: boolean;
  /** Current style selection */
  selectedStyle?: string;
  /** Handler for style selection */
  onStyleSelect?: (style: string) => void;
  /** Whether the settings overlay is visible */
  showSettings?: boolean;
  /** Handler for toggling settings */
  onToggleSettings?: () => void;
  /** Optional test ID for testing */
  testId?: string;
  /** Available style prompts */
  stylePrompts?: Record<string, string>;
  /** Custom prompt text */
  customPrompt?: string;
  /** Handler for custom prompt changes */
  onCustomPromptChange?: (prompt: string) => void;
  /** Camera devices list */
  cameraDevices?: MediaDeviceInfo[];
  /** Selected camera device ID */
  selectedCameraDeviceId?: string;
  /** Handler for camera selection */
  onCameraSelect?: (deviceId: string) => void;
  /** Model options */
  modelOptions?: Array<{ label: string; value: string; }>;
  /** Selected model */
  selectedModel?: string;
  /** Handler for model selection */
  onModelSelect?: (model: string) => void;
  /** Number of images */
  numImages?: number;
  /** Handler for number of images change */
  onNumImagesChange?: (num: number) => void;
  /** Prompt guidance value */
  promptGuidance?: number;
  /** Handler for prompt guidance change */
  onPromptGuidanceChange?: (value: number) => void;
  /** ControlNet strength value */
  controlNetStrength?: number;
  /** Handler for ControlNet strength change */
  onControlNetStrengthChange?: (value: number) => void;
  /** ControlNet guidance end value */
  controlNetGuidanceEnd?: number;
  /** Handler for ControlNet guidance end change */
  onControlNetGuidanceEndChange?: (value: number) => void;
  /** Flash enabled state */
  flashEnabled?: boolean;
  /** Handler for flash enabled change */
  onFlashEnabledChange?: (enabled: boolean) => void;
  /** Keep original photo state */
  keepOriginalPhoto?: boolean;
  /** Handler for keep original photo change */
  onKeepOriginalPhotoChange?: (keep: boolean) => void;
  /** Handler for settings reset */
  onResetSettings?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  videoRef,
  isReady,
  countdown,
  isDisabled = false,
  buttonLabel = 'Take Photo',
  onTakePhoto,
  showPhotoGrid = false,
  selectedStyle = '',
  onStyleSelect = () => {},
  showSettings = false,
  onToggleSettings = () => {},
  testId,
  stylePrompts = {},
  customPrompt = '',
  onCustomPromptChange,
  cameraDevices = [],
  selectedCameraDeviceId = '',
  onCameraSelect,
  modelOptions = [],
  selectedModel = '',
  onModelSelect,
  numImages = 16,
  onNumImagesChange,
  promptGuidance = 2,
  onPromptGuidanceChange,
  controlNetStrength = 0.8,
  onControlNetStrengthChange,
  controlNetGuidanceEnd = 0.6,
  onControlNetGuidanceEndChange,
  flashEnabled = true,
  onFlashEnabledChange,
  keepOriginalPhoto = false,
  onKeepOriginalPhotoChange,
  onResetSettings,
}) => {
  // State for style dropdown
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom');
  const styleButtonRef = useRef<HTMLButtonElement>(null);

  // Effect to handle clicks outside dropdown
  useEffect(() => {
    if (showStyleDropdown) {
      const handleClickOutside = (e: MouseEvent) => {
        if (styleButtonRef.current && !styleButtonRef.current.contains(e.target as Node)) {
          setShowStyleDropdown(false);
        }
      };
      
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showStyleDropdown]);

  // Toggle style dropdown with position calculation
  const toggleStyleDropdown = () => {
    if (showStyleDropdown) {
      setShowStyleDropdown(false);
      return;
    }

    if (styleButtonRef.current) {
      const buttonRect = styleButtonRef.current.getBoundingClientRect();
      const spaceAbove = buttonRect.top;
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      
      setDropdownPosition(spaceBelow > spaceAbove || spaceAbove < 350 ? 'bottom' : 'top');
    }
    
    setShowStyleDropdown(true);
  };

  // Helper function for style display with null check
  const styleIdToDisplay = (styleId: string | undefined | null) => {
    if (!styleId) return '';
    return styleId
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  // Render the bottom controls including style selector and shutter button
  const renderBottomControls = () => (
    <div className={styles.bottomControls}>
      {/* Style selector */}
      <div className={styles.styleSelector}>
        <button
          ref={styleButtonRef}
          className={`${styles.styleButton} bottom-style-select`}
          onClick={toggleStyleDropdown}
          data-testid="style-button"
        >
          <span className={styles.styleText}>
            {`Prompt: ${selectedStyle === 'custom' ? 'Custom...' : styleIdToDisplay(selectedStyle)}`}
          </span>
        </button>

        {/* Style dropdown */}
        {showStyleDropdown && (
          <div className={`${styles.styleDropdown} ${styles[`${dropdownPosition}Position`]}`}>
            <div className={styles.styleSectionFeatured}>
              {/* Featured options */}
              <div 
                className={`${styles.styleOption} ${selectedStyle === 'randomMix' ? styles.selected : ''}`}
                onClick={() => {
                  onStyleSelect('randomMix');
                  setShowStyleDropdown(false);
                }}
              >
                <span>🎲</span>
                <span>Random Mix</span>
              </div>
              
              <div 
                className={`${styles.styleOption} ${selectedStyle === 'random' ? styles.selected : ''}`}
                onClick={() => {
                  onStyleSelect('random');
                  setShowStyleDropdown(false);
                }}
              >
                <span>🔀</span>
                <span>Random</span>
              </div>
              
              <div 
                className={`${styles.styleOption} ${selectedStyle === 'custom' ? styles.selected : ''}`}
                onClick={() => {
                  onStyleSelect('custom');
                  setShowStyleDropdown(false);
                  onToggleSettings();
                }}
              >
                <span>✏️</span>
                <span>Custom...</span>
              </div>
            </div>
            
            <div className={styles.styleSectionRegular}>
              {Object.keys(stylePrompts)
                .filter(key => !['random', 'custom', 'randomMix'].includes(key))
                .sort()
                .map(styleKey => (
                  <div 
                    key={styleKey}
                    className={`${styles.styleOption} ${selectedStyle === styleKey ? styles.selected : ''}`}
                    onClick={() => {
                      onStyleSelect(styleKey);
                      setShowStyleDropdown(false);
                    }}
                  >
                    <span>{styleIdToDisplay(styleKey)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Shutter button */}
      <button
        className={`${styles.shutterButton} ${isDisabled ? styles.cooldown : ''}`}
        onClick={onTakePhoto}
        disabled={!isReady || isDisabled}
        data-testid="shutter-button"
      >
        <span className={styles.shutterDot} />
        <span className={styles.shutterLabel}>{buttonLabel}</span>
      </button>

      {/* Empty div to maintain spacing and symmetry */}
      <div className={styles.endSpacer} />
    </div>
  );

  return (
    <div 
      className={`${styles.cameraContainer}`}
      style={{
        display: showPhotoGrid ? 'none' : 'flex',
        visibility: showPhotoGrid ? 'hidden' : 'visible',
        opacity: showPhotoGrid ? 0 : 1,
        position: showPhotoGrid ? 'absolute' : 'relative',
        zIndex: showPhotoGrid ? -999 : 'auto',
      }}
      data-testid={testId || 'camera-container'}
    >
      <div className={styles.polaroidFrame}>
        {/* Title and settings in the polaroid top border */}
        <div className={styles.polaroidHeader}>
          <div className={styles.title}>
            SOGNI PHOTOBOOTH
          </div>
        </div>
        
        {/* Camera view */}
        <div className={styles.cameraView}>
          <video
            id="webcam"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.webcam}
            data-testid="webcam-video"
          />
          
          {countdown > 0 && (
            <div className={styles.countdownOverlay} data-testid="countdown">
              {countdown}
            </div>
          )}
          
          {/* Local flash effect removed - using global overlay instead */}
        </div>

        {/* Bottom controls */}
        {renderBottomControls()}
      </div>

      {/* Advanced Settings Overlay */}
      <div className={`control-overlay ${showSettings ? 'visible' : ''}`} style={{ position: 'fixed', zIndex: 99999 }}>
        <div className="control-overlay-content">
          <h2 className="settings-title">Advanced Settings</h2>
          
          <button 
            className="dismiss-overlay-btn"
            onClick={onToggleSettings}
          >
            ×
          </button>
          
          {/* Camera selector */}
          {cameraDevices.length > 0 && (
            <div className="control-option">
              <label className="control-label">Camera:</label>
              <select
                className="camera-select"
                onChange={(e) => onCameraSelect?.(e.target.value)}
                value={selectedCameraDeviceId || ''}
              >
                <option value="">Default (user-facing)</option>
                {cameraDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom prompt */}
          {selectedStyle === 'custom' && (
            <div className="control-option">
              <label className="control-label">Custom Style Prompt:</label>
              <textarea
                className="custom-style-input"
                placeholder="Enter your custom style prompt here..."
                value={customPrompt}
                onChange={(e) => onCustomPromptChange?.(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {/* Model selector */}
          <div className="control-option">
            <label className="control-label">Pick an Image Model:</label>
            <select
              className="model-select"
              value={selectedModel || ''}
              onChange={(e) => onModelSelect?.(e.target.value)}
            >
              {modelOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          {/* Number of Images slider */}
          <div className="control-option">
            <label className="control-label">Number of Images:</label>
            <input
              type="range"
              min={1}
              max={64}
              step={1}
              value={numImages}
              onChange={(e) => onNumImagesChange?.(Number(e.target.value))}
              className="slider-input"
            />
            <span className="slider-value">{numImages}</span>
          </div>

          {/* Prompt Guidance slider */}
          <div className="control-option">
            <label className="control-label">Prompt Guidance:</label>
            <input
              type="range"
              min={2}
              max={3}
              step={0.1}
              value={promptGuidance}
              onChange={(e) => onPromptGuidanceChange?.(Number(e.target.value))}
              className="slider-input"
            />
            <span className="slider-value">{promptGuidance.toFixed(1)}</span>
          </div>

          {/* Instant ID Strength slider */}
          <div className="control-option">
            <label className="control-label">Instant ID Strength:</label>
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.1}
              value={controlNetStrength}
              onChange={(e) => onControlNetStrengthChange?.(Number(e.target.value))}
              className="slider-input"
            />
            <span className="slider-value">{controlNetStrength.toFixed(1)}</span>
          </div>

          {/* Instant ID Impact Stop slider */}
          <div className="control-option">
            <label className="control-label">Instant ID Impact Stop:</label>
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.1}
              value={controlNetGuidanceEnd}
              onChange={(e) => onControlNetGuidanceEndChange?.(Number(e.target.value))}
              className="slider-input"
            />
            <span className="slider-value">{controlNetGuidanceEnd.toFixed(1)}</span>
          </div>

          {/* Flash toggle */}
          <div className="control-option checkbox">
            <input
              type="checkbox"
              id="flash-toggle"
              checked={flashEnabled}
              onChange={(e) => onFlashEnabledChange?.(e.target.checked)}
            />
            <label htmlFor="flash-toggle" className="control-label">Flash</label>
          </div>

          {/* Keep original photo toggle */}
          <div className="control-option checkbox">
            <input
              type="checkbox"
              id="keep-original-toggle"
              checked={keepOriginalPhoto}
              onChange={(e) => onKeepOriginalPhotoChange?.(e.target.checked)}
            />
            <label htmlFor="keep-original-toggle" className="control-label">Show Original Image</label>
          </div>
          
          {/* Reset settings button */}
          <div className="control-option reset-option">
            <button 
              className="reset-settings-btn"
              onClick={onResetSettings}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraView; 