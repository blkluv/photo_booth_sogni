import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const SuccessToast = ({ message, isVisible, onClose, duration = 4000 }) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    let timer;
    if (isVisible) {
      // Fade in and schedule auto-dismiss
      setIsAnimating(true);
      timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(onClose, 300); // Wait for fade out animation
      }, duration);
    } else if (isAnimating) {
      // Visibility toggled off externally: perform fade-out
      setIsAnimating(false);
      timer = setTimeout(onClose, 300);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isVisible, duration, onClose, isAnimating]);

  const handleClose = () => {
    // Start fade-out immediately and invoke onClose after animation
    setIsAnimating(false);
    setTimeout(onClose, 300);
  };

  if (!isVisible && !isAnimating) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
        color: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(76, 175, 80, 0.3)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        maxWidth: '400px',
        opacity: isAnimating ? 1 : 0,
        transform: isAnimating ? 'translateX(0)' : 'translateX(100%)',
        transition: 'all 0.3s ease-out',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(10px)'
      }}
      onClick={handleClose}
    >
      <div style={{ fontSize: '1.5rem' }}>✅</div>
      <div>
        <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '2px' }}>
          Success!
        </div>
        <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
          {message}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          color: 'white',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1rem',
          marginLeft: 'auto',
          transition: 'background 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.target.style.background = 'rgba(255, 255, 255, 0.3)';
        }}
        onMouseOut={(e) => {
          e.target.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        ×
      </button>
    </div>
  );
};

SuccessToast.propTypes = {
  message: PropTypes.string.isRequired,
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  duration: PropTypes.number
};

export default SuccessToast;
