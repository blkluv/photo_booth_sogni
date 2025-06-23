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

  return (
    <div className="upload-progress-overlay">
      <div className="upload-progress-container">
        <div className="upload-progress-header">
          <h3>Uploading Your Photo</h3>
        </div>
        
        <div className="upload-progress-bar-container">
          <div className="upload-progress-bar">
            <div 
              className="upload-progress-fill"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="upload-progress-text">
            {Math.round(progress)}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadProgress; 