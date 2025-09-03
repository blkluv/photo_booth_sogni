// PWA Installation Service
// Handles both native beforeinstallprompt and manual installation flows

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

class PWAInstallerService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstallable = false;
  private listeners: Array<(canInstall: boolean) => void> = [];

  constructor() {
    this.init();
  }

  private init() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA: beforeinstallprompt event fired');
      
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      // Store the event so it can be triggered later
      this.deferredPrompt = e;
      this.isInstallable = true;
      
      // Notify listeners that installation is available
      this.notifyListeners(true);
    });

    // Listen for the appinstalled event
    window.addEventListener('appinstalled', () => {
      console.log('PWA: App was installed');
      this.deferredPrompt = null;
      this.isInstallable = false;
      this.notifyListeners(false);
    });

    // Check if already installed
    if (this.isAlreadyInstalled()) {
      console.log('PWA: App is already installed');
      this.isInstallable = false;
    }
  }

  private notifyListeners(canInstall: boolean) {
    this.listeners.forEach(listener => listener(canInstall));
  }

  // Subscribe to installation availability changes
  public onInstallabilityChange(callback: (canInstall: boolean) => void) {
    this.listeners.push(callback);
    
    // Immediately call with current state
    callback(this.canInstall());
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Check if the app can be installed
  public canInstall(): boolean {
    return this.isInstallable && this.deferredPrompt !== null && !this.isAlreadyInstalled();
  }

  // Check if app is already installed
  public isAlreadyInstalled(): boolean {
    // Check if running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
    
    // Check for iOS standalone mode
    if ((window.navigator as Navigator & { standalone?: boolean })?.standalone === true) {
      return true;
    }
    
    return false;
  }

  // Trigger the native install prompt
  public async install(): Promise<{ outcome: 'accepted' | 'dismissed' | 'not_available'; platform?: string }> {
    if (!this.canInstall() || !this.deferredPrompt) {
      console.warn('PWA: Installation not available');
      return { outcome: 'not_available' };
    }

    try {
      // Show the install prompt
      await this.deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const choiceResult = await this.deferredPrompt.userChoice;
      
      console.log('PWA: User choice:', choiceResult.outcome);
      
      if (choiceResult.outcome === 'accepted') {
        console.log('PWA: User accepted the install prompt');
        this.deferredPrompt = null;
        this.isInstallable = false;
        this.notifyListeners(false);
      }
      
      return {
        outcome: choiceResult.outcome,
        platform: choiceResult.platform
      };
    } catch (error) {
      console.error('PWA: Error during installation:', error);
      return { outcome: 'dismissed' };
    }
  }

  // Get browser-specific installation info
  public getInstallationInfo() {
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
    const isEdge = /Edge/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    
    return {
      isIOS,
      isSafari,
      isChrome,
      isEdge,
      isFirefox,
      supportsNativeInstall: this.canInstall(),
      requiresManualInstall: isIOS && isSafari,
      isAlreadyInstalled: this.isAlreadyInstalled()
    };
  }

  // Force show manual installation instructions (for testing)
  public showManualInstructions(): boolean {
    const info = this.getInstallationInfo();
    return info.requiresManualInstall || !info.supportsNativeInstall;
  }
}

// Create singleton instance
export const pwaInstaller = new PWAInstallerService();

// Expose to window for testing
declare global {
  interface Window {
    pwaInstaller: PWAInstallerService;
    triggerPWAInstall: () => Promise<any>;
    showPWAPrompt: () => void;
    resetPWAPromptDismissal: () => void;
    checkPWAPromptStatus: () => { dismissed: boolean; installed: boolean; canInstall: boolean };
  }
}

// Make it globally accessible for testing
window.pwaInstaller = pwaInstaller;
window.triggerPWAInstall = () => pwaInstaller.install();

// Utility functions for testing
window.resetPWAPromptDismissal = () => {
  localStorage.removeItem('pwa-install-prompt-dismissed');
  console.log('PWA: Reset "Don\'t show again" setting - prompt can show again');
};

window.checkPWAPromptStatus = () => {
  const dismissed = localStorage.getItem('pwa-install-prompt-dismissed') === 'true';
  const installed = pwaInstaller.isAlreadyInstalled();
  const canInstall = pwaInstaller.canInstall();
  
  console.log('PWA Status:', {
    dismissed,
    installed,
    canInstall,
    info: pwaInstaller.getInstallationInfo()
  });
  
  return { dismissed, installed, canInstall };
};

// We'll set this up in the component
window.showPWAPrompt = () => {
  console.log('PWA: Manual prompt trigger - this will be implemented by the component');
};

export default pwaInstaller;
