import React from 'react';
import '../../styles/components/MultiFaceDetectedModal.css';

interface MultiFaceDetectedModalProps {
  faceCount: number;
  onSwitchModel: () => void;
  onDismiss: () => void;
}

const MultiFaceDetectedModal: React.FC<MultiFaceDetectedModalProps> = ({
  faceCount,
  onSwitchModel,
  onDismiss,
}) => {
  return (
    <div className="multi-face-modal-overlay" onClick={onDismiss}>
      <div className="multi-face-modal" onClick={(e) => e.stopPropagation()}>
        <div className="multi-face-modal-icon">👥</div>
        <h3 className="multi-face-modal-title">Multiple Faces Detected</h3>
        <p className="multi-face-modal-message">
          We detected <strong>{faceCount} people</strong> in your photo.
          Your current model works best with single portraits. Would you like to switch to a model
          that preserves all faces?
        </p>
        <div className="multi-face-modal-buttons">
          <button className="multi-face-modal-btn multi-face-modal-btn-primary" onClick={onSwitchModel}>
            Yes, switch model
          </button>
          <button className="multi-face-modal-btn multi-face-modal-btn-secondary" onClick={onDismiss}>
            No, keep current
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiFaceDetectedModal;
