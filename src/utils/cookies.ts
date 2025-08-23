import { Settings } from '../types/index';

export function getSettingFromCookie<T>(name: string, defaultValue: T): T {
  try {
    const value = localStorage.getItem(`sogni_${name}`);
    return value ? (JSON.parse(value) as T) : defaultValue;
  } catch (e) {
    console.warn(`Error reading cookie ${name}:`, e);
    return defaultValue;
  }
}

export function saveSettingsToCookies(settings: Partial<Settings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    try {
      localStorage.setItem(`sogni_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn(`Error saving setting ${key}:`, e);
    }
  });
}

// Promotional popup utilities
export function shouldShowPromoPopup(): boolean {
  try {
    const lastShown = localStorage.getItem('sogni_promo_last_shown');
    if (!lastShown) {
      return true; // Never shown before
    }
    
    const lastShownDate = new Date(lastShown);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return lastShownDate < oneDayAgo;
  } catch (e) {
    console.warn('Error checking promo popup status:', e);
    return true; // Default to showing if there's an error
  }
}

export function markPromoPopupShown(): void {
  try {
    localStorage.setItem('sogni_promo_last_shown', new Date().toISOString());
  } catch (e) {
    console.warn('Error marking promo popup as shown:', e);
  }
}

// Theme group preferences utilities
export function getThemeGroupPreferences(): Record<string, boolean> {
  try {
    const preferences = localStorage.getItem('sogni_theme_groups');
    if (preferences) {
      return JSON.parse(preferences) as Record<string, boolean>;
    }
  } catch (e) {
    console.warn('Error reading theme group preferences:', e);
  }
  return {}; // Return empty object if not found or error
}

export function saveThemeGroupPreferences(preferences: Record<string, boolean>): void {
  try {
    localStorage.setItem('sogni_theme_groups', JSON.stringify(preferences));
  } catch (e) {
    console.warn('Error saving theme group preferences:', e);
  }
} 