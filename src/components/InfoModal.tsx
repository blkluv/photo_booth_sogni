import React from 'react';
import '../styles/InfoModal.css';

interface InfoModalProps {
  onClose: () => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ onClose }) => {
  return (
    <div className="notes-modal-overlay" onClick={onClose}>
      <div className="notes-modal" onClick={e => e.stopPropagation()}>
        <div className="sticky-note marker-font">
          <button className="note-close" onClick={onClose}>&times;</button>
          <h2>Photobooth Tips</h2>
          <ul>
            <li>Position your face in the center of the frame for best results</li>
            <li>Ensure good lighting - natural light works best!</li>
            <li>Keep still while the photo is being taken</li>
            <li>Have fun and be creative with your expressions!</li>
          </ul>
          <div className="note-footer">
            <a 
              href="https://github.com/sogni-platform/sogni-client" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Powered by Sogni Client SDK
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoModal; 