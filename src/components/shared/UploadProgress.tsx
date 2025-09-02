import React from 'react';
import './UploadProgress.css';

interface UploadProgressProps {
  progress: number; // 0-100
  isVisible: boolean;
  statusText?: string;
}

const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  isVisible,
}) => {
  if (!isVisible) return null;

  // Memoize the progress value to reduce unnecessary re-renders
  const memoizedProgress = React.useMemo(() => Math.min(progress, 100), [progress]);
  const memoizedProgressText = React.useMemo(() => Math.round(memoizedProgress), [memoizedProgress]);

  return (
    <div className="upload-progress-overlay">
      <div className="upload-progress-container">
        <div className="upload-progress-camera">
          <img src="/polaroid-camera2.jpg" alt="Polaroid Camera" className="camera-image" />
          <div className="camera-flash"></div>
        </div>
        
        <div className="upload-progress-header">
          <h3>📸 Developing Your Photo</h3>
          <p>Creating magic with AI...</p>
        </div>
        
        <div className="upload-progress-bar-container">
          <div className="upload-progress-bar">
            <div 
              className="upload-progress-fill"
              style={{ 
                // Use only transform for better performance on high-res displays
                transform: `scaleX(${memoizedProgress / 100})`,
                transformOrigin: 'left center'
              }}
            />
          </div>
          <div className="upload-progress-text">
            {memoizedProgressText}%
          </div>
        </div>
        
        <div className="upload-progress-dots">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
      </div>
    </div>
  );
};

export default UploadProgress; 