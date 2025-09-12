// Progress Overlay System for Image Conversion
class ProgressOverlay {
  constructor() {
    this.overlays = new Map(); // Track overlays by image element
    this.overlayId = 0;
    // Global bouncing logo (single instance that moves from image to image)
    this.bouncerEl = null;
    this.bouncerSize = 40; // px
    this.currentTargetImage = null;
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

    // Ensure and move global bouncer to this image's top-center
    this._ensureBouncer();
    this._moveBouncerTo(imageElement);

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

  // Add required CSS animations
  addAnimationStyles() {
    if (document.getElementById('sogni-progress-styles')) return;

    const style = document.createElement('style');
    style.id = 'sogni-progress-styles';
    style.textContent = `
      @keyframes sogni-bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-10px); }
        60% { transform: translateY(-5px); }
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

    // Reposition bouncer if we have a current target
    if (this.currentTargetImage && document.body.contains(this.currentTargetImage)) {
      this._moveBouncerTo(this.currentTargetImage);
    }
  }

  // Create the single bouncing logo if needed
  _ensureBouncer() {
    if (this.bouncerEl) return;
    const el = document.createElement('img');
    el.src = chrome.runtime.getURL('icons/logo.png');
    el.alt = 'Sogni Logo';
    el.id = 'sogni-global-bouncer';
    el.style.cssText = `
      position: absolute;
      width: ${this.bouncerSize}px;
      height: ${this.bouncerSize}px;
      left: 0; top: 0;
      transform: translate(-50%, -50%);
      z-index: 1000000;
      pointer-events: none;
      transition: left 300ms ease, top 300ms ease;
      animation: sogni-bounce 1.5s ease-in-out infinite;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
    `;
    document.body.appendChild(el);
    this.bouncerEl = el;
  }

  // Move the global bouncer to the top-center of the given image
  _moveBouncerTo(imageElement) {
    const prevTarget = this.currentTargetImage;
    this.currentTargetImage = imageElement;
    const rect = imageElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Position precisely at the horizontal center, accounting for logo width
    const centerX = rect.left + scrollLeft + rect.width / 2 - (this.bouncerSize / 2);
    const topY = rect.top + scrollTop - (this.bouncerSize * 0.8) - 8; // 8px higher above the image
    
    if (this.bouncerEl) {
      // If moving from one image to another, add dramatic vertical bounce
      if (prevTarget && prevTarget !== imageElement && document.body.contains(prevTarget)) {
        // First complete the horizontal movement to new position
        this.bouncerEl.style.transition = 'left 400ms ease-in-out';
        this.bouncerEl.style.left = `${centerX}px`;
        
        // After horizontal movement completes, do the bounce up then down
        setTimeout(() => {
          if (this.bouncerEl) {
            // Bounce up high
            this.bouncerEl.style.transition = 'top 200ms ease-out';
            this.bouncerEl.style.top = `${topY - 80}px`;
            
            // Then settle down with pronounced bounce
            setTimeout(() => {
              if (this.bouncerEl) {
                this.bouncerEl.style.transition = 'top 500ms cubic-bezier(0.68, -0.75, 0.265, 1.75)';
                this.bouncerEl.style.top = `${topY}px`;
              }
            }, 200);
          }
        }, 400);
      } else {
        // Normal positioning without bounce
        this.bouncerEl.style.transition = 'left 300ms ease, top 300ms ease';
        this.bouncerEl.style.left = `${centerX}px`;
        this.bouncerEl.style.top = `${topY}px`;
      }
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressOverlay;
} else {
  window.ProgressOverlay = ProgressOverlay;
}
