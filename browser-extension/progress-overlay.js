// Progress Overlay System for Image Conversion
class ProgressOverlay {
  constructor() {
    this.overlays = new Map(); // Track overlays by image element
    this.overlayId = 0;
    // Multiple bouncing logos (one per concurrent slot)
    this.bouncers = []; // Array of bouncer objects: {element, targetImage, slotIndex}
    this.bouncerSize = 27; // px (increased by 1/3 for better visibility)
    this.maxConcurrentSlots = 8; // Match MAX_CONCURRENT_CONVERSIONS
  }

  // Create progress overlay for an image
  createOverlay(imageElement) {
    const overlayId = `sogni-overlay-${++this.overlayId}`;
    
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'sogni-progress-overlay';
    
    // Get image position and size
    const rect = imageElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Position overlay so content stays vertically centered on the image,
    // but reserve extra headroom above for the bouncing logo.
    overlay.style.cssText = `
      position: absolute;
      top: ${rect.top + scrollTop - 60}px;
      left: ${rect.left + scrollLeft}px;
      width: ${rect.width}px;
      height: ${rect.height + 60}px;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      border-radius: 8px;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;

    // Create icon holder (no text)
    const content = document.createElement('div');
    content.className = 'sogni-progress-content';
    content.style.cssText = `
      text-align: center;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
    `;

    // Assemble overlay (no icon here; we use one global bouncer)
    overlay.appendChild(content);

    // Create a separate progress bar below the image so the image is never obscured
    const barContainer = document.createElement('div');
    barContainer.className = 'sogni-progress-bar-below';
    barContainer.style.cssText = `
      position: absolute;
      top: ${rect.bottom + scrollTop + 8}px;
      left: ${rect.left + scrollLeft}px;
      width: ${rect.width}px;
      height: 6px;
      background: rgba(0,0,0,0.15);
      border-radius: 3px;
      overflow: hidden;
      z-index: 999999;
      pointer-events: none;
    `;

    const progressFill = document.createElement('div');
    progressFill.className = 'sogni-progress-fill';
    progressFill.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #ff61d5, #7132e8);
      width: 0%;
      transition: width 0.3s ease;
    `;
    barContainer.appendChild(progressFill);

    // Add CSS animations if not already added
    this.addAnimationStyles();

    // Add to page
    document.body.appendChild(overlay);
    document.body.appendChild(barContainer);

    // Store reference
    this.overlays.set(imageElement, {
      overlay,
      progressFill,
      barContainer
    });

    // Assign an available bouncer slot to this image
    this._assignBouncerToImage(imageElement);

    return overlayId;
  }

  // Update progress for an image
  updateProgress(imageElement, progress, statusText = null) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { progressFill } = overlayData;

    // Update progress bar
    if (typeof progress === 'number') {
      progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    // No status text in the new design
  }

