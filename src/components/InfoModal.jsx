import React from "react";
import PropTypes from 'prop-types';

const InfoModal = ({ showInfoModal, setShowInfoModal }) => {
  if (!showInfoModal) return null;
  return (
    <div
      className="notes-modal-overlay"
      style={{ zIndex: 30000 }}
      onClick={() => setShowInfoModal(false)}
    >
      <div className="notes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sticky-note">
          <button
            className="note-close"
            onClick={() => setShowInfoModal(false)}
          >
            ×
          </button>
          <h2 className="marker-font">Photobooth Tips</h2>
          <ul className="marker-font">
            <li>
              Generated compositions reuses the same face size, position, and
              orientation as the camera snapshot so step back and get creative!
            </li>
            <li>
              Only one face at a time! If multiple faces the biggest one in
              frame is used.
            </li>
            <li>
              The more light / dark depth on your face the better, flat even
              light results can be subpar.
            </li>
            <li>
              Try using the Custom Style feature and providing your own prompt!
            </li>
          </ul>
          <div className="note-footer">
            <a
              href="https://www.sogni.ai/sdk"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vibe Coded with Sogni Client SDK
              <br />
              Powered by Sogni Supernet ❤️
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

InfoModal.propTypes = {
  showInfoModal: PropTypes.bool,
  setShowInfoModal: PropTypes.func
};

export default InfoModal;
