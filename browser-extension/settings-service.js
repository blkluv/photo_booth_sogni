// Settings Service for Sogni Photobooth Extension
// Handles page-level settings storage and retrieval

class SettingsService {
  constructor() {
    this.storageKey = 'sogni_page_settings';
    this.globalSettingsKey = 'sogni_global_settings';
  }

  // Get the current page identifier (domain + path for specificity)
  getCurrentPageKey() {
    try {
      const url = new URL(window.location.href);
      // Use domain + pathname for page-specific settings
      // This allows different settings for different pages on the same site
      return `${url.hostname}${url.pathname}`;
    } catch (error) {
      console.error('Error getting page key:', error);
      return window.location.hostname || 'unknown';
    }
  }

  // Get the current domain identifier (for domain-wide settings)
  getCurrentDomainKey() {
    try {
      const url = new URL(window.location.href);
      return url.hostname;
    } catch (error) {
      console.error('Error getting domain key:', error);
      return window.location.hostname || 'unknown';
    }
  }

  // Save settings for the current page
  async savePageSettings(settings) {
    try {
      const pageKey = this.getCurrentPageKey();
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey], resolve);
      });

      const allPageSettings = result[this.storageKey] || {};
      allPageSettings[pageKey] = {
        ...settings,
        lastUpdated: Date.now(),
        url: window.location.href
      };

      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.storageKey]: allPageSettings }, resolve);
      });

      console.log(`Settings saved for page: ${pageKey}`, settings);
      return true;
    } catch (error) {
      console.error('Error saving page settings:', error);
      return false;
    }
  }

  // Load settings for the current page
  async loadPageSettings() {
    try {
      const pageKey = this.getCurrentPageKey();
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey], resolve);
      });

      const allPageSettings = result[this.storageKey] || {};
      const pageSettings = allPageSettings[pageKey];

      if (pageSettings) {
        console.log(`Settings loaded for page: ${pageKey}`, pageSettings);
        return pageSettings;
      } else {
        console.log(`No settings found for page: ${pageKey}`);
        return null;
      }
    } catch (error) {
      console.error('Error loading page settings:', error);
      return null;
    }
  }

  // Save domain-wide settings
  async saveDomainSettings(settings) {
    try {
      const domainKey = this.getCurrentDomainKey();
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey], resolve);
      });

      const allPageSettings = result[this.storageKey] || {};
      const domainSettingsKey = `domain:${domainKey}`;
      
      allPageSettings[domainSettingsKey] = {
        ...settings,
        lastUpdated: Date.now(),
        domain: domainKey
      };

      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.storageKey]: allPageSettings }, resolve);
      });

      console.log(`Domain settings saved for: ${domainKey}`, settings);
      return true;
    } catch (error) {
      console.error('Error saving domain settings:', error);
      return false;
    }
  }

  // Load domain-wide settings
  async loadDomainSettings() {
    try {
      const domainKey = this.getCurrentDomainKey();
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey], resolve);
      });

      const allPageSettings = result[this.storageKey] || {};
      const domainSettingsKey = `domain:${domainKey}`;
      const domainSettings = allPageSettings[domainSettingsKey];

      if (domainSettings) {
        console.log(`Domain settings loaded for: ${domainKey}`, domainSettings);
        return domainSettings;
      } else {
        console.log(`No domain settings found for: ${domainKey}`);
        return null;
      }
    } catch (error) {
      console.error('Error loading domain settings:', error);
      return null;
    }
  }

  // Save global settings (apply to all pages)
  async saveGlobalSettings(settings) {
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.globalSettingsKey]: {
          ...settings,
          lastUpdated: Date.now()
        }}, resolve);
      });

      console.log('Global settings saved:', settings);
      return true;
    } catch (error) {
      console.error('Error saving global settings:', error);
      return false;
    }
  }

  // Load global settings
  async loadGlobalSettings() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.globalSettingsKey], resolve);
      });

      const globalSettings = result[this.globalSettingsKey];
      if (globalSettings) {
        console.log('Global settings loaded:', globalSettings);
        return globalSettings;
      } else {
        console.log('No global settings found');
        return null;
      }
    } catch (error) {
      console.error('Error loading global settings:', error);
      return null;
    }
  }

  // Get the most appropriate settings for the current page
  // Priority: Page-specific > Domain-wide > Global > Default
  async loadBestSettings() {
    try {
      // Try page-specific settings first
      let settings = await this.loadPageSettings();
      if (settings) {
        console.log('Using page-specific settings');
        return { ...settings, source: 'page' };
      }

      // Try domain-wide settings
      settings = await this.loadDomainSettings();
      if (settings) {
        console.log('Using domain-wide settings');
        return { ...settings, source: 'domain' };
      }

      // Try global settings
      settings = await this.loadGlobalSettings();
      if (settings) {
        console.log('Using global settings');
        return { ...settings, source: 'global' };
      }

      console.log('No saved settings found, using defaults');
      return { source: 'default' };
    } catch (error) {
      console.error('Error loading best settings:', error);
      return { source: 'error' };
    }
  }

  // Get all saved settings for management/debugging
  async getAllSettings() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey, this.globalSettingsKey], resolve);
      });

      return {
        pageSettings: result[this.storageKey] || {},
        globalSettings: result[this.globalSettingsKey] || {}
      };
    } catch (error) {
      console.error('Error getting all settings:', error);
      return { pageSettings: {}, globalSettings: {} };
    }
  }

  // Clear settings for the current page
  async clearPageSettings() {
    try {
      const pageKey = this.getCurrentPageKey();
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([this.storageKey], resolve);
      });

      const allPageSettings = result[this.storageKey] || {};
      delete allPageSettings[pageKey];

      await new Promise((resolve) => {
        chrome.storage.local.set({ [this.storageKey]: allPageSettings }, resolve);
      });

      console.log(`Settings cleared for page: ${pageKey}`);
      return true;
    } catch (error) {
      console.error('Error clearing page settings:', error);
      return false;
    }
  }

  // Clear all settings (for debugging/reset)
  async clearAllSettings() {
    try {
      await new Promise((resolve) => {
        chrome.storage.local.remove([this.storageKey, this.globalSettingsKey], resolve);
      });

      console.log('All settings cleared');
      return true;
    } catch (error) {
      console.error('Error clearing all settings:', error);
      return false;
    }
  }

  // Export settings for backup
  async exportSettings() {
    try {
      const allSettings = await this.getAllSettings();
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        settings: allSettings
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting settings:', error);
      return null;
    }
  }

  // Import settings from backup
  async importSettings(jsonData) {
    try {
      const importData = JSON.parse(jsonData);
      
      if (!importData.settings) {
        throw new Error('Invalid settings format');
      }

      // Import page settings
      if (importData.settings.pageSettings) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ [this.storageKey]: importData.settings.pageSettings }, resolve);
        });
      }

      // Import global settings
      if (importData.settings.globalSettings) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ [this.globalSettingsKey]: importData.settings.globalSettings }, resolve);
        });
      }

      console.log('Settings imported successfully');
      return true;
    } catch (error) {
      console.error('Error importing settings:', error);
      return false;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsService;
} else {
  window.SettingsService = SettingsService;
}
