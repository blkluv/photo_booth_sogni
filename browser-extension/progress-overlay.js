// Progress Overlay System for Image Conversion
class ProgressOverlay {
  constructor() {
    this.overlays = new Map(); // Track overlays by image element
    this.overlayId = 0;
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
    
    // Position overlay exactly over the image
    overlay.style.cssText = `
      position: absolute;
      top: ${rect.top + scrollTop}px;
      left: ${rect.left + scrollLeft}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
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

    // Create progress content
    const content = document.createElement('div');
    content.className = 'sogni-progress-content';
    content.style.cssText = `
      text-align: center;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
    `;

    // Pirate icon (using emoji for simplicity)
    const icon = document.createElement('div');
    icon.className = 'sogni-progress-icon';
    icon.textContent = '🏴‍☠️';
    icon.style.cssText = `
      font-size: 24px;
      margin-bottom: 8px;
      animation: sogni-spin 2s linear infinite;
    `;

    // Progress text
    const text = document.createElement('div');
    text.className = 'sogni-progress-text';
    text.textContent = 'Converting to Pirate...';
    text.style.cssText = `
      margin-bottom: 8px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    `;

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'sogni-progress-bar';
    progressBar.style.cssText = `
      width: 80%;
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 8px;
    `;

    const progressFill = document.createElement('div');
    progressFill.className = 'sogni-progress-fill';
    progressFill.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #ff6b35, #f7931e);
      width: 0%;
      transition: width 0.3s ease;
      border-radius: 2px;
    `;

    progressBar.appendChild(progressFill);

    // Status text
    const status = document.createElement('div');
    status.className = 'sogni-progress-status';
    status.textContent = 'Initializing...';
    status.style.cssText = `
      font-size: 12px;
      opacity: 0.8;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    `;

    // Assemble overlay
    content.appendChild(icon);
    content.appendChild(text);
    content.appendChild(progressBar);
    content.appendChild(status);
    overlay.appendChild(content);

    // Add CSS animations if not already added
    this.addAnimationStyles();

    // Add to page
    document.body.appendChild(overlay);

    // Store reference
    this.overlays.set(imageElement, {
      overlay,
      progressFill,
      status,
      text
    });

    return overlayId;
  }

  // Update progress for an image
  updateProgress(imageElement, progress, statusText = null) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { progressFill, status } = overlayData;

    // Update progress bar
    if (typeof progress === 'number') {
      progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    // Update status text
    if (statusText) {
      status.textContent = statusText;
    }
  }

  // Update overlay text
  updateText(imageElement, newText) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    overlayData.text.textContent = newText;
  }

  // Show error state
  showError(imageElement, errorMessage) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { overlay, text, status } = overlayData;

    // Change to error styling
    overlay.style.background = 'rgba(220, 38, 38, 0.8)';
    text.textContent = 'Conversion Failed';
    status.textContent = this._summarizeError(errorMessage);
    status.style.maxWidth = '85%';
    status.style.whiteSpace = 'normal';
    status.style.wordBreak = 'break-word';
    status.style.display = '-webkit-box';
    status.style.webkitLineClamp = '2';
    status.style.webkitBoxOrient = 'vertical';
    status.style.overflow = 'hidden';

    // Add hint to see console for details (non-intrusive)
    const hint = document.createElement('div');
    hint.className = 'sogni-error-hint';
    hint.textContent = 'See console for details';
    hint.style.cssText = `
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.75;
    `;
    overlay.querySelector('.sogni-progress-content')?.appendChild(hint);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      this.removeOverlay(imageElement);
    }, 3000);
  }

  // Show success state briefly before removing
  showSuccess(imageElement) {
    const overlayData = this.overlays.get(imageElement);
    if (!overlayData) return;

    const { overlay, text, status, progressFill } = overlayData;

    // Change to success styling
    overlay.style.background = 'transparent'; // Keep transparent
    text.textContent = 'Ahoy! Conversion Complete!';
    status.textContent = 'Complete!';
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

    const { overlay } = overlayData;
    
    // Fade out
    overlay.style.opacity = '0';
    
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
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
      @keyframes sogni-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
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
      const { overlay } = overlayData;
      const rect = imageElement.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      
      overlay.style.top = `${rect.top + scrollTop}px`;
      overlay.style.left = `${rect.left + scrollLeft}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressOverlay;
} else {
  window.ProgressOverlay = ProgressOverlay;
}