  // Update overlay text
  updateText(imageElement, newText) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    // No text in new design
  }

  // Show error state
  showError(imageElement, errorMessage) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { overlay, barContainer } = overlayData;

    // Change to error styling on the bar
    if (barContainer) {
      barContainer.style.background = 'rgba(220, 38, 38, 0.3)';
    }

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.removeOverlay(imageElement);
    }, 3000);
  }

  // Show success state briefly before removing
  showSuccess(imageElement) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { overlay, progressFill, barContainer } = overlayData;

    // Change to success styling
    overlay.style.background = 'transparent'; // Keep transparent
    progressFill.style.width = '100%';

    // Remove immediately - no delay
    this.removeOverlay(imageElement);
  }

  // Reduce noisy backend errors to a concise, user-friendly message
  _summarizeError(message) {
    try {
      const msg = String(message || '').trim();
      if (!msg) return 'Unexpected error. Please retry.';
      const lower = msg.toLowerCase();
      if (lower.includes('invalid nonce')) return 'Temporary auth error. Please retry.';
      if (lower.includes('authentication') || lower.includes('auth')) return 'Authentication error. Please retry.';
      if (lower.includes('timeout')) return 'Server timeout. Please retry.';
      if (lower.includes('500') || lower.includes('internal server error')) return 'Server error. Please retry.';
      if (msg.length > 120) return msg.slice(0, 117) + '…';
      return msg;
    } catch (_) {
      return 'Unexpected error. Please retry.';
    }
  }

  // Remove overlay for an image
  removeOverlay(imageElement) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { overlay, barContainer } = overlayData;
    
    // Release the bouncer assigned to this image
    this._releaseBouncerFromImage(imageElement);
    
    // Fade out
    overlay.style.opacity = '0';
    
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (barContainer && barContainer.parentNode) barContainer.parentNode.removeChild(barContainer);
      this.overlays.delete(imageElement);
    }, 300);
  }

  // Remove all overlays
  removeAllOverlays() {
    for (const [imageElement] of this.overlays) {
      this.removeOverlay(imageElement);
    }
  }

  // Hide all bouncing logos
  hideAllBouncers() {
    // Hiding all bouncers
    
    this.bouncers.forEach((bouncer, index) => {
      if (bouncer.element) {
        // Fade out with staggered timing
        setTimeout(() => {
          if (bouncer.element) {
            bouncer.element.style.opacity = '0';
            bouncer.element.style.transform = 'translate(-50%, -50%) scale(0.5)';
            
            // Remove from DOM after fade
            setTimeout(() => {
              if (bouncer.element && bouncer.element.parentNode) {
                bouncer.element.parentNode.removeChild(bouncer.element);
              }
            }, 300);
          }
        }, index * 50); // Stagger the hiding
      }
    });
    
    // Clear the bouncers array
    this.bouncers = [];
  }

  // Add required CSS animations
  addAnimationStyles() {
    if (document.getElementById('sogni-progress-styles')) return;

    const style = document.createElement('style');
    style.id = 'sogni-progress-styles';
    style.textContent = `
      @keyframes sogni-bounce {
        0%, 20%, 50%, 80%, 100% { transform: translate(-50%, -50%) translateY(0); }
        40% { transform: translate(-50%, -50%) translateY(-10px); }
        60% { transform: translate(-50%, -50%) translateY(-5px); }
      }
      
      @keyframes sogni-bounce-complete {
        0% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.2); }
        100% { transform: translate(-50%, -50%) scale(1); }
      }
      
      .sogni-progress-overlay {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      }
      
      .sogni-progress-overlay * {
        box-sizing: border-box;
      }
    `;
    
    document.head.appendChild(style);
  }

  // Update overlay positions on scroll/resize
  updatePositions() {
    for (const [imageElement, overlayData] of this.overlays) {
      const { overlay, barContainer } = overlayData;
      const rect = imageElement.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      overlay.style.top = `${rect.top + scrollTop - 60}px`;
      overlay.style.left = `${rect.left + scrollLeft}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height + 60}px`;
      if (barContainer) {
        barContainer.style.top = `${rect.bottom + scrollTop + 8}px`;
        barContainer.style.left = `${rect.left + scrollLeft}px`;
        barContainer.style.width = `${rect.width}px`;
      }
    }

    // Reposition all active bouncers
    this.bouncers.forEach(bouncer => {
      if (bouncer.targetImage && document.body.contains(bouncer.targetImage)) {
        this._moveBouncerTo(bouncer, bouncer.targetImage);
      }
    });
  }

  // Assign an available bouncer to an image
  _assignBouncerToImage(imageElement) {
    // Find an available bouncer slot
    let availableBouncer = this.bouncers.find(bouncer => !bouncer.targetImage);
    
    if (!availableBouncer) {
      // Create a new bouncer if we haven't reached the limit
      if (this.bouncers.length < this.maxConcurrentSlots) {
        availableBouncer = this._createBouncer(this.bouncers.length);
        this.bouncers.push(availableBouncer);
      } else {
        console.warn('No available bouncer slots');
        return;
      }
    }
    
    // Assign this bouncer to the image
    availableBouncer.targetImage = imageElement;
    this._moveBouncerTo(availableBouncer, imageElement);
    
    // Bouncer assigned to image
  }

  // Release a bouncer from an image
  _releaseBouncerFromImage(imageElement) {
    const bouncer = this.bouncers.find(b => b.targetImage === imageElement);
    if (bouncer) {
      // Bouncer released from image
      
      // Show completion effect by changing number overlay to green
      if (bouncer.element) {
        const numberOverlay = bouncer.element.querySelector('div');
        if (numberOverlay) {
          numberOverlay.style.background = 'linear-gradient(45deg, #10b981, #059669)';
          numberOverlay.style.transform = 'scale(1.2)';
          
          // Reset after a moment, then check if this bouncer should be hidden
          setTimeout(() => {
            if (numberOverlay) {
              numberOverlay.style.background = 'linear-gradient(45deg, #6366f1, #8b5cf6)';
              numberOverlay.style.transform = 'scale(1)';
            }
            
            // Check if there are any more images that need processing for this bouncer to work on
            const hasMoreWork = this._hasMoreWorkForBouncer();
            if (!hasMoreWork) {
              // Hide this individual bouncer since there's no more work for it
              this._hideIndividualBouncer(bouncer);
            }
          }, 600);
        }
      }
      
      bouncer.targetImage = null;
    }
  }

  // Check if there are more images that need processing (for any bouncer to work on)
  _hasMoreWorkForBouncer() {
    // Count how many overlays (active processing images) still exist
    const activeOverlays = this.overlays.size;
    
    // Also check if there are more images waiting to be processed
    // We need to access the processing queue from the content script
    let remainingImages = 0;
    if (window.processingQueue && Array.isArray(window.processingQueue)) {
      remainingImages = window.processingQueue.length;
    }
    
    // There's more work if there are either active overlays or remaining images to process
    return activeOverlays > 0 || remainingImages > 0;
  }

  // Hide an individual bouncer when it has no more work to do
  _hideIndividualBouncer(bouncer) {
    if (bouncer.element) {
      console.log(`Hiding individual bouncer ${bouncer.slotIndex + 1} - no more work`);
      
      // Fade out this specific bouncer
      bouncer.element.style.opacity = '0';
      bouncer.element.style.transform = 'translate(-50%, -50%) scale(0.5)';
      
      // Remove from DOM after fade
      setTimeout(() => {
        if (bouncer.element && bouncer.element.parentNode) {
          bouncer.element.parentNode.removeChild(bouncer.element);
        }
        // Clear the bouncer element reference
        bouncer.element = null;
      }, 300);
    }
  }

  // Create a single bouncer element (Sogni logo with number)
  _createBouncer(slotIndex) {
    const container = document.createElement('div');
    container.className = 'sogni-slot-bouncer';
    container.id = `sogni-bouncer-${slotIndex}`;
    
    // Create the Sogni logo image
    const logoImg = document.createElement('img');
    logoImg.src = chrome.runtime.getURL('icons/logo.png');
    logoImg.alt = 'Sogni Logo';
    logoImg.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: contain;
    `;
    
    // Create number overlay
    const numberOverlay = document.createElement('div');
    numberOverlay.textContent = slotIndex + 1;
    numberOverlay.style.cssText = `
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 12px;
      height: 12px;
      background: linear-gradient(45deg, #6366f1, #8b5cf6);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 8px;
      font-weight: bold;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border: 1px solid white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    `;
    
    // Style the container - start off-screen but will be positioned immediately
    container.style.cssText = `
      position: absolute;
      width: ${this.bouncerSize}px;
      height: ${this.bouncerSize}px;
      left: -9999px; top: -9999px;
      transform: translate(-50%, -50%);
      z-index: 1000000;
      pointer-events: none;
      transition: left 800ms ease-in-out, top 800ms ease-in-out;
      animation: sogni-bounce 1.5s ease-in-out infinite;
      animation-delay: ${slotIndex * 0.1}s;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
      opacity: 1;
    `;
    
    // Assemble the bouncer
    container.appendChild(logoImg);
    container.appendChild(numberOverlay);
    
    document.body.appendChild(container);
    
    return {
      element: container,
      targetImage: null,
      slotIndex: slotIndex
    };
  }

  // Move a specific bouncer to the top-center of the given image
  _moveBouncerTo(bouncer, imageElement) {
    if (!bouncer.element) return;
    
    const prevTarget = bouncer.targetImage;
    const rect = imageElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Position precisely at the horizontal center, accounting for logo width
    const centerX = rect.left + scrollLeft + rect.width / 2;
    const topY = rect.top + scrollTop - (this.bouncerSize * 0.8) - 8 + 6; // 6px lower than previous position
    
    // If this is the first time positioning (no previous target), position immediately
    if (!prevTarget) {
      // Position immediately at target location (no animation from top-left)
      bouncer.element.style.transition = 'none'; // No transition for initial positioning
      bouncer.element.style.left = `${centerX}px`;
      bouncer.element.style.top = `${topY}px`;
      
      // Re-enable transitions for future movements
      setTimeout(() => {
        if (bouncer.element) {
          bouncer.element.style.transition = 'left 800ms ease-in-out, top 800ms ease-in-out';
        }
      }, 100);
    } else if (prevTarget && prevTarget !== imageElement && document.body.contains(prevTarget)) {
      // Moving from one image to another - use slower transitions
      // First complete the horizontal movement to new position
      bouncer.element.style.transition = 'left 1200ms ease-in-out';
      bouncer.element.style.left = `${centerX}px`;
      
      // After horizontal movement completes, do the bounce up then down
      setTimeout(() => {
        if (bouncer.element) {
          // Bounce up high
          bouncer.element.style.transition = 'top 600ms ease-out';
          bouncer.element.style.top = `${topY - 60}px`;
          
          // Then settle down with pronounced bounce
          setTimeout(() => {
            if (bouncer.element) {
              bouncer.element.style.transition = 'top 1000ms cubic-bezier(0.68, -0.75, 0.265, 1.75)';
              bouncer.element.style.top = `${topY}px`;
            }
          }, 600);
        }
      }, 1200);
    } else {
      // Normal positioning without bounce (but still slower)
      bouncer.element.style.transition = 'left 800ms ease-in-out, top 800ms ease-in-out';
      bouncer.element.style.left = `${centerX}px`;
      bouncer.element.style.top = `${topY}px`;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressOverlay;
} else {
  window.ProgressOverlay = ProgressOverlay;
}
