import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * NetworkStatus component that shows connectivity status to users
 * Particularly useful for mobile users experiencing network issues
 */
const NetworkStatus = ({ onRetryAll }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineNotification, setShowOfflineNotification] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      console.log('Network: Device came back online');
      setIsOnline(true);
      
      if (wasOffline) {
        // Show "back online" notification briefly
        setShowOfflineNotification(true);
        setWasOffline(false);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
          setShowOfflineNotification(false);
        }, 3000);
      }
    };

    const handleOffline = () => {
      console.log('Network: Device went offline');
      setIsOnline(false);
      setWasOffline(true);
      setShowOfflineNotification(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine && !showOfflineNotification) {
      setIsOnline(false);
      setShowOfflineNotification(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline, showOfflineNotification]);

  // Auto-hide offline notification after 10 seconds when offline
  useEffect(() => {
    if (!isOnline && showOfflineNotification) {
      const timer = setTimeout(() => {
        setShowOfflineNotification(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [isOnline, showOfflineNotification]);

  const handleRetryClick = () => {
    if (onRetryAll && typeof onRetryAll === 'function') {
      onRetryAll();
    }
    setShowOfflineNotification(false);
  };

  const handleDismiss = () => {
    setShowOfflineNotification(false);
  };

  if (!showOfflineNotification) return null;

  return (
    <>
      <style>
        {`
          @keyframes networkStatusSlideDown {
            from {
              transform: translateX(-50%) translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateX(-50%) translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50000,
          backgroundColor: isOnline ? '#4CAF50' : '#f44336',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          maxWidth: '90vw',
          width: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          animation: 'networkStatusSlideDown 0.3s ease-out',
          fontWeight: '500',
          fontSize: '14px',
        }}
      >
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>
          {isOnline ? '✅' : '📶'}
        </span>
        <div>
          {isOnline ? (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                Back Online!
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                You can retry failed photos now
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                No Internet Connection
              </div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                Check your network and try again
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {isOnline && onRetryAll && (
          <button
            onClick={handleRetryClick}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            Retry All
          </button>
        )}
        
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '2px',
            lineHeight: 1,
            opacity: 0.8,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.opacity = '0.8';
          }}
        >
          ✕
        </button>
      </div>
    </div>
    </>
  );
};

NetworkStatus.propTypes = {
  onRetryAll: PropTypes.func,
};

export default NetworkStatus; 