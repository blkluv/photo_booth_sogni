import React, { useState, useEffect } from 'react';
import './PWAInstallPrompt.css';
import { pwaInstaller } from '../../services/pwaInstaller';

interface PWAInstallPromptProps {
  onClose?: () => void;
  forceShow?: boolean; // For manual testing
}

const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ onClose, forceShow = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [canInstallNatively, setCanInstallNatively] = useState(false);
  const [installationInfo, setInstallationInfo] = useState(pwaInstaller.getInstallationInfo());

  // Check if user has already dismissed the prompt
  const hasBeenDismissed = () => {
    return localStorage.getItem('pwa-install-prompt-dismissed') === 'true';
  };

  useEffect(() => {
    // Only check for service worker updates once per session to avoid reload loops
    const hasCheckedForUpdates = sessionStorage.getItem('sw-update-checked');
    if ('serviceWorker' in navigator && !hasCheckedForUpdates) {
      sessionStorage.setItem('sw-update-checked', 'true');
      void navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          // Only update if there's actually an update available
          registration.addEventListener('updatefound', () => {
            console.log('Service worker update found');
          });
          void registration.update();
        }
      }).catch(error => {
        console.log('Service worker update failed:', error);
      });
    }

    // Subscribe to PWA installability changes
    const unsubscribe = pwaInstaller.onInstallabilityChange((canInstall) => {
      setCanInstallNatively(canInstall);
      setInstallationInfo(pwaInstaller.getInstallationInfo());
    });

    // Check if user has been permanently dismissed
    if (hasBeenDismissed()) {
      console.log('PWA install prompt permanently dismissed by user');
      return unsubscribe;
    }

    // Show prompt if conditions are met
    const shouldShow = forceShow || 
      (!installationInfo.isAlreadyInstalled && 
       (installationInfo.supportsNativeInstall || installationInfo.requiresManualInstall));

    if (shouldShow) {
      // For manual trigger, show immediately
      if (forceShow) {
        setIsVisible(true);
        return unsubscribe;
      }

      // For natural flow, wait 15 minutes (900,000 ms) before showing
      const FIFTEEN_MINUTES = 15 * 60 * 1000;
      console.log('PWA install prompt will show after 15 minutes of user activity');
      
      const timer = setTimeout(() => {
        // Double-check conditions before showing (user might have dismissed or installed in the meantime)
        if (!hasBeenDismissed() && !pwaInstaller.isAlreadyInstalled()) {
          console.log('Showing PWA install prompt after 15 minutes');
          setIsVisible(true);
        }
      }, FIFTEEN_MINUTES);

      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    }

    return unsubscribe;
  }, [forceShow]);

  const handleClose = () => {
    setIsClosing(true);
    
    // Store dismissal in localStorage
    localStorage.setItem('pwa-install-prompt-dismissed', 'true');
    
    // Animate out then hide
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose?.();
    }, 300);
  };

  const handleInstallLater = () => {
    // Just close for this session, don't store dismissal
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose?.();
    }, 300);
  };

  const handleNativeInstall = async () => {
    try {
      const result = await pwaInstaller.install();
      console.log('PWA installation result:', result);
      
      if (result.outcome === 'accepted') {
        // Installation successful, close the prompt
        handleClose();
      } else if (result.outcome === 'not_available') {
        // Fallback to manual instructions
        console.log('Native install not available, showing manual instructions');
      }
    } catch (error) {
      console.error('Error during PWA installation:', error);
    }
  };

  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking the background overlay, not the prompt itself
    if (e.target === e.currentTarget) {
      handleInstallLater();
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`pwa-install-overlay ${isClosing ? 'closing' : ''}`} onClick={handleBackgroundClick}>
      <div className={`pwa-install-prompt ${isClosing ? 'slide-out' : 'slide-in'}`}>
        <button className="pwa-install-close" onClick={handleClose}>
          ×
        </button>
        
        <div className="pwa-install-header">
          <div className="pwa-install-mascot">
            <img 
              src={`/slothicorn-camera.png?v=${Date.now()}`} 
              alt="Sogni Photobooth" 
              className="pwa-install-icon"
            />
          </div>
          <div className="pwa-install-title">
            <h3>Install Sogni Photobooth</h3>
            <p>Get the full app experience on your device!</p>
          </div>
        </div>

        <div className="pwa-install-content">
          <div className="pwa-install-benefits">
            <div className="pwa-benefit">
              <span className="pwa-benefit-icon">⚡</span>
              <span>Faster loading</span>
            </div>
            <div className="pwa-benefit">
              <span className="pwa-benefit-icon">🏠</span>
              <span>Home screen access</span>
            </div>
          </div>

          {canInstallNatively ? (
            // Native installation available (Chrome, Edge, etc.)
            <div className="pwa-install-native">
              <p className="pwa-steps-title">Click the button below to install:</p>
              <button className="pwa-install-button" onClick={() => void handleNativeInstall()}>
                <span className="pwa-install-button-icon">📱</span>
                Install App
              </button>
            </div>
          ) : installationInfo.requiresManualInstall ? (
            // Manual installation for iOS Safari
            <div className="pwa-install-steps">
              <p className="pwa-steps-title">To install:</p>
              <div className="pwa-step">
                <span className="pwa-step-number">1</span>
                <span>Tap the Share button</span>
                <span className="pwa-share-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                  </svg>
                </span>
              </div>
              <div className="pwa-step">
                <span className="pwa-step-number">2</span>
                <span>Select &quot;Add to Home Screen&quot;</span>
              </div>
              <div className="pwa-step">
                <span className="pwa-step-number">3</span>
                <span>Tap &quot;Add&quot; to confirm</span>
              </div>
            </div>
          ) : (
            // Fallback for other browsers
            <div className="pwa-install-fallback">
              <p className="pwa-steps-title">Installation not available in this browser.</p>
              <p>Try using Chrome, Edge, or Safari for the best experience.</p>
            </div>
          )}
        </div>

        <div className="pwa-install-actions">
          <button className="pwa-install-dismiss" onClick={handleClose}>
            Don&apos;t Show Again
          </button>
          <button className="pwa-install-later" onClick={handleInstallLater}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
